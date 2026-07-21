-- ============================================================================
-- Multi-tenant migration (Milestone 1)
-- ============================================================================
-- Paste this into the Supabase Dashboard SQL Editor for the Finnly Dismissal
-- System project and run it top to bottom. It is written defensively
-- (IF NOT EXISTS / IF EXISTS everywhere) so it's safe to re-run if something
-- fails partway through.
--
-- BEFORE RUNNING: this repo's supabase/schema.sql is known to be stale versus
-- the live DB (e.g. it shows `settings.key` as the PK, but the app actually
-- queries `settings.id = 1`). Recommended: run the read-only check at the
-- bottom of this file's companion doc first, and sanity-check the column
-- list against what you see in the Table Editor, before trusting this blind.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1 — New tables
-- ----------------------------------------------------------------------------

create table if not exists nurseries (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  logo_url text,
  primary_color text not null default '#6B9BAF',
  secondary_color text not null default '#C49A45',
  background_color text not null default '#EAE5DF',
  pickup_countdown_seconds integer not null default 600,
  daily_reset_hour smallint not null default 19 check (daily_reset_hour between 0 and 23),
  timezone text not null default 'UTC',
  child_limit integer,
  last_reset_date date,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists super_admins (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);


-- ----------------------------------------------------------------------------
-- STEP 2 — ❗ EDIT ME: seed the Finnly nursery row
-- ----------------------------------------------------------------------------
-- Adjust slug/name/colors/timezone/reset hour to what you actually want before
-- running. slug is what will live at <slug>.technothera.com, so keep it
-- lowercase/URL-safe. timezone must be a real IANA name (e.g. 'Africa/Cairo',
-- 'Europe/London') — it's used later for the automatic daily reset.

insert into nurseries (slug, name, primary_color, secondary_color, background_color, pickup_countdown_seconds, daily_reset_hour, timezone)
values ('finnly', 'Finnly', '#6B9BAF', '#C49A45', '#EAE5DF', 600, 19, 'UTC')
on conflict (slug) do nothing;


-- ----------------------------------------------------------------------------
-- STEP 3 — Add nursery_id to every tenant-owned table, backfill, lock down
-- ----------------------------------------------------------------------------

alter table classes add column if not exists nursery_id uuid references nurseries(id) on delete cascade;
alter table children add column if not exists nursery_id uuid references nurseries(id) on delete cascade;
alter table staff_profiles add column if not exists nursery_id uuid references nurseries(id) on delete cascade;
alter table pickup_requests add column if not exists nursery_id uuid references nurseries(id) on delete cascade;

update classes set nursery_id = (select id from nurseries where slug = 'finnly') where nursery_id is null;
update children set nursery_id = (select id from nurseries where slug = 'finnly') where nursery_id is null;
update staff_profiles set nursery_id = (select id from nurseries where slug = 'finnly') where nursery_id is null;
update pickup_requests set nursery_id = (select id from nurseries where slug = 'finnly') where nursery_id is null;

alter table classes alter column nursery_id set not null;
alter table children alter column nursery_id set not null;
alter table staff_profiles alter column nursery_id set not null;
alter table pickup_requests alter column nursery_id set not null;

create index if not exists idx_classes_nursery on classes(nursery_id);
create index if not exists idx_children_nursery on children(nursery_id);
create index if not exists idx_staff_profiles_nursery on staff_profiles(nursery_id);
create index if not exists idx_pickup_requests_nursery on pickup_requests(nursery_id);

-- Note: the old singleton `settings` table (branch_name) is deliberately left
-- untouched here. It becomes dead once the app switches to nurseries.name in
-- Milestone 2, but we're not dropping it in this pass — no reason to make this
-- migration destructive when leaving it costs nothing.


-- ----------------------------------------------------------------------------
-- STEP 4 — RLS helper functions
-- ----------------------------------------------------------------------------
-- Mirrors the existing has_staff_profile()/is_staff()/is_admin() pattern
-- already in this project (see schema.sql), just adding tenant resolution.

create or replace function current_nursery_id()
returns uuid as $$
  select coalesce(
    (select nursery_id from staff_profiles where id = auth.uid()),
    (select nursery_id from children where parent_user_id = auth.uid() limit 1)
  )
$$ language sql security definer stable;

create or replace function is_super_admin()
returns boolean as $$
  select exists (select 1 from super_admins where id = auth.uid())
$$ language sql security definer stable;


-- ----------------------------------------------------------------------------
-- STEP 5 — Rewrite RLS policies to scope by nursery
-- ----------------------------------------------------------------------------
-- Every `drop policy if exists` + `create policy` pair below assumes the
-- policy names from schema.sql. If your project's actual policy names differ
-- (possible, given the drift already found), the drop is a harmless no-op but
-- you'd end up with an old ungated policy still present alongside the new one
-- — check `select policyname, tablename from pg_policies where schemaname
-- ='public'` afterward and remove any leftover cross-tenant-permissive policy
-- by name if so.

alter table nurseries enable row level security;
alter table super_admins enable row level security;

-- NURSERIES
drop policy if exists "Members read own nursery" on nurseries;
create policy "Members read own nursery" on nurseries
  for select using (id = current_nursery_id() or is_super_admin());

drop policy if exists "Nursery admin updates own nursery" on nurseries;
create policy "Nursery admin updates own nursery" on nurseries
  for update using (is_admin() and id = current_nursery_id())
  with check (is_admin() and id = current_nursery_id());

drop policy if exists "Super admin manages nurseries" on nurseries;
create policy "Super admin manages nurseries" on nurseries
  for all using (is_super_admin()) with check (is_super_admin());

-- SUPER ADMINS
drop policy if exists "Super admin reads own row" on super_admins;
create policy "Super admin reads own row" on super_admins
  for select using (id = auth.uid());

-- CLASSES
drop policy if exists "Staff profile reads classes" on classes;
create policy "Staff profile reads classes" on classes
  for select using (has_staff_profile() and nursery_id = current_nursery_id());

drop policy if exists "Admin manages classes" on classes;
create policy "Admin manages classes" on classes
  for all using ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin())
  with check ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin());

-- CHILDREN
drop policy if exists "Parent sees own child" on children;
create policy "Parent sees own child" on children
  for select using (parent_user_id = auth.uid());

drop policy if exists "Staff profile sees all children" on children;
create policy "Staff profile sees all children" on children
  for select using (has_staff_profile() and nursery_id = current_nursery_id());

drop policy if exists "Admin manages children" on children;
create policy "Admin manages children" on children
  for all using ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin())
  with check ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin());

-- STAFF PROFILES
drop policy if exists "Staff reads own profile" on staff_profiles;
create policy "Staff reads own profile" on staff_profiles
  for select using (id = auth.uid());

drop policy if exists "Admin manages staff" on staff_profiles;
create policy "Admin manages staff" on staff_profiles
  for all using ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin())
  with check ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin());

-- PICKUP REQUESTS
drop policy if exists "Parent inserts own pickup request" on pickup_requests;
create policy "Parent inserts own pickup request" on pickup_requests
  for insert with check (
    exists (select 1 from children where id = child_id and parent_user_id = auth.uid())
  );

drop policy if exists "Parent reads own pickup request" on pickup_requests;
create policy "Parent reads own pickup request" on pickup_requests
  for select using (
    exists (select 1 from children where id = child_id and parent_user_id = auth.uid())
  );

drop policy if exists "Parent updates arrived on own request" on pickup_requests;
create policy "Parent updates arrived on own request" on pickup_requests
  for update using (
    exists (select 1 from children where id = child_id and parent_user_id = auth.uid())
  )
  with check (status = 'arrived');

drop policy if exists "Staff profile reads all requests" on pickup_requests;
create policy "Staff profile reads all requests" on pickup_requests
  for select using (has_staff_profile() and nursery_id = current_nursery_id());

drop policy if exists "Staff updates request status" on pickup_requests;
create policy "Staff updates request status" on pickup_requests
  for update using (is_staff() and nursery_id = current_nursery_id());

drop policy if exists "Admin manages all requests" on pickup_requests;
create policy "Admin manages all requests" on pickup_requests
  for all using ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin())
  with check ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin());


-- ----------------------------------------------------------------------------
-- STEP 6 — ❗ Run manually once you have your own login user
-- ----------------------------------------------------------------------------
-- You need an existing auth.users row for yourself first (sign up once through
-- the app, or create the user via Dashboard > Authentication > Users), THEN
-- run this with your real email:
--
-- insert into super_admins (id)
-- select id from auth.users where email = 'yusuf.a.abdelatti@gmail.com'
-- on conflict do nothing;

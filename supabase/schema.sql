-- ============================================================================
-- Dismissal System — target schema reference (multi-tenant end state)
-- ============================================================================
-- This describes the schema shape the app expects once multi-tenancy is in
-- place. It is a REFERENCE, not something to run directly against the live
-- project — that project already has populated classes/children/
-- staff_profiles/pickup_requests tables, so plain CREATE TABLE here would
-- fail (or, worse, `insert` seed blocks would duplicate real data).
--
-- The actual applied path for the live project is
-- supabase/migrations/20260722000000_multi_tenant.sql, which ALTERs the
-- existing tables (adds nursery_id, backfills, rewrites RLS) instead of
-- creating them fresh. Re-generate this file from the live DB once that
-- migration has been applied, so it stops describing a hypothetical and
-- starts reflecting reality again.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";


-- ─────────────────────────────────────────────
-- TENANCY
-- ─────────────────────────────────────────────
create table nurseries (
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

create table super_admins (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- CLASSES
-- ─────────────────────────────────────────────
create table classes (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references nurseries(id) on delete cascade,
  name text not null,
  color text not null default '#6B7280',
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- CHILDREN
-- ─────────────────────────────────────────────
create table children (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references nurseries(id) on delete cascade,
  full_name text not null,
  class_id uuid references classes(id) on delete set null,
  parent_user_id uuid references auth.users(id) on delete cascade,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- STAFF PROFILES
-- ─────────────────────────────────────────────
create table staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nursery_id uuid not null references nurseries(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin', 'staff', 'display')),
  class_id uuid references classes(id) on delete set null,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- PICKUP REQUESTS  (core operational table)
-- ─────────────────────────────────────────────
create table pickup_requests (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references nurseries(id) on delete cascade,
  child_id uuid references children(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'ready', 'arrived', 'delivered', 'cleared')),
  requested_at timestamptz default now(),
  arrived_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  date date not null default current_date
);

-- ─────────────────────────────────────────────
-- PUSH SUBSCRIPTIONS
-- ─────────────────────────────────────────────
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription text not null,
  endpoint text not null,
  updated_at timestamptz default now(),
  unique (user_id, endpoint)
);

create index idx_classes_nursery on classes(nursery_id);
create index idx_children_nursery on children(nursery_id);
create index idx_staff_profiles_nursery on staff_profiles(nursery_id);
create index idx_pickup_requests_nursery on pickup_requests(nursery_id);
create index idx_pickup_requests_date on pickup_requests(date);
create index idx_pickup_requests_status on pickup_requests(status);
create index idx_pickup_requests_child on pickup_requests(child_id);
create index idx_push_subscriptions_user on push_subscriptions(user_id);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY HELPERS
-- ─────────────────────────────────────────────

create or replace function has_staff_profile()
returns boolean as $$
  select exists (select 1 from staff_profiles where id = auth.uid())
$$ language sql security definer stable;

create or replace function is_staff()
returns boolean as $$
  select exists (
    select 1 from staff_profiles
    where id = auth.uid() and role in ('admin', 'staff')
  )
$$ language sql security definer stable;

create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from staff_profiles where id = auth.uid() and role = 'admin'
  )
$$ language sql security definer stable;

-- Resolves the caller's nursery via staff_profiles (staff/admin/display) or,
-- failing that, via their linked child (parent).
create or replace function current_nursery_id()
returns uuid as $$
  select coalesce(
    (select nursery_id from staff_profiles where id = auth.uid()),
    (select nursery_id from children where parent_user_id = auth.uid() limit 1)
  )
$$ language sql security definer stable;

-- Cross-tenant operator account (you) — bypasses nursery scoping.
create or replace function is_super_admin()
returns boolean as $$
  select exists (select 1 from super_admins where id = auth.uid())
$$ language sql security definer stable;

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY POLICIES
-- ─────────────────────────────────────────────

alter table nurseries enable row level security;
alter table super_admins enable row level security;
alter table classes enable row level security;
alter table children enable row level security;
alter table staff_profiles enable row level security;
alter table pickup_requests enable row level security;
alter table push_subscriptions enable row level security;

-- NURSERIES: members read their own; nursery admin updates their own;
-- super admin manages all
create policy "Members read own nursery"
  on nurseries for select using (id = current_nursery_id() or is_super_admin());

create policy "Nursery admin updates own nursery"
  on nurseries for update
  using (is_admin() and id = current_nursery_id())
  with check (is_admin() and id = current_nursery_id());

create policy "Super admin manages nurseries"
  on nurseries for all using (is_super_admin()) with check (is_super_admin());

-- SUPER ADMINS: a user can check their own row only
create policy "Super admin reads own row"
  on super_admins for select using (id = auth.uid());

-- CLASSES: staff-profile holders read within their nursery; admin/super admin write
create policy "Staff profile reads classes"
  on classes for select using (has_staff_profile() and nursery_id = current_nursery_id());

create policy "Admin manages classes"
  on classes for all
  using ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin())
  with check ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin());

-- CHILDREN: parent sees own; staff-profile holders see all within their nursery; admin writes
create policy "Parent sees own child"
  on children for select using (parent_user_id = auth.uid());

create policy "Staff profile sees all children"
  on children for select using (has_staff_profile() and nursery_id = current_nursery_id());

create policy "Admin manages children"
  on children for all
  using ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin())
  with check ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin());

-- STAFF PROFILES: staff read own; admin manages within their nursery
create policy "Staff reads own profile"
  on staff_profiles for select using (id = auth.uid());

create policy "Admin manages staff"
  on staff_profiles for all
  using ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin())
  with check ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin());

-- PICKUP REQUESTS
create policy "Parent inserts own pickup request"
  on pickup_requests for insert
  with check (
    exists (select 1 from children where id = child_id and parent_user_id = auth.uid())
  );

create policy "Parent reads own pickup request"
  on pickup_requests for select
  using (
    exists (select 1 from children where id = child_id and parent_user_id = auth.uid())
  );

create policy "Parent updates arrived on own request"
  on pickup_requests for update
  using (
    exists (select 1 from children where id = child_id and parent_user_id = auth.uid())
  )
  with check (status = 'arrived');

create policy "Staff profile reads all requests"
  on pickup_requests for select using (has_staff_profile() and nursery_id = current_nursery_id());

create policy "Staff updates request status"
  on pickup_requests for update using (is_staff() and nursery_id = current_nursery_id());

create policy "Admin manages all requests"
  on pickup_requests for all
  using ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin())
  with check ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin());

-- PUSH SUBSCRIPTIONS: users manage only their own
create policy "Users manage own push subscriptions"
  on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- SEED DATA — first tenant on the platform
-- ─────────────────────────────────────────────
-- On the live project, Finnly's nursery row + nursery_id backfill for
-- existing classes/children/staff/requests is handled by the migration
-- (supabase/migrations/20260722000000_multi_tenant.sql), not by inserting
-- fresh rows here — those already exist.

-- ─────────────────────────────────────────────
-- SUPER ADMIN BOOTSTRAP
-- Run ONCE you've created your own login user (Dashboard > Authentication >
-- Users > Add User, or sign up through the app), replacing the email below.
-- ─────────────────────────────────────────────
-- insert into super_admins (id)
-- select id from auth.users where email = 'yusuf.a.abdelatti@gmail.com'
-- on conflict do nothing;

-- ─────────────────────────────────────────────
-- FIRST NURSERY ADMIN BOOTSTRAP
-- Run ONCE after creating the first staff user in Supabase Auth for Finnly.
-- ─────────────────────────────────────────────
-- insert into staff_profiles (id, nursery_id, display_name, role)
-- select u.id, n.id, 'Admin', 'admin'
-- from auth.users u, nurseries n
-- where u.email = 'admin@finnly.example' and n.slug = 'finnly'
-- limit 1;

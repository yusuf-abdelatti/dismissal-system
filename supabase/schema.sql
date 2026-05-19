-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- SETTINGS
-- ─────────────────────────────────────────────
create table settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

insert into settings (key, value) values ('branch_name', 'Our Nursery');

-- ─────────────────────────────────────────────
-- CLASSES
-- ─────────────────────────────────────────────
create table classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#6B7280',
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- CHILDREN
-- ─────────────────────────────────────────────
create table children (
  id uuid primary key default gen_random_uuid(),
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
  display_name text not null,
  role text not null check (role in ('admin', 'staff', 'display')),
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────
-- PICKUP REQUESTS  (core operational table)
-- ─────────────────────────────────────────────
create table pickup_requests (
  id uuid primary key default gen_random_uuid(),
  child_id uuid references children(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'ready', 'arrived', 'delivered', 'cleared')),
  requested_at timestamptz default now(),
  arrived_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  date date not null default current_date
);

create index idx_pickup_requests_date on pickup_requests(date);
create index idx_pickup_requests_status on pickup_requests(status);
create index idx_pickup_requests_child on pickup_requests(child_id);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────

alter table settings enable row level security;
alter table classes enable row level security;
alter table children enable row level security;
alter table staff_profiles enable row level security;
alter table pickup_requests enable row level security;

-- Helper: any account with a staff_profiles row (includes display)
create or replace function has_staff_profile()
returns boolean as $$
  select exists (
    select 1 from staff_profiles where id = auth.uid()
  );
$$ language sql security definer;

-- Helper: operational staff (admin or staff role, NOT display)
create or replace function is_staff()
returns boolean as $$
  select exists (
    select 1 from staff_profiles
    where id = auth.uid() and role in ('admin', 'staff')
  );
$$ language sql security definer;

-- Helper: admin only
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from staff_profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer;

-- SETTINGS: authenticated staff-profile holders read; admin writes
create policy "Staff profile reads settings"
  on settings for select using (has_staff_profile());

create policy "Admin manages settings"
  on settings for all using (is_admin());

-- CLASSES: staff-profile holders read; admin writes
create policy "Staff profile reads classes"
  on classes for select using (has_staff_profile());

create policy "Admin manages classes"
  on classes for all using (is_admin());

-- CHILDREN: parent sees own; staff-profile holders see all; admin writes
create policy "Parent sees own child"
  on children for select
  using (parent_user_id = auth.uid());

create policy "Staff profile sees all children"
  on children for select using (has_staff_profile());

create policy "Admin manages children"
  on children for all using (is_admin());

-- STAFF PROFILES: staff read own; admin manages all
create policy "Staff reads own profile"
  on staff_profiles for select using (id = auth.uid());

create policy "Admin manages staff"
  on staff_profiles for all using (is_admin());

-- PICKUP REQUESTS
create policy "Parent inserts own pickup request"
  on pickup_requests for insert
  with check (
    exists (
      select 1 from children
      where id = child_id and parent_user_id = auth.uid()
    )
  );

create policy "Parent reads own pickup request"
  on pickup_requests for select
  using (
    exists (
      select 1 from children
      where id = child_id and parent_user_id = auth.uid()
    )
  );

create policy "Parent updates arrived on own request"
  on pickup_requests for update
  using (
    exists (
      select 1 from children
      where id = child_id and parent_user_id = auth.uid()
    )
  )
  with check (status = 'arrived');

-- Display and operational staff read all requests
create policy "Staff profile reads all requests"
  on pickup_requests for select using (has_staff_profile());

-- Only operational staff (not display) can update status
create policy "Staff updates request status"
  on pickup_requests for update using (is_staff());

create policy "Admin manages all requests"
  on pickup_requests for all using (is_admin());

-- ─────────────────────────────────────────────
-- SEED DATA
-- ─────────────────────────────────────────────
insert into classes (name, color) values
  ('Lotus', '#7C3AED'),
  ('Rose', '#DB2777'),
  ('Lily', '#059669');

-- ─────────────────────────────────────────────
-- FIRST ADMIN BOOTSTRAP
-- Run ONCE after creating the first user in the Supabase Auth dashboard.
-- Replace the email below with the actual admin email.
-- ─────────────────────────────────────────────
-- insert into staff_profiles (id, display_name, role)
-- select id, 'Admin', 'admin'
-- from auth.users
-- where email = 'admin@yournursery.com'
-- limit 1;

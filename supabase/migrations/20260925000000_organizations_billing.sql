-- Multi-branch organizations + seat-based billing.
--
-- Purely additive: existing nurseries without an organization_id behave
-- exactly as before. Applied directly via the Supabase SQL Editor (see
-- 20260722030000_auto_reset.sql for precedent); recorded here for
-- history/reproducibility.

-- An organization is a paying customer that may span several linked
-- nurseries (branches). Every date/rate here is set manually per
-- organization and editable later — nothing is hardcoded to Finnly.
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  seat_limit integer,                                  -- shared cap across all linked nurseries; null = uncapped
  rate_per_seat_egp numeric(10,2) not null default 0,   -- EGP per active child per month
  billing_cycle_months integer not null default 3,
  billing_start_date date,                              -- usage before this date is never billed
  rate_locked_until date,                               -- informational: when the current rate expires
  created_at timestamptz default now()
);

alter table nurseries add column if not exists organization_id uuid references organizations(id) on delete set null;

create index idx_nurseries_organization on nurseries(organization_id);

-- One row per nursery per day, capturing that day's active-child count.
-- This is the only way to reconstruct an accurate historical average later —
-- children.is_active only ever reflects "right now", so every day this
-- doesn't run is a day of billing history that can never be recovered.
create table daily_seat_snapshots (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references nurseries(id) on delete cascade,
  snapshot_date date not null,
  active_children_count integer not null,
  created_at timestamptz default now(),
  unique (nursery_id, snapshot_date)
);

create index idx_daily_seat_snapshots_nursery_date on daily_seat_snapshots(nursery_id, snapshot_date);

-- Every generated statement is stored so its figures are frozen at
-- generation time — regenerating a past statement should never silently
-- produce a different number.
create table billing_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  rate_per_seat_egp numeric(10,2) not null,
  setup_fee_egp numeric(10,2),                          -- only set on the statement it applies to
  breakdown jsonb not null,                             -- per-branch + combined figures, frozen at generation
  total_due_egp numeric(10,2) not null,
  generated_at timestamptz default now()
);

alter table organizations enable row level security;
alter table daily_seat_snapshots enable row level security;
alter table billing_statements enable row level security;

-- Billing is an internal Technothera operation — super-admin only, never
-- exposed to a nursery's own admin panel.
create policy "Super admins manage organizations" on organizations
  for all using (is_super_admin()) with check (is_super_admin());

create policy "Super admins manage daily seat snapshots" on daily_seat_snapshots
  for all using (is_super_admin()) with check (is_super_admin());

create policy "Super admins manage billing statements" on billing_statements
  for all using (is_super_admin()) with check (is_super_admin());

-- Daily snapshot job, same security-definer + pg_cron pattern as
-- auto_reset_nurseries() above. Runs once a day for every nursery
-- regardless of organization linkage — cheap to capture for everyone, and
-- means the data is already there and proven correct by the time any
-- nursery actually gets linked to an organization.
create extension if not exists pg_cron;

create or replace function capture_daily_seat_snapshots()
returns void as $$
begin
  insert into daily_seat_snapshots (nursery_id, snapshot_date, active_children_count)
  select
    c.nursery_id,
    current_date,
    count(*) filter (where c.is_active)
  from children c
  group by c.nursery_id
  on conflict (nursery_id, snapshot_date)
  do update set active_children_count = excluded.active_children_count;
end;
$$ language plpgsql security definer;

select cron.schedule('capture-daily-seat-snapshots', '5 0 * * *', 'select capture_daily_seat_snapshots()');

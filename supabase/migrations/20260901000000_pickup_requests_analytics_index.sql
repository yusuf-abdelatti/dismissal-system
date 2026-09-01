-- Composite index to support Super Admin analytics: date-range aggregation
-- scoped to one nursery at a time (nursery_id + date range together).
-- Purely additive — no existing columns, constraints, or data are touched,
-- and it changes nothing about how any current feature reads or writes
-- pickup_requests.
--
-- Uses CONCURRENTLY so building it never locks the table against the
-- live parent/staff/display traffic that's already running against it.
-- CONCURRENTLY cannot run inside a transaction block, so if your migration
-- pipeline wraps each file in one, apply this statement by hand instead
-- (e.g. via the Supabase SQL editor), ideally outside busy hours.
create index concurrently if not exists idx_pickup_requests_nursery_requested_at
  on pickup_requests (nursery_id, requested_at);

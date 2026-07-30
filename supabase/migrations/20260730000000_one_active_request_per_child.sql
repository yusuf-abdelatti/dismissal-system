-- Prevents a duplicate active pickup_requests row from ever existing for the
-- same child (e.g. an accidental double-tap, or a stale/backgrounded tab
-- resubmitting). At most one non-terminal (not delivered/cleared) row per
-- child is allowed at the database level - a second insert attempt fails
-- with a constraint violation instead of silently creating a duplicate.
-- Applied directly via `supabase db query --linked` when diagnosed;
-- recorded here for history.

create unique index if not exists idx_one_active_request_per_child
on pickup_requests (child_id)
where status not in ('delivered', 'cleared');

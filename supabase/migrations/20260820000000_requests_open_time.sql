-- Optional per-nursery cutoff: parents can't submit a pickup request before
-- this local time each day. Null (the default) means no restriction — every
-- existing nursery keeps today's always-open behavior until an admin opts in
-- via Admin > Settings.
--
-- NOT YET APPLIED to the live project as of writing — this is the local,
-- reviewed version of the change. Apply with
-- `supabase db push --linked` (or `db query --linked` per this project's
-- existing convention) only when explicitly asked to deploy it.

alter table nurseries
  add column if not exists requests_open_time time;

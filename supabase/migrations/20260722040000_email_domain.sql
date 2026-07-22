-- Per-nursery email domain restriction for staff/parent account creation,
-- set by the super admin. Applied directly via `supabase db query --linked`
-- when built; recorded here for history/reproducibility.

alter table nurseries add column if not exists email_domain text;

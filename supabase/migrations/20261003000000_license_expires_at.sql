-- Lets Super Admin set a per-nursery license expiry date, which surfaces
-- as a warning banner in that nursery's Admin and Staff UI (never Parent
-- or Display). Null = no warning shown; this is effectively the "activate
-- the warning" switch described when the feature was designed.
alter table nurseries add column if not exists license_expires_at date;

-- Minimal payment tracking for billing statements — a checkbox, not a
-- financial system. No automated reminders/emails; the reminder is just a
-- banner shown when Super Admin opens the organization page.

alter table billing_statements add column if not exists paid boolean not null default false;
alter table billing_statements add column if not exists paid_at timestamptz;

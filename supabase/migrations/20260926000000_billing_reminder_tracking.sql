-- Tracks when a reminder email was last sent for a statement, so the
-- automated reminder job can space repeats out instead of emailing daily,
-- and so it has something to check against "paid" to know when to stop.
alter table billing_statements add column if not exists last_reminder_sent_at timestamptz;

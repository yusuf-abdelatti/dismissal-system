-- Draft statements: auto-created when a billing cycle ends, but not
-- treated as real/final until a human reviews and confirms them. Only
-- confirmed (non-draft) unpaid statements are ever reminded about.
alter table billing_statements add column if not exists is_draft boolean not null default false;

-- Extra recipient emails per organization, typed once in Super Admin and
-- reused for every future reminder — e.g. the nursery owner's own email,
-- added alongside the fixed internal Technothera addresses.
alter table organizations add column if not exists additional_recipient_emails text;

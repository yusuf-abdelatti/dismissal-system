-- Pilot feedback form (technothera.com-level tool, not scoped to a single
-- nursery) — public, unauthenticated submission from
-- demo.technothera.com/dismissal-feedback, sent to any nursery at the end
-- of its pilot phase. Full answer set lives in `answers` (jsonb) so the
-- form itself can evolve between nurseries/pilots without a migration each
-- time; a handful of fields are pulled out as real columns because they're
-- the ones actually worth filtering/aggregating on directly.

create table dismissal_feedback_responses (
  id uuid primary key default gen_random_uuid(),
  nursery_name text not null,
  role text,
  overall_satisfaction smallint,
  reliability_rating smallint,
  adds_real_value text,
  continue_using text,
  answers jsonb not null,
  submitted_at timestamptz default now()
);

create index idx_dismissal_feedback_nursery on dismissal_feedback_responses(nursery_name);

alter table dismissal_feedback_responses enable row level security;

-- Public can submit (the form is intentionally unauthenticated); only a
-- super admin can read submissions back, so one nursery's staff can't see
-- another's raw feedback even if they found the table via the anon key.
create policy "Anyone can submit feedback"
  on dismissal_feedback_responses for insert
  with check (true);

create policy "Super admin reads feedback"
  on dismissal_feedback_responses for select
  using (is_super_admin());

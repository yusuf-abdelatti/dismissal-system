-- Idle-screen image rotation for the display board: a small, admin-managed
-- gallery shown only while there are zero active pickup requests (with a
-- 5-minute settle delay before it reappears, handled client-side). Video was
-- considered and deliberately dropped — images only, to keep Supabase
-- free-tier storage/egress usage predictable.
--
-- NOT YET APPLIED to the live project as of writing — recorded here for
-- review. Apply with the project's existing `supabase db query --linked`
-- convention only when explicitly asked to deploy it.

create table nursery_idle_images (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references nurseries(id) on delete cascade,
  storage_path text not null,
  url text not null,
  position integer not null default 0,
  created_at timestamptz default now()
);

create index idx_nursery_idle_images_nursery on nursery_idle_images(nursery_id);

alter table nursery_idle_images enable row level security;

-- Same shape as the existing "classes" policies: any staff-profile holder
-- (including the display role) reads within their own nursery; admin writes.
create policy "Staff profile reads idle images"
  on nursery_idle_images for select using (has_staff_profile() and nursery_id = current_nursery_id());

create policy "Admin manages idle images"
  on nursery_idle_images for all
  using ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin())
  with check ((is_admin() and nursery_id = current_nursery_id()) or is_super_admin());

-- Storage bucket. Public read (same as nursery-logos, and for the same
-- reason: the display board itself may run unauthenticated/kiosk-style).
-- Unlike nursery-logos, this bucket also grants delete — admins removing an
-- image (or replacing the rotation) need to actually free the storage slot,
-- not just orphan the old file.
insert into storage.buckets (id, name, public)
values ('nursery-idle-media', 'nursery-idle-media', true)
on conflict (id) do nothing;

drop policy if exists "Admins upload idle images" on storage.objects;
create policy "Admins upload idle images" on storage.objects
  for insert with check (bucket_id = 'nursery-idle-media' and (is_admin() or is_super_admin()));

drop policy if exists "Admins delete idle images" on storage.objects;
create policy "Admins delete idle images" on storage.objects
  for delete using (bucket_id = 'nursery-idle-media' and (is_admin() or is_super_admin()));

drop policy if exists "Public reads idle images" on storage.objects;
create policy "Public reads idle images" on storage.objects
  for select using (bucket_id = 'nursery-idle-media');

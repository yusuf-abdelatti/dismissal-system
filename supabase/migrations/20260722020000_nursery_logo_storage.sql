-- Storage bucket for nursery logos, uploaded via the super-admin console.
-- Applied directly against the linked project via `supabase db query --linked`
-- when this was built; recorded here for history/reproducibility.

insert into storage.buckets (id, name, public)
values ('nursery-logos', 'nursery-logos', true)
on conflict (id) do nothing;

drop policy if exists "Admins upload nursery logos" on storage.objects;
create policy "Admins upload nursery logos" on storage.objects
  for insert with check (bucket_id = 'nursery-logos' and (is_admin() or is_super_admin()));

drop policy if exists "Admins update nursery logos" on storage.objects;
create policy "Admins update nursery logos" on storage.objects
  for update using (bucket_id = 'nursery-logos' and (is_admin() or is_super_admin()));

drop policy if exists "Public reads nursery logos" on storage.objects;
create policy "Public reads nursery logos" on storage.objects
  for select using (bucket_id = 'nursery-logos');

-- Lets a parent cancel their own pickup request (e.g. pressed by mistake)
-- while it's still 'requested' or 'ready', by allowing them to set it to
-- 'cleared' — same terminal status already used by end-of-day resets, so no
-- schema/status-enum change needed. Applied directly via
-- `supabase db query --linked` when built; recorded here for history.

drop policy if exists "Parent updates arrived on own request" on pickup_requests;
create policy "Parent updates own active request" on pickup_requests
  for update using (
    exists (select 1 from children where id = child_id and parent_user_id = auth.uid())
    and status in ('requested', 'ready')
  )
  with check (status in ('arrived', 'cleared'));

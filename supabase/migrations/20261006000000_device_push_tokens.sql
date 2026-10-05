-- Native (FCM / APNs) push tokens for the installed Finnly Staff and Finnly
-- Parent store apps. Additive only: push_subscriptions (Web Push for the
-- browser/PWA) is untouched and keeps working as before.
--
-- One row per installed app per device. The token is unique, so a device
-- that changes hands is re-claimed by whoever logs in last (same rule the
-- web push path applies to push_subscriptions).

create table if not exists device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  -- Bundle ID (iOS) / application ID (Android) of the app that issued the
  -- token. APNs requires it as the topic, and the staff and parent apps
  -- have different IDs.
  app_id text not null,
  token text not null unique,
  updated_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_id_idx on device_push_tokens (user_id);

alter table device_push_tokens enable row level security;

drop policy if exists "Users read own device push tokens" on device_push_tokens;
create policy "Users read own device push tokens" on device_push_tokens
  for select using (user_id = auth.uid());

drop policy if exists "Users delete own device push tokens" on device_push_tokens;
create policy "Users delete own device push tokens" on device_push_tokens
  for delete using (user_id = auth.uid());

-- No insert/update policies on purpose: writes go through the two functions
-- below, which re-claim a token for the current user the same way the web
-- path re-claims a push endpoint.

create or replace function claim_device_push_token(p_token text, p_platform text, p_app_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'invalid platform';
  end if;
  if p_token is null or length(p_token) = 0 or p_app_id is null or length(p_app_id) = 0 then
    raise exception 'token and app_id are required';
  end if;

  insert into device_push_tokens (user_id, platform, app_id, token, updated_at)
  values (auth.uid(), p_platform, p_app_id, p_token, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        app_id = excluded.app_id,
        updated_at = now();
end;
$$;

create or replace function release_device_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from device_push_tokens
  where token = p_token and user_id = auth.uid();
$$;

revoke execute on function claim_device_push_token(text, text, text) from public, anon;
revoke execute on function release_device_push_token(text) from public, anon;
grant execute on function claim_device_push_token(text, text, text) to authenticated;
grant execute on function release_device_push_token(text) to authenticated;

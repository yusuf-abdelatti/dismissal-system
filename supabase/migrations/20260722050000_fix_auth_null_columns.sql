-- Fixes a system-wide login outage: a manually-inserted auth.users row
-- (recreating the super-admin account after it was accidentally deleted)
-- left several varchar columns as NULL. Supabase Auth's Go code scans these
-- as non-nullable strings, so any NULL in these columns broke password
-- login for every account, not just the affected row. Applied directly via
-- `supabase db query --linked` when diagnosed; recorded here for history.

update auth.users set
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  reauthentication_token = coalesce(reauthentication_token, ''),
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, '')
where email_change is null
   or email_change_token_new is null
   or phone_change is null
   or phone_change_token is null
   or email_change_token_current is null
   or reauthentication_token is null
   or confirmation_token is null
   or recovery_token is null;

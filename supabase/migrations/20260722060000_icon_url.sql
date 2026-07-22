-- Separate PWA/app icon (square, 512x512) from the general logo_url used in
-- the login page, admin sidebar, display header, etc. Applied directly via
-- `supabase db query --linked` when built; recorded here for history.

alter table nurseries add column if not exists icon_url text;

-- Lets each nursery set a shorter name to show under the home-screen icon
-- once the PWA is installed, separate from the full `name` used everywhere
-- else in the app (display board, staff app, parent app, login page).
-- Purely additive: nullable column, no default, no existing data touched.
-- Falls back to `name` wherever it's blank (handled in application code).

alter table nurseries add column if not exists pwa_short_name text;

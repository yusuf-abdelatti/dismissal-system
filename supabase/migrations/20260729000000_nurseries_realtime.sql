-- The nurseries table was never added to the realtime publication, so no
-- postgres_changes subscription against it (old or new) could ever actually
-- receive events - this is why settings changes (countdown, colors, etc.)
-- never propagated to already-open sessions. Applied directly via
-- `supabase db query --linked` when diagnosed; recorded here for history.

alter publication supabase_realtime add table nurseries;

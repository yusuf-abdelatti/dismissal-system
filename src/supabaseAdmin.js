import { createClient } from '@supabase/supabase-js'

// This client uses the service role key and bypasses RLS.
// It is imported only by admin interface files.
// In a larger production deployment, move these operations to Supabase Edge Functions
// so the service role key never leaves the server.
export const supabaseAdmin = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

import { createClient } from '@supabase/supabase-js'

// Server-only module (lives under /api, never under /src) — safe to use the
// service-role key here since Vercel serverless functions never ship their
// code to the browser.

const ROOT_DOMAINS = ['technothera.com']

// Resolves a nursery slug from the request Host header.
//   finnly.technothera.com   -> "finnly"
//   technothera.com / www.*  -> null (apex — reserved for the super-admin console)
//   finnly.localhost:3000    -> "finnly" (local dev via `vercel dev`)
//   localhost:3000           -> null
export function parseSlugFromHost(hostHeader) {
  if (!hostHeader) return null
  const host = hostHeader.split(':')[0].toLowerCase()

  if (host === 'localhost' || host.endsWith('.localhost')) {
    const parts = host.split('.')
    return parts.length > 1 ? parts[0] : null
  }

  for (const root of ROOT_DOMAINS) {
    if (host === root || host === `www.${root}`) return null
    if (host.endsWith(`.${root}`)) {
      return host.slice(0, host.length - root.length - 1)
    }
  }

  return null
}

let adminClient = null
function getAdminClient() {
  if (!adminClient) {
    adminClient = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return adminClient
}

const NURSERY_FIELDS =
  'id, slug, name, logo_url, primary_color, secondary_color, background_color, pickup_countdown_seconds, is_active'

// `?slug=` query override lets a plain (non-subdomain) preview/dev URL still
// pick a tenant for testing without needing wildcard DNS set up yet.
export async function getNurseryForRequest(req) {
  const slug = req.query?.slug || parseSlugFromHost(req.headers.host)
  if (!slug) return null

  const { data, error } = await getAdminClient()
    .from('nurseries')
    .select(NURSERY_FIELDS)
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data || !data.is_active) return null
  return data
}

export function toPublicNursery(nursery) {
  return {
    id: nursery.id,
    slug: nursery.slug,
    name: nursery.name,
    logoUrl: nursery.logo_url,
    primaryColor: nursery.primary_color,
    secondaryColor: nursery.secondary_color,
    backgroundColor: nursery.background_color,
    pickupCountdownSeconds: nursery.pickup_countdown_seconds,
  }
}

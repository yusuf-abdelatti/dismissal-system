import { getNurseryForRequest, toPublicNursery } from './_lib/tenant.js'

// Origins a Capacitor WebView sends. Same-origin web requests never send an
// Origin header that differs from the host, so this only opens the endpoint
// to the native shells (staff / parent store apps), which call it cross-origin
// to resolve a nursery code on first launch.
const NATIVE_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost']

export default async function handler(req, res) {
  // Vary on every response so a CDN never serves a cached response that is
  // missing the CORS header to a native request (or vice versa).
  res.setHeader('Vary', 'Origin')
  const origin = req.headers.origin
  if (origin && NATIVE_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.status(204).end()
    return
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300')

  const nursery = await getNurseryForRequest(req)
  if (!nursery) {
    res.status(404).json({ error: 'Unknown nursery' })
    return
  }

  res.status(200).json(toPublicNursery(nursery))
}

import { getNurseryForRequest } from './_lib/tenant.js'

function guessMimeType(url) {
  const ext = url?.split('.').pop()?.split('?')[0]?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'svg') return 'image/svg+xml'
  return 'image/png'
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
  res.setHeader('Content-Type', 'application/manifest+json')

  const nursery = await getNurseryForRequest(req)

  const name = nursery?.name || 'Dismissal System'
  const icon = nursery?.logo_url || '/icon.png'
  const iconType = guessMimeType(icon)

  res.status(200).send(
    JSON.stringify({
      name,
      short_name: name,
      start_url: '/',
      display: 'standalone',
      background_color: nursery?.background_color || '#EAE5DF',
      theme_color: nursery?.primary_color || '#6B9BAF',
      icons: [
        { src: icon, sizes: '192x192', type: iconType },
        { src: icon, sizes: '512x512', type: iconType },
      ],
    })
  )
}

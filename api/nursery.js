import { getNurseryForRequest, toPublicNursery } from './_lib/tenant.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300')

  const nursery = await getNurseryForRequest(req)
  if (!nursery) {
    res.status(404).json({ error: 'Unknown nursery' })
    return
  }

  res.status(200).json(toPublicNursery(nursery))
}

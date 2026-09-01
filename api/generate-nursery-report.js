import { createClient } from '@supabase/supabase-js'
import { buildAnalyticsPdf } from './_lib/analyticsPdf.js'
import {
  computeOverview,
  computeTrend,
  computePeakPeriod,
  computePrepTime,
  computeArrivalExperience,
  computeDelay,
  computeClassBreakdown,
  computeInsights,
  pickGranularity,
} from '../src/utils/analytics.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' })
    return
  }

  const { nurseryId, from, to } = req.body || {}
  if (!nurseryId || !from || !to) {
    res.status(400).json({ error: 'nurseryId, from and to are required' })
    return
  }

  // Scoped to the caller's own JWT, not a service-role key — every query
  // below runs under the same RLS rules the browser already enforces, so
  // this endpoint can only ever see what the calling account is actually
  // allowed to see.
  const callerClient = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: userError } = await callerClient.auth.getUser()
  if (userError || !user) {
    res.status(401).json({ error: 'Invalid session' })
    return
  }

  const { data: superAdminRow } = await callerClient.from('super_admins').select('id').eq('id', user.id).maybeSingle()
  if (!superAdminRow) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const [{ data: nursery }, { data: requests }, { data: children }, { data: classes }] = await Promise.all([
    callerClient.from('nurseries').select('id, name, pickup_countdown_seconds').eq('id', nurseryId).maybeSingle(),
    callerClient
      .from('pickup_requests')
      .select('id, child_id, date, requested_at, ready_at, arrived_at, delivered_at')
      .eq('nursery_id', nurseryId)
      .gte('date', from)
      .lte('date', to),
    callerClient.from('children').select('id, class_id, is_active').eq('nursery_id', nurseryId),
    callerClient.from('classes').select('id, name, color').eq('nursery_id', nurseryId).order('name'),
  ])

  if (!nursery) {
    res.status(404).json({ error: 'Nursery not found' })
    return
  }

  const expectedSeconds = nursery.pickup_countdown_seconds || 0
  const overview = computeOverview({ requests: requests || [], children: children || [] })
  const granularity = pickGranularity(from, to)
  const trend = computeTrend(requests || [], granularity)
  const peak = computePeakPeriod(requests || [])
  const prepTime = computePrepTime(requests || [], expectedSeconds)
  const arrival = computeArrivalExperience(requests || [])
  const delay = computeDelay(requests || [], expectedSeconds)
  const classBreakdown = computeClassBreakdown(requests || [], children || [], classes || [], expectedSeconds)
  const insights = computeInsights({ overview, prepTime, peak, classBreakdown, delay })

  const pdfBuffer = await buildAnalyticsPdf({
    nursery,
    dateFrom: from,
    dateTo: to,
    overview,
    trend,
    granularity,
    peak,
    prepTime,
    arrival,
    delay,
    classBreakdown,
    insights,
  })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${nursery.name.replace(/[^a-z0-9]+/gi, '-')}-report-${from}-to-${to}.pdf"`)
  res.status(200).send(pdfBuffer)
}

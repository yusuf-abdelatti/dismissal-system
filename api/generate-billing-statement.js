import { createClient } from '@supabase/supabase-js'
import { buildBillingStatementPdf } from './_lib/billingStatementPdf.js'
import { computeBillingBreakdown } from '../src/utils/billing.js'

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

  // Scoped to the caller's own JWT — every query below runs under the same
  // RLS rules the browser already enforces (organizations/billing tables
  // are super-admin-only), so this endpoint can only ever do what the
  // calling account is actually allowed to do.
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

  const { statementId, organizationId, periodStart, periodEnd, months, setupFeeEgp } = req.body || {}

  // Re-rendering a previously generated statement: read the frozen
  // breakdown back out rather than recomputing, so a re-download can never
  // produce a different number than the one originally issued.
  if (statementId) {
    const { data: statement } = await callerClient.from('billing_statements').select('*').eq('id', statementId).maybeSingle()
    if (!statement) {
      res.status(404).json({ error: 'Statement not found' })
      return
    }
    const { data: organization } = await callerClient.from('organizations').select('name').eq('id', statement.organization_id).maybeSingle()

    const pdfBuffer = await buildBillingStatementPdf({
      organization: organization || { name: 'Organization' },
      breakdown: statement.breakdown,
      generatedAt: statement.generated_at,
    })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="statement-${statement.period_start}-to-${statement.period_end}.pdf"`)
    res.status(200).send(pdfBuffer)
    return
  }

  if (!organizationId || !periodStart || !periodEnd || !months) {
    res.status(400).json({ error: 'organizationId, periodStart, periodEnd and months are required' })
    return
  }

  const [{ data: organization }, { data: nurseries }] = await Promise.all([
    callerClient.from('organizations').select('*').eq('id', organizationId).maybeSingle(),
    callerClient.from('nurseries').select('id, name').eq('organization_id', organizationId),
  ])

  if (!organization) {
    res.status(404).json({ error: 'Organization not found' })
    return
  }

  const nurseryIds = (nurseries || []).map((n) => n.id)
  const { data: snapshots } = nurseryIds.length
    ? await callerClient
        .from('daily_seat_snapshots')
        .select('nursery_id, snapshot_date, active_children_count')
        .in('nursery_id', nurseryIds)
        .gte('snapshot_date', periodStart)
        .lte('snapshot_date', periodEnd)
    : { data: [] }

  const breakdown = computeBillingBreakdown({
    organization,
    nurseries: nurseries || [],
    snapshots: snapshots || [],
    periodStart,
    periodEnd,
    months: Number(months),
    setupFeeEgp: setupFeeEgp ? Number(setupFeeEgp) : 0,
  })

  const generatedAt = new Date().toISOString()

  const { error: insertError } = await callerClient.from('billing_statements').insert({
    organization_id: organizationId,
    period_start: periodStart,
    period_end: periodEnd,
    rate_per_seat_egp: organization.rate_per_seat_egp,
    setup_fee_egp: breakdown.setupFeeEgp || null,
    breakdown,
    total_due_egp: breakdown.totalDue,
    generated_at: generatedAt,
  })

  if (insertError) {
    res.status(500).json({ error: 'Could not save the statement record' })
    return
  }

  const pdfBuffer = await buildBillingStatementPdf({ organization, breakdown, generatedAt })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="statement-${periodStart}-to-${periodEnd}.pdf"`)
  res.status(200).send(pdfBuffer)
}

import { createClient } from '@supabase/supabase-js'
import { computeBillingBreakdown } from '../src/utils/billing.js'

// Same fixed internal recipients as the payment-reminder job — this is a
// "come review this" nudge to Technothera, not something sent to a nursery.
const NOTIFY_RECIPIENTS = ['technothera@gmail.com', 'yusuf.a.abdelatti@gmail.com']
const FROM_ADDRESS = 'Technothera <billing@technothera.com>'

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function notifyDraftReady({ organizationName, periodStart, periodEnd, totalDue }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: NOTIFY_RECIPIENTS,
      subject: `Draft statement ready for review — ${organizationName} (${periodStart} → ${periodEnd})`,
      text: `A new billing period ended for ${organizationName} (${periodStart} to ${periodEnd}), so a draft statement was created automatically.

Estimated total: ${fmt(totalDue)} EGP

This is a draft only — nothing has been sent to the nursery yet. Review it in Super Admin → Organizations, edit anything that needs adjusting (e.g. a one-time setup fee), then confirm it to finalize and download the PDF.`,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend API error ${res.status}: ${body}`)
  }
}

function addMonthsMinusDay(dateStr, months) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setMonth(d.getMonth() + months)
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}
function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: organizations, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .not('billing_start_date', 'is', null)

  if (orgError) {
    res.status(500).json({ error: orgError.message })
    return
  }

  const today = todayStr()
  const created = []
  const skipped = []

  for (const organization of organizations || []) {
    const { data: nurseries } = await supabase.from('nurseries').select('id, name').eq('organization_id', organization.id)
    if (!nurseries?.length) {
      skipped.push({ organizationId: organization.id, reason: 'no linked branches' })
      continue
    }

    // The next period to bill starts right after the latest statement
    // (draft or confirmed) we already have, or at billing_start_date if
    // there's none yet.
    const { data: latest } = await supabase
      .from('billing_statements')
      .select('period_end')
      .eq('organization_id', organization.id)
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle()

    const cycleMonths = organization.billing_cycle_months || 3
    const nextStart = latest ? addDays(latest.period_end, 1) : organization.billing_start_date
    const nextEnd = addMonthsMinusDay(nextStart, cycleMonths)

    // Only once the period has fully elapsed — never draft a statement for
    // a period that hasn't finished yet.
    if (today <= nextEnd) {
      skipped.push({ organizationId: organization.id, reason: 'current period not finished yet', nextStart, nextEnd })
      continue
    }

    const nurseryIds = nurseries.map((n) => n.id)
    const { data: snapshots } = await supabase
      .from('daily_seat_snapshots')
      .select('nursery_id, snapshot_date, active_children_count')
      .in('nursery_id', nurseryIds)
      .gte('snapshot_date', nextStart)
      .lte('snapshot_date', nextEnd)

    const breakdown = computeBillingBreakdown({
      organization,
      nurseries,
      snapshots: snapshots || [],
      periodStart: nextStart,
      periodEnd: nextEnd,
      months: cycleMonths,
      setupFeeEgp: 0, // never auto-assumed — added manually on review if it applies
    })

    const { error: insertError } = await supabase.from('billing_statements').insert({
      organization_id: organization.id,
      period_start: nextStart,
      period_end: nextEnd,
      rate_per_seat_egp: organization.rate_per_seat_egp,
      setup_fee_egp: null,
      breakdown,
      total_due_egp: breakdown.totalDue,
      is_draft: true,
    })

    if (insertError) {
      skipped.push({ organizationId: organization.id, reason: insertError.message })
      continue
    }

    let notifyError = null
    try {
      await notifyDraftReady({
        organizationName: organization.name,
        periodStart: nextStart,
        periodEnd: nextEnd,
        totalDue: breakdown.totalDue,
      })
    } catch (err) {
      // The draft itself is already saved — a failed notification email
      // shouldn't be treated as the whole operation failing, just reported.
      notifyError = err.message
    }

    created.push({ organizationId: organization.id, periodStart: nextStart, periodEnd: nextEnd, notifyError })
  }

  res.status(200).json({ created, skipped })
}

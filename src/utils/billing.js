// Shared billing math for organizations (multi-branch customers) — used by
// both the Super Admin dashboard (browser) and the statement PDF endpoint
// (Vercel/Node), so they can never disagree on a number. No Supabase calls
// here, just data in, numbers out.

// Averages one nursery's daily active-seat count over a date range, clamped
// to the organization's billing_start_date so usage before the contract
// started is never counted even if a snapshot exists for it.
export function computeBranchAverage(snapshots, nurseryId, periodStart, periodEnd, billingStartDate) {
  const effectiveStart = billingStartDate && billingStartDate > periodStart ? billingStartDate : periodStart
  const relevant = snapshots.filter(
    (s) => s.nursery_id === nurseryId && s.snapshot_date >= effectiveStart && s.snapshot_date <= periodEnd
  )

  if (relevant.length === 0) return { avgSeats: 0, daysCounted: 0 }

  const avg = relevant.reduce((sum, s) => sum + s.active_children_count, 0) / relevant.length
  return { avgSeats: avg, daysCounted: relevant.length }
}

// `months` is deliberately a separate, explicit input rather than derived
// from (periodEnd - periodStart) — a raw day-count division produces messy
// fractional months (e.g. 3.03) that don't match the plain "avg x rate x 3
// months" formula shown to the customer. The admin sets it directly.
export function computeBillingBreakdown({ organization, nurseries, snapshots, periodStart, periodEnd, months, setupFeeEgp }) {
  const branches = nurseries.map((n) => {
    const { avgSeats, daysCounted } = computeBranchAverage(
      snapshots,
      n.id,
      periodStart,
      periodEnd,
      organization.billing_start_date
    )
    const subtotal = avgSeats * organization.rate_per_seat_egp * months
    return { nurseryId: n.id, name: n.name, avgSeats, daysCounted, subtotal }
  })

  const combinedAvgSeats = branches.reduce((s, b) => s + b.avgSeats, 0)
  const recurringTotal = branches.reduce((s, b) => s + b.subtotal, 0)
  const setup = setupFeeEgp || 0

  return {
    periodStart,
    periodEnd,
    months,
    rate: organization.rate_per_seat_egp,
    seatLimit: organization.seat_limit ?? null,
    branches,
    combinedAvgSeats,
    recurringTotal,
    setupFeeEgp: setup,
    totalDue: recurringTotal + setup,
  }
}

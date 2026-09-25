// Shared billing math for organizations (multi-branch customers) — used by
// both the Super Admin dashboard (browser) and the statement PDF endpoint
// (Vercel/Node), so they can never disagree on a number. No Supabase calls
// here, just data in, numbers out.

// Averages one nursery's daily active-seat count over exactly the date
// range given — no clamping to billing_start_date here. An earlier version
// silently pulled periodStart forward to billing_start_date, which meant
// picking any period before that date always computed against zero rows
// (since no data exists yet for dates that haven't happened), even when
// real snapshot data existed for part of the range. The admin sets these
// dates manually and should see exactly what the data says for them;
// whether a period predates the contract's billing start is a judgment
// call for whoever generates the statement, surfaced as a visible note in
// the UI (see hasPreBillingDates below) rather than enforced by quietly
// zeroing the calculation.
export function computeBranchAverage(snapshots, nurseryId, periodStart, periodEnd) {
  const relevant = snapshots.filter(
    (s) => s.nursery_id === nurseryId && s.snapshot_date >= periodStart && s.snapshot_date <= periodEnd
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
    const { avgSeats, daysCounted } = computeBranchAverage(snapshots, n.id, periodStart, periodEnd)
    const subtotal = avgSeats * organization.rate_per_seat_egp * months
    return { nurseryId: n.id, name: n.name, avgSeats, daysCounted, subtotal }
  })

  const combinedAvgSeats = branches.reduce((s, b) => s + b.avgSeats, 0)
  const recurringTotal = branches.reduce((s, b) => s + b.subtotal, 0)
  const setup = setupFeeEgp || 0

  // Informational only — surfaced in the UI as a visible note, never used
  // to alter the calculation itself.
  const startsBeforeBilling = !!(organization.billing_start_date && periodStart < organization.billing_start_date)

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
    startsBeforeBilling,
  }
}

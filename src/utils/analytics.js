// Pure, framework-agnostic analytics calculations shared by the Super Admin
// dashboard (browser) and the PDF report endpoint (Vercel/Node) — no
// Supabase calls or browser-only APIs here, just data in, numbers out.

// Plain-language explanations, written for a nursery owner/manager rather
// than a developer. Shared between the dashboard's tap-to-explain buttons
// and the PDF's inline notes so the two can never say different things
// about what a number means.
export const METRIC_EXPLANATIONS = {
  enrolledChildren: 'Children currently registered at this nursery.',
  activeChildren: 'Enrolled children who had at least one pickup request in this period — i.e., families actually using the app.',
  totalRequests: 'How many times parents requested a pickup during this period.',
  activeDays: "Days with at least one pickup request. Days with none — weekends, holidays, closures — are left out automatically, so they don't drag the numbers down.",
  avgPerActiveDay: "Total requests divided by active days only, so closed days don't make the average look lower than it really is.",
  peakPeriod: 'The 30-minute window with the most pickup requests — the busiest time of day for dismissal.',
  delayedRequests: "How many pickups took longer than the nursery's target time (set in Settings) before the child was marked Ready or handed over.",
  usageTrend: "How many pickup requests happened each day (or week, for longer periods). Days with no activity aren't shown, so gaps don't count against the average.",
  prepExpected: "The nursery's own goal for how long it should take to get a child ready after a pickup request — set in Settings.",
  prepActual: 'The real average time from a pickup request to the child being marked Ready.',
  delayExceeded: 'Pickups that took longer than the target time before the child was marked Ready or handed over.',
  delayAverage: 'Among only the delayed pickups, how far past the target they ran, on average.',
  arrivalHandoff: 'Time from a parent tapping "I Have Arrived" to the child actually being handed over. This relies on parents using that button, so treat it as an estimate, not an exact figure.',
  classChildren: 'Children enrolled in this class.',
  classActive: "This class's children who had at least one pickup request in this period.",
  classRequests: 'Total pickup requests made for children in this class.',
  classAvgPrep: 'Average time to get a child from this class ready after a pickup was requested.',
  classDelayed: "Pickups for this class that took longer than the nursery's target time.",
}

function toDateOnly(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toDateOnly(d)
}

export const DATE_RANGE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 Days' },
  { key: 'month', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: '3months', label: 'Last 3 Months' },
  { key: 'custom', label: 'Custom Range' },
]

// Returns {from, to} as inclusive 'YYYY-MM-DD' calendar dates. Deliberately
// uses the browser's own local calendar (not per-nursery timezone math) —
// the system currently only operates in Cairo, and pickup activity never
// happens overnight, so the UTC/local boundary mismatch on the `date`
// column never falls on a day with real requests. Revisit if a nursery
// outside this timezone is ever onboarded.
export function getPresetRange(preset, customFrom, customTo) {
  const today = toDateOnly(new Date())

  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case '7d':
      return { from: addDays(today, -6), to: today }
    case 'month': {
      const d = new Date(`${today}T00:00:00`)
      return { from: toDateOnly(new Date(d.getFullYear(), d.getMonth(), 1)), to: today }
    }
    case 'lastMonth': {
      const d = new Date(`${today}T00:00:00`)
      const firstOfThisMonth = new Date(d.getFullYear(), d.getMonth(), 1)
      const lastMonthEnd = new Date(firstOfThisMonth)
      lastMonthEnd.setDate(0)
      const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1)
      return { from: toDateOnly(lastMonthStart), to: toDateOnly(lastMonthEnd) }
    }
    case '3months':
      return { from: addDays(today, -89), to: today }
    case 'custom':
      return { from: customFrom || today, to: customTo || today }
    default:
      return { from: today, to: today }
  }
}

function secondsBetween(startIso, endIso) {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000
}

function average(nums) {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

// Only counts a day as "active" (operational) if at least one request was
// actually made — weekends/holidays/closures disappear on their own,
// without needing to be configured anywhere.
export function activeDates(requests) {
  return [...new Set(requests.map((r) => r.date))].sort()
}

export function computeOverview({ requests, children }) {
  const enrolled = children.filter((c) => c.is_active !== false)
  const activeChildIds = new Set(requests.map((r) => r.child_id))
  const days = activeDates(requests)

  return {
    totalChildren: enrolled.length,
    activeChildren: activeChildIds.size,
    totalRequests: requests.length,
    activeDaysCount: days.length,
    avgPerActiveDay: days.length ? requests.length / days.length : 0,
    adoptionRate: enrolled.length ? activeChildIds.size / enrolled.length : 0,
  }
}

// Short ranges get a daily bar per active day; longer ranges collapse into
// weekly buckets so the chart stays readable instead of a wall of thin bars.
export function pickGranularity(dateFrom, dateTo) {
  const days = (new Date(`${dateTo}T00:00:00`) - new Date(`${dateFrom}T00:00:00`)) / 86400000 + 1
  return days > 45 ? 'weekly' : 'daily'
}

function isoWeekLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  const day = (d.getDay() + 6) % 7 // Monday = 0
  const monday = new Date(d)
  monday.setDate(d.getDate() - day)
  return toDateOnly(monday)
}

function formatShortDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Trend only ever includes days that actually had requests — an empty
// weekend/holiday simply isn't a point on the chart, so it can't drag down
// the visual average or look like a usage dip that never happened.
export function computeTrend(requests, granularity) {
  const buckets = new Map()

  for (const r of requests) {
    const key = granularity === 'weekly' ? isoWeekLabel(r.date) : r.date
    buckets.set(key, (buckets.get(key) || 0) + 1)
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, count]) => ({
      key,
      label: granularity === 'weekly' ? `Week of ${formatShortDate(key)}` : formatShortDate(key),
      count,
    }))
}

function formatClockLabel(minutesSinceMidnight) {
  const h24 = Math.floor(minutesSinceMidnight / 60)
  const m = minutesSinceMidnight % 60
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

const NURSERY_TZ = 'Africa/Cairo'

// `new Date(iso).getHours()` reads the HOST's local timezone, which is fine
// in the browser (Cairo-based admin) but NOT fine inside the PDF endpoint,
// which runs on a Vercel serverless function defaulting to UTC — the same
// data would silently produce a peak time 2 hours apart depending on where
// this ran. Pinning to the nursery's actual timezone explicitly keeps the
// dashboard and the PDF in agreement regardless of runtime. Hardcoded
// rather than read from `nurseries.timezone` because the system is
// single-timezone today — revisit if a nursery outside Cairo comes online.
function minutesSinceMidnightLocal(isoString) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NURSERY_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(isoString))
  const hour = Number(parts.find((p) => p.type === 'hour').value)
  const minute = Number(parts.find((p) => p.type === 'minute').value)
  return hour * 60 + minute
}

// Bucketed on `requested_at` specifically — it's the one timestamp present
// on every single request regardless of how staff handled it, so this is
// the only peak-time signal that isn't biased by workflow shortcuts.
export function computePeakPeriod(requests, bucketMinutes = 30) {
  if (requests.length === 0) return null

  const buckets = new Map()
  for (const r of requests) {
    const minutesSinceMidnight = minutesSinceMidnightLocal(r.requested_at)
    const bucketStart = Math.floor(minutesSinceMidnight / bucketMinutes) * bucketMinutes
    buckets.set(bucketStart, (buckets.get(bucketStart) || 0) + 1)
  }

  let bestStart = null
  let bestCount = -1
  for (const [start, count] of buckets.entries()) {
    if (count > bestCount) {
      bestCount = count
      bestStart = start
    }
  }

  return {
    label: `${formatClockLabel(bestStart)} – ${formatClockLabel(bestStart + bucketMinutes)}`,
    count: bestCount,
  }
}

// Only rows where staff actually recorded "Ready" are counted — that step
// can be legitimately skipped (straight to delivered), so this average
// always carries a coverage figure alongside it rather than pretending it
// covers every request.
export function computePrepTime(requests, expectedSeconds) {
  const withReady = requests.filter((r) => r.ready_at)
  const avgSeconds = average(withReady.map((r) => secondsBetween(r.requested_at, r.ready_at)))

  return {
    expectedMinutes: expectedSeconds / 60,
    actualAverageMinutes: avgSeconds != null ? avgSeconds / 60 : null,
    sampleSize: withReady.length,
    coverage: requests.length ? withReady.length / requests.length : 0,
  }
}

// Deliberately NOT branded as a definitive "parent experience" score.
// `arrived_at` is self-reported (parent taps a button, possibly before
// they're physically at the handoff point) and can be entirely absent when
// staff short-circuit straight to delivered — so this is only ever shown
// alongside its coverage, and callers should treat low coverage as a
// finding in itself rather than trusting a thin average.
export function computeArrivalExperience(requests) {
  const withBoth = requests.filter((r) => r.arrived_at && r.delivered_at)
  const avgSeconds = average(withBoth.map((r) => secondsBetween(r.arrived_at, r.delivered_at)))

  return {
    averageMinutes: avgSeconds != null ? avgSeconds / 60 : null,
    sampleSize: withBoth.length,
    coverage: requests.length ? withBoth.length / requests.length : 0,
  }
}

// The moment a request stops being "pending prep" — whichever of ready_at/
// delivered_at happened first. Covers the skip-straight-to-delivered case
// (no ready_at at all) as well as the normal flow, so it has better
// coverage than prep time alone. A `cleared` request with neither
// timestamp set (cancelled, admin-cleared, or swept by the nightly reset)
// has no recorded end point at all and is excluded — there is no
// `cleared_at` column, so how overdue it was when it ended is simply not
// knowable from the data as it exists today.
function resolvedAtIso(r) {
  const candidates = [r.ready_at, r.delivered_at].filter(Boolean)
  if (candidates.length === 0) return null
  return candidates.reduce((earliest, t) => (new Date(t) < new Date(earliest) ? t : earliest))
}

// "Delay" = time spent past the nursery's configured prep-time target,
// counted from the target deadline (requested_at + expectedSeconds) until
// the request was actually resolved. A request resolved within the target
// has zero delay, not a negative one.
export function computeDelay(requests, expectedSeconds) {
  const withResolution = requests
    .map((r) => ({ r, resolvedAt: resolvedAtIso(r) }))
    .filter((x) => x.resolvedAt != null)

  const delaySecondsList = withResolution.map(
    ({ r, resolvedAt }) => Math.max(0, secondsBetween(r.requested_at, resolvedAt) - expectedSeconds)
  )
  const delayed = delaySecondsList.filter((s) => s > 0)

  return {
    delayedCount: delayed.length,
    consideredCount: withResolution.length,
    delayedRate: withResolution.length ? delayed.length / withResolution.length : 0,
    avgDelayMinutes: delayed.length ? average(delayed) / 60 : null,
    coverage: requests.length ? withResolution.length / requests.length : 0,
  }
}

export function computeClassBreakdown(requests, children, classes, expectedSeconds = 0) {
  const classById = new Map(classes.map((c) => [c.id, c]))
  const childById = new Map(children.map((c) => [c.id, c]))

  const rows = classes.map((cls) => {
    const classChildren = children.filter((c) => c.class_id === cls.id && c.is_active !== false)
    const classRequests = requests.filter((r) => childById.get(r.child_id)?.class_id === cls.id)
    const activeChildIds = new Set(classRequests.map((r) => r.child_id))
    const prep = computePrepTime(classRequests, 0)
    const delay = computeDelay(classRequests, expectedSeconds)

    return {
      classId: cls.id,
      className: cls.name,
      color: cls.color,
      totalChildren: classChildren.length,
      activeChildren: activeChildIds.size,
      totalRequests: classRequests.length,
      avgPrepMinutes: prep.actualAverageMinutes,
      prepSampleSize: prep.sampleSize,
      delayedCount: delay.delayedCount,
      delayedRate: delay.delayedRate,
    }
  })

  // Children with no class assigned still show up somewhere rather than
  // silently vanishing from the breakdown.
  const unassigned = requests.filter((r) => {
    const child = childById.get(r.child_id)
    return child && !child.class_id
  })
  if (unassigned.length > 0) {
    const prep = computePrepTime(unassigned, 0)
    const delay = computeDelay(unassigned, expectedSeconds)
    rows.push({
      classId: null,
      className: 'Unassigned',
      color: '#9CA3AF',
      totalChildren: children.filter((c) => !c.class_id && c.is_active !== false).length,
      activeChildren: new Set(unassigned.map((r) => r.child_id)).size,
      totalRequests: unassigned.length,
      avgPrepMinutes: prep.actualAverageMinutes,
      prepSampleSize: prep.sampleSize,
      delayedCount: delay.delayedCount,
      delayedRate: delay.delayedRate,
    })
  }

  return rows.filter((r) => r.totalChildren > 0 || r.totalRequests > 0)
}

function pct(n) {
  return `${Math.round(n * 100)}%`
}

// Short, strictly numbers-derived bullet points — no free-form generated
// text, every sentence traces back to a specific computed value.
export function computeInsights({ overview, prepTime, peak, classBreakdown, delay }) {
  const insights = []

  if (overview.totalRequests === 0) {
    return ['No pickup requests were recorded in this period.']
  }

  insights.push(
    `${overview.activeChildren} of ${overview.totalChildren} enrolled children (${pct(overview.adoptionRate)}) used the Smart Dismissal System during this period.`
  )

  if (peak) {
    insights.push(`The busiest dismissal window was ${peak.label}, with ${peak.count} requests.`)
  }

  if (delay && delay.consideredCount > 0) {
    if (delay.delayedCount === 0) {
      insights.push(`No requests exceeded the ${prepTime.expectedMinutes}-minute target this period.`)
    } else {
      insights.push(
        `${delay.delayedCount} of ${delay.consideredCount} requests (${pct(delay.delayedRate)}) exceeded the ${prepTime.expectedMinutes}-minute target, by an average of ${delay.avgDelayMinutes.toFixed(1)} minutes when delayed.`
      )
    }
  }

  if (prepTime.actualAverageMinutes != null) {
    const diff = prepTime.actualAverageMinutes - prepTime.expectedMinutes
    const diffAbs = Math.abs(diff).toFixed(1)
    if (Math.abs(diff) < 0.5) {
      insights.push(`Average preparation time matched the configured target of ${prepTime.expectedMinutes} minutes.`)
    } else if (diff < 0) {
      insights.push(
        `Children were ready ${diffAbs} minutes faster on average than the configured ${prepTime.expectedMinutes}-minute target.`
      )
    } else {
      insights.push(
        `Average preparation time ran ${diffAbs} minutes over the configured ${prepTime.expectedMinutes}-minute target.`
      )
    }
  }

  if (classBreakdown.length > 1) {
    const withRequests = classBreakdown.filter((c) => c.totalRequests > 0)
    if (withRequests.length > 1) {
      const busiest = withRequests.reduce((a, b) => (b.totalRequests > a.totalRequests ? b : a))
      insights.push(`${busiest.className} had the most pickup activity, with ${busiest.totalRequests} requests.`)
    }
  }

  return insights
}

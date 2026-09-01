import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import BarChart from '../../components/BarChart'
import InfoTip from '../../components/InfoTip'
import {
  DATE_RANGE_PRESETS,
  getPresetRange,
  pickGranularity,
  computeOverview,
  computeTrend,
  computePeakPeriod,
  computePrepTime,
  computeArrivalExperience,
  computeDelay,
  computeClassBreakdown,
  computeInsights,
  METRIC_EXPLANATIONS,
} from '../../utils/analytics'

function fmtMinutes(n) {
  return n == null ? '—' : `${n.toFixed(1)} min`
}

function fmtPct(n) {
  return `${Math.round(n * 100)}%`
}

function Card({ label, value, sub, info }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
        {info && <InfoTip text={info} />}
      </div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

export default function NurseryAnalyticsDetail() {
  const { nurseryId } = useParams()
  const navigate = useNavigate()

  const [nursery, setNursery] = useState(null)
  const [requests, setRequests] = useState([])
  const [children, setChildren] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState('7d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  const range = useMemo(() => getPresetRange(preset, customFrom, customTo), [preset, customFrom, customTo])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nurseryId, range.from, range.to])

  const load = async () => {
    setLoading(true)

    const [{ data: nurseryRow }, { data: requestRows }, { data: childRows }, { data: classRows }] = await Promise.all([
      supabase.from('nurseries').select('id, name, pickup_countdown_seconds').eq('id', nurseryId).maybeSingle(),
      supabase
        .from('pickup_requests')
        .select('id, child_id, date, requested_at, ready_at, arrived_at, delivered_at')
        .eq('nursery_id', nurseryId)
        .gte('date', range.from)
        .lte('date', range.to),
      supabase.from('children').select('id, class_id, is_active').eq('nursery_id', nurseryId),
      supabase.from('classes').select('id, name, color').eq('nursery_id', nurseryId).order('name'),
    ])

    setNursery(nurseryRow || null)
    setRequests(requestRows || [])
    setChildren(childRows || [])
    setClasses(classRows || [])
    setLoading(false)
  }

  const overview = useMemo(() => computeOverview({ requests, children }), [requests, children])
  const granularity = useMemo(() => pickGranularity(range.from, range.to), [range])
  const trend = useMemo(() => computeTrend(requests, granularity), [requests, granularity])
  const peak = useMemo(() => computePeakPeriod(requests), [requests])
  const prepTime = useMemo(
    () => computePrepTime(requests, nursery?.pickup_countdown_seconds || 0),
    [requests, nursery]
  )
  const arrival = useMemo(() => computeArrivalExperience(requests), [requests])
  const expectedSeconds = nursery?.pickup_countdown_seconds || 0
  const delay = useMemo(() => computeDelay(requests, expectedSeconds), [requests, expectedSeconds])
  const classBreakdown = useMemo(
    () => computeClassBreakdown(requests, children, classes, expectedSeconds),
    [requests, children, classes, expectedSeconds]
  )
  const insights = useMemo(
    () => computeInsights({ overview, prepTime, peak, classBreakdown, delay }),
    [overview, prepTime, peak, classBreakdown, delay]
  )

  const visibleClassRows =
    classFilter === 'all' ? classBreakdown : classBreakdown.filter((c) => String(c.classId) === classFilter)

  const exportPdf = async () => {
    setExporting(true)
    setExportError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-nursery-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ nurseryId, from: range.from, to: range.to }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Report generation failed')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${nursery?.name || 'nursery'}-report-${range.from}-to-${range.to}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err.message)
    }

    setExporting(false)
  }

  if (loading) {
    return <div className="text-gray-400 py-12 text-center">Loading…</div>
  }

  if (!nursery) {
    return <div className="text-gray-400 py-12 text-center">Nursery not found.</div>
  }

  return (
    <div>
      <button onClick={() => navigate('/super-admin/analytics')} className="text-sm text-blue-600 hover:underline mb-4">
        ← All nurseries
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{nursery.name}</h1>
        <button
          onClick={exportPdf}
          disabled={exporting}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {exporting ? 'Generating…' : 'Export PDF'}
        </button>
      </div>

      {exportError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
          {exportError}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Period</label>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {DATE_RANGE_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {preset === 'custom' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        <div className="text-xs text-gray-400 ml-auto">
          {range.from} to {range.to} · {overview.activeDaysCount} active day{overview.activeDaysCount === 1 ? '' : 's'}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <Card label="Enrolled Children" value={overview.totalChildren} info={METRIC_EXPLANATIONS.enrolledChildren} />
        <Card
          label="Active Children"
          value={overview.activeChildren}
          sub={fmtPct(overview.adoptionRate) + ' adoption'}
          info={METRIC_EXPLANATIONS.activeChildren}
        />
        <Card label="Pickup Requests" value={overview.totalRequests} info={METRIC_EXPLANATIONS.totalRequests} />
        <Card
          label="Avg / Active Day"
          value={overview.avgPerActiveDay.toFixed(1)}
          info={METRIC_EXPLANATIONS.avgPerActiveDay}
        />
        <Card
          label="Peak Period"
          value={peak ? peak.label : '—'}
          sub={peak ? `${peak.count} requests` : undefined}
          info={METRIC_EXPLANATIONS.peakPeriod}
        />
        <Card
          label="Delayed Requests"
          value={delay.consideredCount ? `${delay.delayedCount} (${fmtPct(delay.delayedRate)})` : '—'}
          sub={`Past ${prepTime.expectedMinutes} min target`}
          info={METRIC_EXPLANATIONS.delayedRequests}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center">
          Usage Trend {granularity === 'weekly' ? '(weekly)' : '(daily)'}
          <InfoTip text={METRIC_EXPLANATIONS.usageTrend} />
        </h2>
        <BarChart data={trend} color={'#3B82F6'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Preparation Time</h2>
          <div className="flex justify-between text-sm py-1">
            <span className="text-gray-500 flex items-center">
              Configured target
              <InfoTip text={METRIC_EXPLANATIONS.prepExpected} />
            </span>
            <span className="font-medium text-gray-900">{prepTime.expectedMinutes} min</span>
          </div>
          <div className="flex justify-between text-sm py-1">
            <span className="text-gray-500 flex items-center">
              Actual average
              <InfoTip text={METRIC_EXPLANATIONS.prepActual} />
            </span>
            <span className="font-medium text-gray-900">{fmtMinutes(prepTime.actualAverageMinutes)}</span>
          </div>
          <div className="text-xs text-gray-400 mt-2">
            Based on {prepTime.sampleSize} of {overview.totalRequests} requests ({fmtPct(prepTime.coverage)}) where a
            "Ready" time was recorded.
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Delay Time</h2>
          {delay.consideredCount > 0 ? (
            <>
              <div className="flex justify-between text-sm py-1">
                <span className="text-gray-500 flex items-center">
                  Exceeded the {prepTime.expectedMinutes} min target
                  <InfoTip text={METRIC_EXPLANATIONS.delayExceeded} />
                </span>
                <span className="font-medium text-gray-900">
                  {delay.delayedCount} / {delay.consideredCount} ({fmtPct(delay.delayedRate)})
                </span>
              </div>
              <div className="flex justify-between text-sm py-1">
                <span className="text-gray-500 flex items-center">
                  Average delay (when delayed)
                  <InfoTip text={METRIC_EXPLANATIONS.delayAverage} />
                </span>
                <span className="font-medium text-gray-900">{fmtMinutes(delay.avgDelayMinutes)}</span>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Delay is counted from {prepTime.expectedMinutes} minutes after the request until the child was marked
                Ready or Delivered — whichever came first. Based on {delay.consideredCount} of{' '}
                {overview.totalRequests} requests ({fmtPct(delay.coverage)}); requests cancelled or cleared without
                ever being marked Ready/Delivered have no recorded end time and can't be included.
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-400">No requests in this period have a recorded end time to measure.</div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
            Arrival-to-Handoff Time
            <InfoTip text={METRIC_EXPLANATIONS.arrivalHandoff} />
          </h2>
          {arrival.sampleSize > 0 ? (
            <>
              <div className="flex justify-between text-sm py-1">
                <span className="text-gray-500">Average</span>
                <span className="font-medium text-gray-900">{fmtMinutes(arrival.averageMinutes)}</span>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Based on {arrival.sampleSize} of {overview.totalRequests} requests ({fmtPct(arrival.coverage)}) where
                the parent used "I Have Arrived". Self-reported — treat as approximate, and note the coverage itself
                if it's low.
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-400">No requests in this period recorded an arrival time.</div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">Class-by-Class Performance</h2>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Classes</option>
            {classBreakdown.map((c) => (
              <option key={c.classId ?? 'unassigned'} value={String(c.classId)}>
                {c.className}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-semibold text-gray-600">Class</th>
                <th className="text-left py-2 font-semibold text-gray-600 whitespace-nowrap">
                  Children
                  <InfoTip text={METRIC_EXPLANATIONS.classChildren} />
                </th>
                <th className="text-left py-2 font-semibold text-gray-600 whitespace-nowrap">
                  Active
                  <InfoTip text={METRIC_EXPLANATIONS.classActive} />
                </th>
                <th className="text-left py-2 font-semibold text-gray-600 whitespace-nowrap">
                  Requests
                  <InfoTip text={METRIC_EXPLANATIONS.classRequests} />
                </th>
                <th className="text-left py-2 font-semibold text-gray-600 whitespace-nowrap">
                  Avg Prep Time
                  <InfoTip text={METRIC_EXPLANATIONS.classAvgPrep} />
                </th>
                <th className="text-left py-2 font-semibold text-gray-600 whitespace-nowrap">
                  Delayed
                  <InfoTip text={METRIC_EXPLANATIONS.classDelayed} />
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleClassRows.map((c) => (
                <tr key={c.classId ?? 'unassigned'} className="border-b last:border-0">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.className}
                    </div>
                  </td>
                  <td className="py-2 text-gray-600">{c.totalChildren}</td>
                  <td className="py-2 text-gray-600">{c.activeChildren}</td>
                  <td className="py-2 text-gray-600">{c.totalRequests}</td>
                  <td className="py-2 text-gray-600">{fmtMinutes(c.avgPrepMinutes)}</td>
                  <td className="py-2 text-gray-600">
                    {c.totalRequests > 0 ? `${c.delayedCount} (${fmtPct(c.delayedRate)})` : '—'}
                  </td>
                </tr>
              ))}
              {visibleClassRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-400">
                    No class data for this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Key Insights</h2>
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-600">
          {insights.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

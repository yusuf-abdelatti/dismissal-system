import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { computeBillingBreakdown } from '../../utils/billing'

function addMonths(dateStr, months) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setMonth(d.getMonth() + months)
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

function fmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function OrganizationDetail() {
  const { organizationId } = useParams()
  const navigate = useNavigate()

  const [organization, setOrganization] = useState(null)
  const [linkedNurseries, setLinkedNurseries] = useState([])
  const [unlinkedNurseries, setUnlinkedNurseries] = useState([])
  const [seatsUsed, setSeatsUsed] = useState(0)
  const [statements, setStatements] = useState([])
  const [loading, setLoading] = useState(true)
  const [linkTarget, setLinkTarget] = useState('')
  const [linking, setLinking] = useState(false)

  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [months, setMonths] = useState(3)
  const [setupFeeEgp, setSetupFeeEgp] = useState('')
  const [snapshots, setSnapshots] = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [downloadingId, setDownloadingId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    load()
  }, [organizationId])

  const load = async () => {
    setLoading(true)

    const [{ data: org }, { data: allNurseries }, { data: pastStatements }] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', organizationId).maybeSingle(),
      supabase.from('nurseries').select('id, name, organization_id').order('name'),
      supabase.from('billing_statements').select('*').eq('organization_id', organizationId).order('generated_at', { ascending: false }),
    ])

    const linked = (allNurseries || []).filter((n) => n.organization_id === organizationId)
    const unlinked = (allNurseries || []).filter((n) => !n.organization_id)

    const linkedIds = linked.map((n) => n.id)
    const { data: children } = linkedIds.length
      ? await supabase.from('children').select('nursery_id').eq('is_active', true).in('nursery_id', linkedIds)
      : { data: [] }

    setOrganization(org || null)
    setLinkedNurseries(linked)
    setUnlinkedNurseries(unlinked)
    setSeatsUsed((children || []).length)
    setStatements(pastStatements || [])

    if (org?.billing_start_date && !periodStart) {
      setPeriodStart(org.billing_start_date)
      setPeriodEnd(addMonths(org.billing_start_date, org.billing_cycle_months || 3))
      setMonths(org.billing_cycle_months || 3)
    }
    if (org?.billing_cycle_months) setMonths(org.billing_cycle_months)

    setLoading(false)
  }

  const linkNursery = async () => {
    if (!linkTarget) return
    setLinking(true)
    await supabase.from('nurseries').update({ organization_id: organizationId }).eq('id', linkTarget)
    setLinkTarget('')
    setLinking(false)
    load()
  }

  const unlinkNursery = async (nurseryId) => {
    await supabase.from('nurseries').update({ organization_id: null }).eq('id', nurseryId)
    load()
  }

  const loadPreview = async () => {
    if (!periodStart || !periodEnd || linkedNurseries.length === 0) return
    setPreviewLoading(true)
    setError(null)
    const nurseryIds = linkedNurseries.map((n) => n.id)
    const { data, error: err } = await supabase
      .from('daily_seat_snapshots')
      .select('nursery_id, snapshot_date, active_children_count')
      .in('nursery_id', nurseryIds)
      .gte('snapshot_date', periodStart)
      .lte('snapshot_date', periodEnd)

    if (err) {
      setError('Could not load seat history for that period.')
      setPreviewLoading(false)
      return
    }
    setSnapshots(data || [])
    setPreviewLoading(false)
  }

  const breakdown = useMemo(() => {
    if (!organization || linkedNurseries.length === 0 || !periodStart || !periodEnd) return null
    return computeBillingBreakdown({
      organization,
      nurseries: linkedNurseries,
      snapshots,
      periodStart,
      periodEnd,
      months: Number(months) || 1,
      setupFeeEgp: setupFeeEgp ? Number(setupFeeEgp) : 0,
    })
  }, [organization, linkedNurseries, snapshots, periodStart, periodEnd, months, setupFeeEgp])

  const generateStatement = async () => {
    setGenerating(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-billing-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          organizationId,
          periodStart,
          periodEnd,
          months: Number(months),
          setupFeeEgp: setupFeeEgp ? Number(setupFeeEgp) : 0,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Statement generation failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${organization.name}-statement-${periodStart}-to-${periodEnd}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      load()
    } catch (err) {
      setError(err.message)
    }
    setGenerating(false)
  }

  const redownload = async (statement) => {
    setDownloadingId(statement.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-billing-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ statementId: statement.id }),
      })
      if (!res.ok) throw new Error('Could not download this statement.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `statement-${statement.period_start}-to-${statement.period_end}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    }
    setDownloadingId(null)
  }

  if (loading) {
    return <div className="text-gray-400 py-12 text-center">Loading…</div>
  }

  if (!organization) {
    return <div className="text-gray-400 py-12 text-center">Organization not found.</div>
  }

  const overLimit = organization.seat_limit != null && seatsUsed > organization.seat_limit

  return (
    <div>
      <button onClick={() => navigate('/super-admin/organizations')} className="text-sm text-blue-600 hover:underline mb-4">
        ← All organizations
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">{organization.name}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {organization.rate_per_seat_egp} EGP / seat / month · billed every {organization.billing_cycle_months} months
        {organization.billing_start_date ? ` · billing starts ${organization.billing_start_date}` : ''}
      </p>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Linked Branches</h2>
          {linkedNurseries.length === 0 ? (
            <p className="text-sm text-gray-400 mb-3">No branches linked yet.</p>
          ) : (
            <ul className="mb-3 space-y-1.5">
              {linkedNurseries.map((n) => (
                <li key={n.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-800">{n.name}</span>
                  <button onClick={() => unlinkNursery(n.id)} className="text-gray-400 hover:text-red-500 text-xs">
                    Unlink
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <select
              value={linkTarget}
              onChange={(e) => setLinkTarget(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Link a branch…</option>
              {unlinkedNurseries.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
            <button
              onClick={linkNursery}
              disabled={!linkTarget || linking}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              Link
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Only branches not already in another organization are shown. Unlink a branch elsewhere first to move it here.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Seats (today)</h2>
          <div className={`text-3xl font-bold ${overLimit ? 'text-red-600' : 'text-gray-900'}`}>
            {seatsUsed}
            {organization.seat_limit != null && <span className="text-gray-400 text-lg"> / {organization.seat_limit}</span>}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {organization.seat_limit != null ? 'Shared across all linked branches, live count.' : 'No shared limit set.'}
          </p>
          {overLimit && <p className="text-xs text-red-600 mt-2 font-medium">Over the shared seat limit.</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Generate Payment Statement</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Period start</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Period end</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Months to bill</label>
            <input
              type="number"
              min="1"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">One-time setup fee (EGP)</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={setupFeeEgp}
              onChange={(e) => setSetupFeeEgp(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          onClick={loadPreview}
          disabled={!periodStart || !periodEnd || linkedNurseries.length === 0 || previewLoading}
          className="text-blue-600 hover:underline text-sm disabled:opacity-50 disabled:no-underline mb-4"
        >
          {previewLoading ? 'Loading…' : 'Load preview'}
        </button>

        {breakdown && snapshots.length >= 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Branch</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Avg Seats</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Days of data</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.branches.map((b) => (
                  <tr key={b.nurseryId} className="border-b last:border-0">
                    <td className="px-3 py-2 text-gray-800">{b.name}</td>
                    <td className="px-3 py-2 text-gray-600">{b.avgSeats.toFixed(1)}</td>
                    <td className="px-3 py-2 text-gray-600">{b.daysCounted}</td>
                    <td className="px-3 py-2 text-gray-600">{fmt(b.subtotal)} EGP</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-3 bg-gray-50 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">Recurring subtotal</span>
                <span className="font-medium text-gray-900">{fmt(breakdown.recurringTotal)} EGP</span>
              </div>
              {breakdown.setupFeeEgp > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">One-time setup fee</span>
                  <span className="font-medium text-gray-900">{fmt(breakdown.setupFeeEgp)} EGP</span>
                </div>
              )}
              <div className="flex justify-between text-base pt-1 border-t border-gray-200 mt-1">
                <span className="font-semibold text-gray-800">Total due</span>
                <span className="font-bold text-gray-900">{fmt(breakdown.totalDue)} EGP</span>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={generateStatement}
          disabled={!breakdown || generating}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {generating ? 'Generating…' : 'Generate PDF & Save Statement'}
        </button>
        <p className="text-xs text-gray-400 mt-2">
          Saving freezes these figures permanently — re-downloading this statement later will always show the same numbers,
          even if seat data changes afterward.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Past Statements</h2>
        {statements.length === 0 ? (
          <p className="text-sm text-gray-400">No statements generated yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-semibold text-gray-600">Period</th>
                <th className="text-left py-2 font-semibold text-gray-600">Total Due</th>
                <th className="text-left py-2 font-semibold text-gray-600">Generated</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2 text-gray-800">
                    {s.period_start} → {s.period_end}
                  </td>
                  <td className="py-2 text-gray-600">{fmt(s.total_due_egp)} EGP</td>
                  <td className="py-2 text-gray-500 text-xs">{new Date(s.generated_at).toLocaleDateString()}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => redownload(s)}
                      disabled={downloadingId === s.id}
                      className="text-blue-600 hover:underline text-xs disabled:opacity-50"
                    >
                      {downloadingId === s.id ? 'Downloading…' : 'Download'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

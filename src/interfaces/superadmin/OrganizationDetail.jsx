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
  const [editingDraftId, setEditingDraftId] = useState(null)

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

  const drafts = statements.filter((s) => s.is_draft)
  const confirmedStatements = statements.filter((s) => !s.is_draft)
  const latestStatement = confirmedStatements[0] || null
  const alreadyChargedSetupFee = confirmedStatements.some((s) => Number(s.setup_fee_egp) > 0)

  // A plain visibility check, not automation: is there a draft waiting for
  // review, is the most recent confirmed statement unpaid, or has a whole
  // billing cycle passed with nothing generated (and no draft yet either —
  // the auto-draft job should normally beat this to it, but it's a
  // fallback in case that job hasn't run). Either way it's just a banner
  // shown when Super Admin opens this page — no emails triggered from here.
  const paymentReminder = useMemo(() => {
    if (!organization?.billing_start_date) return null

    if (drafts.length > 0) {
      return `${drafts.length} draft statement${drafts.length === 1 ? '' : 's'} waiting for your review below.`
    }

    if (latestStatement) {
      if (!latestStatement.paid) {
        return `Statement for ${latestStatement.period_start} → ${latestStatement.period_end} (${fmt(latestStatement.total_due_egp)} EGP) is not marked as paid yet.`
      }
      const cycleEnd = addMonths(latestStatement.period_start, organization.billing_cycle_months || 3)
      if (new Date() > new Date(`${cycleEnd}T00:00:00`)) {
        return `The next billing period (after ${latestStatement.period_end}) looks ready — a draft should appear automatically, or generate one manually below.`
      }
      return null
    }

    const firstCycleEnd = addMonths(organization.billing_start_date, organization.billing_cycle_months || 3)
    if (new Date() > new Date(`${firstCycleEnd}T00:00:00`)) {
      return `No statement has been generated yet, and the first billing period (starting ${organization.billing_start_date}) has already ended.`
    }
    return null
  }, [organization, latestStatement, drafts])

  const messageTemplate = useMemo(() => {
    const source = latestStatement
      ? { periodStart: latestStatement.period_start, periodEnd: latestStatement.period_end, total: latestStatement.total_due_egp }
      : breakdown
      ? { periodStart: breakdown.periodStart, periodEnd: breakdown.periodEnd, total: breakdown.totalDue }
      : null
    if (!source || !organization) return ''

    return `Hi Mr. Ahmed,

Please find attached the payment statement for ${organization.name}, covering ${source.periodStart} to ${source.periodEnd}.

Total due: ${fmt(source.total)} EGP

Kindly arrange payment at your convenience. Let us know if you have any questions.

Best regards,
Technothera`
  }, [organization, latestStatement, breakdown])

  const [copied, setCopied] = useState(false)
  const copyTemplate = async () => {
    await navigator.clipboard.writeText(messageTemplate)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const editDraft = (draft) => {
    setEditingDraftId(draft.id)
    setPeriodStart(draft.period_start)
    setPeriodEnd(draft.period_end)
    setMonths(draft.breakdown?.months || organization.billing_cycle_months || 3)
    setSetupFeeEgp(draft.setup_fee_egp ? String(draft.setup_fee_egp) : '')
    setError(null)
    loadPreview()
  }

  const cancelEditDraft = () => {
    setEditingDraftId(null)
    setSetupFeeEgp('')
  }

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
          confirmDraftId: editingDraftId || undefined,
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
      // The setup fee is a one-time charge at signing, not a recurring
      // line — clearing it after every generation is what stops it from
      // silently carrying over and getting billed again next quarter.
      setSetupFeeEgp('')
      setEditingDraftId(null)
      load()
    } catch (err) {
      setError(err.message)
    }
    setGenerating(false)
  }

  const togglePaid = async (statement) => {
    const paid = !statement.paid
    await supabase
      .from('billing_statements')
      .update({ paid, paid_at: paid ? new Date().toISOString() : null })
      .eq('id', statement.id)
    load()
  }

  const deleteStatement = async (statement) => {
    if (!window.confirm(`Delete the statement for ${statement.period_start} → ${statement.period_end}? This cannot be undone.`)) {
      return
    }
    await supabase.from('billing_statements').delete().eq('id', statement.id)
    load()
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

      {paymentReminder && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl mb-6 text-sm">
          <strong>Payment reminder:</strong> {paymentReminder}
        </div>
      )}

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

      {drafts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-5 mb-6 border-2 border-amber-200">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Needs Review</h2>
          <p className="text-xs text-gray-400 mb-4">
            Created automatically when a billing period ended — nothing here is final until you review, adjust if
            needed, and confirm it below.
          </p>
          <div className="divide-y divide-gray-100">
            {drafts.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-3 flex-wrap">
                <div className="text-sm">
                  <span className="text-gray-800">
                    {d.period_start} → {d.period_end}
                  </span>
                  <span className="text-gray-400 ml-2">~{fmt(d.total_due_egp)} EGP estimated</span>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => editDraft(d)} className="text-blue-600 hover:underline text-xs">
                    Review & Edit
                  </button>
                  <button onClick={() => deleteStatement(d)} className="text-red-500 hover:underline text-xs">
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-gray-700">
            {editingDraftId ? 'Reviewing Draft Statement' : 'Generate Payment Statement'}
          </h2>
          {editingDraftId && (
            <button onClick={cancelEditDraft} className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
              Cancel — start a new one instead
            </button>
          )}
        </div>

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
            <p className="text-xs text-gray-400 mt-1">Leave blank except on the statement this actually applies to — it doesn't repeat automatically.</p>
            {Number(setupFeeEgp) > 0 && alreadyChargedSetupFee && (
              <p className="text-xs text-amber-600 mt-1 font-medium">
                A setup fee was already recorded on a previous statement for this organization. Only include this again if a new branch was just added.
              </p>
            )}
          </div>
        </div>

        <button
          onClick={loadPreview}
          disabled={!periodStart || !periodEnd || linkedNurseries.length === 0 || previewLoading}
          className="block text-blue-600 hover:underline text-sm disabled:opacity-50 disabled:no-underline mb-4"
        >
          {previewLoading ? 'Loading…' : 'Load preview'}
        </button>

        {breakdown?.startsBeforeBilling && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-lg mb-4 text-xs">
            This period starts before the organization's billing start date ({organization.billing_start_date}) —
            fine for testing/preview, but double-check before generating a real statement with these dates.
          </div>
        )}

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
          {generating ? 'Saving…' : editingDraftId ? 'Confirm & Save Statement' : 'Generate PDF & Save Statement'}
        </button>
        <p className="text-xs text-gray-400 mt-2">
          Saving freezes these figures permanently — re-downloading this statement later will always show the same numbers,
          even if seat data changes afterward.
        </p>

        {messageTemplate && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Message to send with it</h3>
              <button onClick={copyTemplate} className="text-blue-600 hover:underline text-xs">
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap font-sans">
              {messageTemplate}
            </pre>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Past Statements</h2>
        {confirmedStatements.length === 0 ? (
          <p className="text-sm text-gray-400">No statements generated yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-semibold text-gray-600">Period</th>
                <th className="text-left py-2 font-semibold text-gray-600">Total Due</th>
                <th className="text-left py-2 font-semibold text-gray-600">Generated</th>
                <th className="text-left py-2 font-semibold text-gray-600">Paid</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {confirmedStatements.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2 text-gray-800">
                    {s.period_start} → {s.period_end}
                  </td>
                  <td className="py-2 text-gray-600">{fmt(s.total_due_egp)} EGP</td>
                  <td className="py-2 text-gray-500 text-xs">{new Date(s.generated_at).toLocaleDateString()}</td>
                  <td className="py-2">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={!!s.paid} onChange={() => togglePaid(s)} className="rounded" />
                      {s.paid ? 'Paid' : 'Unpaid'}
                    </label>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => redownload(s)}
                      disabled={downloadingId === s.id}
                      className="text-blue-600 hover:underline text-xs disabled:opacity-50 mr-3"
                    >
                      {downloadingId === s.id ? 'Downloading…' : 'Download'}
                    </button>
                    <button onClick={() => deleteStatement(s)} className="text-red-500 hover:underline text-xs">
                      Delete
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

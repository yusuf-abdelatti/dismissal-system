import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const EMPTY_FORM = {
  name: '',
  seat_limit: '',
  rate_per_seat_egp: '',
  billing_cycle_months: 3,
  billing_start_date: '',
  rate_locked_until: '',
}

function toForm(org) {
  return {
    name: org.name,
    seat_limit: org.seat_limit ?? '',
    rate_per_seat_egp: org.rate_per_seat_egp ?? '',
    billing_cycle_months: org.billing_cycle_months ?? 3,
    billing_start_date: org.billing_start_date || '',
    rate_locked_until: org.rate_locked_until || '',
  }
}

function toPayload(form) {
  return {
    name: form.name.trim(),
    seat_limit: form.seat_limit === '' ? null : Number(form.seat_limit),
    rate_per_seat_egp: Number(form.rate_per_seat_egp) || 0,
    billing_cycle_months: Number(form.billing_cycle_months) || 3,
    billing_start_date: form.billing_start_date || null,
    rate_locked_until: form.rate_locked_until || null,
  }
}

export default function SuperAdminOrganizations() {
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState([])
  const [nurseryCounts, setNurseryCounts] = useState({}) // orgId -> {branches, seatsUsed}
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    const { data: orgData } = await supabase.from('organizations').select('*').order('created_at')
    const { data: nurseries } = await supabase.from('nurseries').select('id, organization_id').not('organization_id', 'is', null)

    const nurseryIds = (nurseries || []).map((n) => n.id)
    const { data: children } = nurseryIds.length
      ? await supabase.from('children').select('nursery_id').eq('is_active', true).in('nursery_id', nurseryIds)
      : { data: [] }

    const seatsByNursery = {}
    ;(children || []).forEach((c) => {
      seatsByNursery[c.nursery_id] = (seatsByNursery[c.nursery_id] || 0) + 1
    })

    const counts = {}
    ;(nurseries || []).forEach((n) => {
      if (!counts[n.organization_id]) counts[n.organization_id] = { branches: 0, seatsUsed: 0 }
      counts[n.organization_id].branches += 1
      counts[n.organization_id].seatsUsed += seatsByNursery[n.id] || 0
    })

    setOrgs(orgData || [])
    setNurseryCounts(counts)
    setLoading(false)
  }

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowModal(true)
  }

  const openEdit = (org) => {
    setEditing(org)
    setForm(toForm(org))
    setError(null)
    setShowModal(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    setSaving(true)
    setError(null)

    const payload = toPayload(form)
    const { error: err } = editing
      ? await supabase.from('organizations').update(payload).eq('id', editing.id)
      : await supabase.from('organizations').insert(payload)

    if (err) {
      setError('Something went wrong. Please try again.')
      setSaving(false)
      return
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  if (loading) {
    return <div className="text-gray-400 py-12 text-center">Loading…</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Multi-branch customers billed together across their linked nurseries.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Add Organization
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Organization</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Branches</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Seats Used</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Rate</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Billing Cycle</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => {
              const c = nurseryCounts[org.id] || { branches: 0, seatsUsed: 0 }
              const overLimit = org.seat_limit != null && c.seatsUsed > org.seat_limit
              return (
                <tr key={org.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{org.name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.branches}</td>
                  <td className="px-4 py-3">
                    <span className={overLimit ? 'text-red-600 font-medium' : 'text-gray-600'}>
                      {c.seatsUsed}
                      {org.seat_limit != null ? ` / ${org.seat_limit}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{org.rate_per_seat_egp} EGP</td>
                  <td className="px-4 py-3 text-gray-600">every {org.billing_cycle_months} mo</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(org)} className="text-blue-600 hover:underline text-xs mr-3">
                      Edit
                    </button>
                    <button
                      onClick={() => navigate(`/super-admin/organizations/${org.id}`)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Manage →
                    </button>
                  </td>
                </tr>
              )
            })}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No organizations yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit Organization' : 'Add Organization'} onClose={() => setShowModal(false)}>
          {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Shared seat limit <span className="text-gray-400 font-normal">(optional, leave blank for uncapped)</span>
            </label>
            <input
              type="number"
              min="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.seat_limit}
              onChange={(e) => setForm((f) => ({ ...f, seat_limit: e.target.value }))}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Rate per active child (EGP / month)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.rate_per_seat_egp}
              onChange={(e) => setForm((f) => ({ ...f, rate_per_seat_egp: e.target.value }))}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Billing cycle (months)</label>
            <input
              type="number"
              min="1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.billing_cycle_months}
              onChange={(e) => setForm((f) => ({ ...f, billing_cycle_months: e.target.value }))}
            />
            <p className="text-xs text-gray-400 mt-1">Can be changed anytime — this just sets the default period length.</p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Billing start date <span className="text-gray-400 font-normal">(usage before this date is never billed)</span>
            </label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.billing_start_date}
              onChange={(e) => setForm((f) => ({ ...f, billing_start_date: e.target.value }))}
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rate locked until <span className="text-gray-400 font-normal">(optional, informational)</span>
            </label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.rate_locked_until}
              onChange={(e) => setForm((f) => ({ ...f, rate_locked_until: e.target.value }))}
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

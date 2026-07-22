import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { listUsers, createUser, deleteUser, setPassword } from '../../adminUsers'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const UNLINKED = 'No child linked'

export default function AdminParents() {
  const { nurseryId } = useAuth()
  const [parents, setParents] = useState([]) // {id, email, childName, className}
  const [children, setChildren] = useState([])
  const [emailDomain, setEmailDomain] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', child_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [resetTarget, setResetTarget] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetError, setResetError] = useState(null)
  const [resetSaving, setResetSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    if (!nurseryId) return
    supabase
      .from('nurseries')
      .select('email_domain')
      .eq('id', nurseryId)
      .maybeSingle()
      .then(({ data }) => setEmailDomain(data?.email_domain || null))
  }, [nurseryId])

  useEffect(() => {
    load()

    const channel = supabase
      .channel('parents_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'children' },
        () => load(false)
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true)

    const [allUsers, { data: staffData }, { data: childData }] =
      await Promise.all([
        listUsers().catch((err) => { console.error('listUsers error:', err); return [] }),
        supabase.from('staff_profiles').select('id'),
        supabase.from('children').select('id, full_name, parent_user_id, classes(name)').eq('is_active', true),
      ])

    const staffIds = new Set((staffData || []).map((s) => s.id))
    const childMap = Object.fromEntries(
      (childData || [])
        .filter((c) => c.parent_user_id)
        .map((c) => [c.parent_user_id, { name: c.full_name, className: c.classes?.name || null }])
    )

    const parentList = allUsers
      .filter((u) => !staffIds.has(u.id))
      .map((u) => ({
        id: u.id,
        email: u.email,
        childName: childMap[u.id]?.name || null,
        className: childMap[u.id]?.className || null,
      }))

    // Unlinked children for the add form
    const unlinked = (childData || []).filter((c) => !c.parent_user_id)

    setParents(parentList)
    setChildren(unlinked)
    setLoading(false)
  }

  const addParent = async () => {
    if (!form.email.trim() || !form.password) {
      setError('Email and password are required.')
      return
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setSaving(true)
    setError(null)

    const email = emailDomain ? `${form.email.trim().toLowerCase()}@${emailDomain}` : form.email.trim()

    // Create user via admin API (bypasses email confirmation)
    let newUser
    try {
      newUser = await createUser(email, form.password)
    } catch (createError) {
      console.error('Create user error:', createError)
      setError(`Failed to create account: ${createError.message}`)
      setSaving(false)
      return
    }

    // Link child if selected
    if (form.child_id) {
      await supabase
        .from('children')
        .update({ parent_user_id: newUser.id })
        .eq('id', form.child_id)
    }

    setSaving(false)
    setShowAdd(false)
    setForm({ email: '', password: '', child_id: '' })
    load()
  }

  const applyPasswordReset = async () => {
    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters.')
      return
    }
    setResetSaving(true)
    setResetError(null)
    try {
      await setPassword(resetTarget.id, newPassword)
      setSuccessMsg(`Password updated for ${resetTarget.email}.`)
      setTimeout(() => setSuccessMsg(null), 5000)
      setResetTarget(null)
      setNewPassword('')
    } catch (err) {
      setResetError(err.message)
    }
    setResetSaving(false)
  }

  const deleteParent = async (parentId) => {
    setDeleteTarget(null)
    await deleteUser(parentId)
    load()
  }

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? parents.filter((p) => (p.childName || '').toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
      : parents

    const byClass = {}
    for (const p of filtered) {
      const key = p.className || UNLINKED
      if (!byClass[key]) byClass[key] = []
      byClass[key].push(p)
    }
    for (const key of Object.keys(byClass)) {
      byClass[key].sort((a, b) => (a.childName || '').localeCompare(b.childName || ''))
    }

    const classNames = Object.keys(byClass).filter((k) => k !== UNLINKED).sort()
    if (byClass[UNLINKED]) classNames.push(UNLINKED)
    return classNames.map((name) => ({ name, rows: byClass[name] }))
  }, [parents, search])

  if (loading) {
    return <div className="text-gray-400 py-12 text-center">Loading…</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Parent Accounts</h1>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by child name or email…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={() => { setShowAdd(true); setError(null); setForm({ email: '', password: '', child_id: '' }) }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            Add Parent
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-4 text-sm">
          {successMsg}
        </div>
      )}

      {grouped.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm px-4 py-8 text-center text-gray-400">
          {search ? 'No matches' : 'No parent accounts yet'}
        </div>
      )}

      {grouped.map((group) => (
        <div key={group.name} className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {group.name} <span className="text-gray-400 font-normal normal-case">({group.rows.length})</span>
          </h2>
          <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Child</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {group.rows.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      {p.childName || <span className="text-amber-600">No child linked</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.email}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setResetTarget(p)}
                        className="text-blue-600 hover:underline text-xs mr-3"
                      >
                        Set Password
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="text-red-500 hover:underline text-xs"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Add parent modal */}
      {showAdd && (
        <Modal title="Add Parent Account" onClose={() => setShowAdd(false)}>
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            {emailDomain ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="name"
                />
                <span className="text-gray-500 text-sm whitespace-nowrap">@{emailDomain}</span>
              </div>
            ) : (
              <input
                type="email"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Initial Password
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="min. 6 characters"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Link to Child (optional)
            </label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.child_id}
              onChange={(e) => setForm((f) => ({ ...f, child_id: e.target.value }))}
            >
              <option value="">No child</option>
              {children.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={addParent}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        </Modal>
      )}

      {/* Set new password */}
      {resetTarget && (
        <Modal
          title="Set New Password"
          onClose={() => { setResetTarget(null); setNewPassword(''); setResetError(null) }}
        >
          {resetError && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{resetError}</div>
          )}
          <p className="text-sm text-gray-600 mb-4">
            Set a new password for <strong>{resetTarget.email}</strong>. They can sign in with it immediately.
          </p>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="min. 6 characters"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => { setResetTarget(null); setNewPassword(''); setResetError(null) }}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={applyPasswordReset}
              disabled={resetSaving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {resetSaving ? 'Saving…' : 'Set Password'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <Modal title="Remove Parent Account" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-gray-700 mb-5">
            Permanently remove the account for{' '}
            <strong>{deleteTarget.email}</strong>? This cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteParent(deleteTarget.id)}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Remove
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

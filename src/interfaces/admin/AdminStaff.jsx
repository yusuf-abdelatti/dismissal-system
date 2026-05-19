import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { supabaseAdmin } from '../../supabaseAdmin'

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

const ROLES = ['staff', 'admin', 'display']
const ROLE_LABELS = { staff: 'Staff', admin: 'Admin', display: 'Display Screen' }

export default function AdminStaff() {
  const [staffList, setStaffList] = useState([]) // {id, email, display_name, role}
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [resetTarget, setResetTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState({ email: '', password: '', display_name: '', role: 'staff' })
  const [editRole, setEditRole] = useState('staff')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)

    const [{ data: profiles }, adminResult] = await Promise.all([
      supabase.from('staff_profiles').select('id, display_name, role').order('display_name'),
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
    ])

    const userEmailMap = Object.fromEntries(
      (adminResult.data?.users || []).map((u) => [u.id, u.email])
    )

    const combined = (profiles || []).map((p) => ({
      ...p,
      email: userEmailMap[p.id] || '—',
    }))

    setStaffList(combined)
    setLoading(false)
  }

  const addStaff = async () => {
    if (!form.email.trim() || !form.password || !form.display_name.trim()) {
      setError('All fields are required.')
      return
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setSaving(true)
    setError(null)

    const { data: newUserData, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: form.email.trim(),
        password: form.password,
        email_confirm: true,
      })

    if (createError) {
      setError('Something went wrong. Please try again.')
      setSaving(false)
      return
    }

    const { error: profileError } = await supabase
      .from('staff_profiles')
      .insert({
        id: newUserData.user.id,
        display_name: form.display_name.trim(),
        role: form.role,
      })

    if (profileError) {
      setError('Account created but profile could not be saved. Please try again.')
      setSaving(false)
      return
    }

    setSaving(false)
    setShowAdd(false)
    setForm({ email: '', password: '', display_name: '', role: 'staff' })
    load()
  }

  const saveRole = async () => {
    setSaving(true)
    const { error: err } = await supabase
      .from('staff_profiles')
      .update({ role: editRole })
      .eq('id', editTarget.id)

    if (err) {
      setSaving(false)
      return
    }
    setSaving(false)
    setEditTarget(null)
    load()
  }

  const sendPasswordReset = async (email) => {
    setResetTarget(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email)
    if (!err) {
      setSuccessMsg(`Password reset email sent to ${email}.`)
      setTimeout(() => setSuccessMsg(null), 5000)
    }
  }

  const deleteStaff = async (memberId) => {
    setDeleteTarget(null)
    await supabaseAdmin.auth.admin.deleteUser(memberId)
    load()
  }

  if (loading) {
    return <div className="text-gray-400 py-12 text-center">Loading…</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Staff Accounts</h1>
        <button
          onClick={() => {
            setShowAdd(true)
            setError(null)
            setForm({ email: '', password: '', display_name: '', role: 'staff' })
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Add Staff
        </button>
      </div>

      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-4 text-sm">
          {successMsg}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Role</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {staffList.map((member) => (
              <tr key={member.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {member.display_name}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{member.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      member.role === 'admin'
                        ? 'bg-purple-100 text-purple-700'
                        : member.role === 'display'
                        ? 'bg-gray-100 text-gray-600'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {ROLE_LABELS[member.role]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    onClick={() => { setEditTarget(member); setEditRole(member.role) }}
                    className="text-blue-600 hover:underline text-xs mr-3"
                  >
                    Edit Role
                  </button>
                  <button
                    onClick={() => setResetTarget(member)}
                    className="text-gray-500 hover:underline text-xs mr-3"
                  >
                    Reset Password
                  </button>
                  <button
                    onClick={() => setDeleteTarget(member)}
                    className="text-red-500 hover:underline text-xs"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {staffList.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No staff accounts yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add staff modal */}
      {showAdd && (
        <Modal title="Add Staff Account" onClose={() => setShowAdd(false)}>
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
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
              onClick={addStaff}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit role modal */}
      {editTarget && (
        <Modal title="Edit Role" onClose={() => setEditTarget(null)}>
          <p className="text-sm text-gray-600 mb-4">
            Changing role for <strong>{editTarget.display_name}</strong>
          </p>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={editRole}
            onChange={(e) => setEditRole(e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setEditTarget(null)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={saveRole}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Role'}
            </button>
          </div>
        </Modal>
      )}

      {/* Reset password confirmation */}
      {resetTarget && (
        <Modal title="Reset Password" onClose={() => setResetTarget(null)}>
          <p className="text-sm text-gray-700 mb-5">
            Send a password reset email to{' '}
            <strong>{resetTarget.email}</strong>?
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setResetTarget(null)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={() => sendPasswordReset(resetTarget.email)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Send Reset Email
            </button>
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <Modal title="Remove Staff Account" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-gray-700 mb-5">
            Permanently remove the account for{' '}
            <strong>{deleteTarget.display_name}</strong>? This cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteStaff(deleteTarget.id)}
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

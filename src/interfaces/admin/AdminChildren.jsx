import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { listUsers } from '../../adminUsers'

const NO_CLASS = 'No Class'

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

const EMPTY_FORM = { full_name: '', class_id: '', parent_user_id: '' }

export default function AdminChildren() {
  const { nurseryId } = useAuth()
  const [children, setChildren] = useState([])
  const [classes, setClasses] = useState([])
  const [parents, setParents] = useState([]) // {id, email}
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    load()

    const channel = supabase
      .channel('children_changes')
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

    const [{ data: childData }, { data: classData }, allUsers] =
      await Promise.all([
        supabase
          .from('children')
          .select('*, classes(name, color)')
          .order('full_name'),
        supabase.from('classes').select('id, name').order('name'),
        listUsers().catch((err) => { console.error('listUsers error:', err); return [] }),
      ])

    // Fetch staff IDs to identify which users are parents (not staff)
    const { data: staffData } = await supabase
      .from('staff_profiles')
      .select('id')

    const staffIds = new Set((staffData || []).map((s) => s.id))
    const parentUsers = allUsers
      .filter((u) => !staffIds.has(u.id))
      .map((u) => ({ id: u.id, email: u.email }))

    setChildren(childData || [])
    setClasses(classData || [])
    setParents(parentUsers)
    setLoading(false)
  }

  const parentEmailMap = Object.fromEntries(parents.map((p) => [p.id, p.email]))

  // Only offer parents not already linked to a child, except the one already
  // linked to whichever child is currently being edited (so it stays selected).
  const linkedParentIds = new Set(children.map((c) => c.parent_user_id).filter(Boolean))
  const availableParents = parents.filter(
    (p) => !linkedParentIds.has(p.id) || p.id === editing?.parent_user_id
  )

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q ? children.filter((c) => c.full_name.toLowerCase().includes(q)) : children

    const byClass = {}
    for (const c of filtered) {
      const key = c.classes?.name || NO_CLASS
      if (!byClass[key]) byClass[key] = []
      byClass[key].push(c)
    }
    for (const key of Object.keys(byClass)) {
      byClass[key].sort((a, b) => a.full_name.localeCompare(b.full_name))
    }

    const classNames = Object.keys(byClass).filter((k) => k !== NO_CLASS).sort()
    if (byClass[NO_CLASS]) classNames.push(NO_CLASS)
    return classNames.map((name) => ({ name, rows: byClass[name] }))
  }, [children, search])

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowModal(true)
  }

  const openEdit = (child) => {
    setEditing(child)
    setForm({
      full_name: child.full_name,
      class_id: child.class_id || '',
      parent_user_id: child.parent_user_id || '',
    })
    setError(null)
    setShowModal(true)
  }

  const save = async () => {
    if (!form.full_name.trim()) {
      setError('Full name is required.')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      full_name: form.full_name.trim(),
      class_id: form.class_id || null,
      parent_user_id: form.parent_user_id || null,
    }

    if (editing) {
      const { error: err } = await supabase
        .from('children')
        .update(payload)
        .eq('id', editing.id)
      if (err) { setError('Something went wrong. Please try again.'); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('children').insert({ ...payload, nursery_id: nurseryId })
      if (err) { setError('Something went wrong. Please try again.'); setSaving(false); return }
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  const toggleActive = async (child) => {
    await supabase
      .from('children')
      .update({ is_active: !child.is_active })
      .eq('id', child.id)
    load()
  }

  const deleteChild = async (childId) => {
    setDeleteTarget(null)
    await supabase.from('children').delete().eq('id', childId)
    load()
  }

  if (loading) {
    return <div className="text-gray-400 py-12 text-center">Loading…</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Children</h1>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by name…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={openAdd}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            Add Child
          </button>
        </div>
      </div>

      {grouped.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm px-4 py-8 text-center text-gray-400">
          {search ? 'No matches' : 'No children yet'}
        </div>
      )}

      {grouped.map((group) => (
        <div key={group.name} className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {group.name} <span className="text-gray-400 font-normal normal-case">({group.rows.length})</span>
          </h2>
          <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Parent Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Active</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {group.rows.map((child) => (
                  <tr
                    key={child.id}
                    className={`border-b last:border-0 hover:bg-gray-50 ${
                      !child.is_active ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {child.full_name}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {child.parent_user_id
                        ? parentEmailMap[child.parent_user_id] || '—'
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          child.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {child.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(child)}
                        className="text-blue-600 hover:underline text-xs mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(child)}
                        className="text-gray-500 hover:underline text-xs mr-3"
                      >
                        {child.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(child)}
                        className="text-red-500 hover:underline text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {deleteTarget && (
        <Modal title="Delete Child" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-gray-700 mb-5">
            Permanently delete <strong>{deleteTarget.full_name}</strong>? All linked
            pickup requests will also be removed. This cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteChild(deleteTarget.id)}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}

      {showModal && (
        <Modal
          title={editing ? 'Edit Child' : 'Add Child'}
          onClose={() => setShowModal(false)}
        >
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Class
            </label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.class_id}
              onChange={(e) => setForm((f) => ({ ...f, class_id: e.target.value }))}
            >
              <option value="">No class</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parent Account
            </label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.parent_user_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, parent_user_id: e.target.value }))
              }
            >
              <option value="">No parent linked</option>
              {availableParents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.email}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

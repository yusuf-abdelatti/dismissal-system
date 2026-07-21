import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../hooks/useAuth'

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

const EMPTY_FORM = { name: '', color: '#6B7280' }

export default function AdminClasses() {
  const { nurseryId } = useAuth()
  const [classes, setClasses] = useState([])
  const [childCounts, setChildCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    load()

    const channel = supabase
      .channel('classes_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'classes' },
        () => load(false)
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    const { data: cls } = await supabase
      .from('classes')
      .select('*')
      .order('name')

    const { data: counts } = await supabase
      .from('children')
      .select('class_id')
      .eq('is_active', true)

    const countMap = {}
    ;(counts || []).forEach((c) => {
      if (c.class_id) countMap[c.class_id] = (countMap[c.class_id] || 0) + 1
    })

    setClasses(cls || [])
    setChildCounts(countMap)
    setLoading(false)
  }

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowModal(true)
  }

  const openEdit = (cls) => {
    setEditing(cls)
    setForm({ name: cls.name, color: cls.color })
    setError(null)
    setShowModal(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      setError('Class name is required.')
      return
    }
    setSaving(true)
    setError(null)

    if (editing) {
      const { error: err } = await supabase
        .from('classes')
        .update({ name: form.name.trim(), color: form.color })
        .eq('id', editing.id)
      if (err) { setError('Something went wrong. Please try again.'); setSaving(false); return }
    } else {
      const { error: err } = await supabase
        .from('classes')
        .insert({ name: form.name.trim(), color: form.color, nursery_id: nurseryId })
      if (err) { setError('Something went wrong. Please try again.'); setSaving(false); return }
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  const deleteClass = async (cls) => {
    if (childCounts[cls.id] > 0) {
      setDeleteConfirm(cls)
      return
    }
    await supabase.from('classes').delete().eq('id', cls.id)
    load()
  }

  if (loading) {
    return <div className="text-gray-400 py-12 text-center">Loading…</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Classes</h1>
        <button
          onClick={openAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Add Class
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Class</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Color</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Children</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {classes.map((cls) => (
              <tr key={cls.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: cls.color }}
                    />
                    <span className="font-medium text-gray-900">{cls.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                  {cls.color}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {childCounts[cls.id] || 0}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => openEdit(cls)}
                    className="text-blue-600 hover:underline mr-4 text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteClass(cls)}
                    className="text-red-500 hover:underline text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {classes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No classes yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit modal */}
      {showModal && (
        <Modal
          title={editing ? 'Edit Class' : 'Add Class'}
          onClose={() => setShowModal(false)}
        >
          {error && (
            <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Class Name
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              />
              <span className="text-gray-500 font-mono text-sm">{form.color}</span>
            </div>
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

      {/* Delete confirmation when children are assigned */}
      {deleteConfirm && (
        <Modal title="Cannot Delete Class" onClose={() => setDeleteConfirm(null)}>
          <p className="text-gray-700 text-sm mb-4">
            <strong>{deleteConfirm.name}</strong> has{' '}
            {childCounts[deleteConfirm.id]} active{' '}
            {childCounts[deleteConfirm.id] === 1 ? 'child' : 'children'} assigned.
            Move or deactivate all children before deleting this class.
          </p>
          <div className="flex justify-end">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg"
            >
              OK
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

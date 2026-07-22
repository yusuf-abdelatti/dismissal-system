import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { createUser } from '../../adminUsers'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
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

const EMPTY_FORM = {
  slug: '',
  name: '',
  logo_url: '',
  primary_color: '#6B9BAF',
  secondary_color: '#C49A45',
  background_color: '#EAE5DF',
  pickup_countdown_minutes: 10,
  daily_reset_hour: 19,
  timezone: 'UTC',
  child_limit: '',
  email_domain: '',
}

function toForm(nursery) {
  return {
    slug: nursery.slug,
    name: nursery.name,
    logo_url: nursery.logo_url || '',
    primary_color: nursery.primary_color,
    secondary_color: nursery.secondary_color,
    background_color: nursery.background_color,
    pickup_countdown_minutes: Math.round(nursery.pickup_countdown_seconds / 60),
    daily_reset_hour: nursery.daily_reset_hour,
    timezone: nursery.timezone,
    child_limit: nursery.child_limit ?? '',
    email_domain: nursery.email_domain || '',
  }
}

function toPayload(form) {
  return {
    slug: form.slug.trim().toLowerCase(),
    name: form.name.trim(),
    logo_url: form.logo_url || null,
    primary_color: form.primary_color,
    secondary_color: form.secondary_color,
    background_color: form.background_color,
    pickup_countdown_seconds: Math.max(1, Number(form.pickup_countdown_minutes) || 10) * 60,
    daily_reset_hour: Number(form.daily_reset_hour),
    timezone: form.timezone.trim() || 'UTC',
    child_limit: form.child_limit === '' ? null : Number(form.child_limit),
    email_domain: form.email_domain.trim().toLowerCase().replace(/^@/, '') || null,
  }
}

export default function SuperAdminNurseries() {
  const [nurseries, setNurseries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const [adminTarget, setAdminTarget] = useState(null)
  const [adminForm, setAdminForm] = useState({ display_name: '', email: '', password: '' })
  const [adminError, setAdminError] = useState(null)
  const [adminSaving, setAdminSaving] = useState(false)
  const [adminSuccess, setAdminSuccess] = useState(null)

  useEffect(() => {
    load()

    const channel = supabase
      .channel('super_admin_nurseries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nurseries' }, () => load(false))
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    const { data } = await supabase.from('nurseries').select('*').order('created_at')
    setNurseries(data || [])
    setLoading(false)
  }

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowModal(true)
  }

  const openEdit = (nursery) => {
    setEditing(nursery)
    setForm(toForm(nursery))
    setError(null)
    setShowModal(true)
  }

  const uploadLogo = async (file) => {
    if (!file) return
    if (!form.slug.trim()) {
      setError('Enter a slug before uploading a logo.')
      return
    }

    setUploadingLogo(true)
    setError(null)

    const ext = file.name.split('.').pop()
    const path = `${form.slug.trim().toLowerCase()}-${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage.from('nursery-logos').upload(path, file, {
      cacheControl: '31536000',
      upsert: true,
    })

    if (uploadErr) {
      setError('Logo upload failed. Please try again.')
      setUploadingLogo(false)
      return
    }

    const { data } = supabase.storage.from('nursery-logos').getPublicUrl(path)
    setForm((f) => ({ ...f, logo_url: data.publicUrl }))
    setUploadingLogo(false)
  }

  const save = async () => {
    if (!form.slug.trim() || !form.name.trim()) {
      setError('Slug and name are required.')
      return
    }
    setSaving(true)
    setError(null)

    const payload = toPayload(form)

    const { error: err } = editing
      ? await supabase.from('nurseries').update(payload).eq('id', editing.id)
      : await supabase.from('nurseries').insert(payload)

    if (err) {
      setError(err.message?.includes('duplicate') ? 'That slug is already taken.' : 'Something went wrong. Please try again.')
      setSaving(false)
      return
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  const toggleActive = async (nursery) => {
    await supabase.from('nurseries').update({ is_active: !nursery.is_active }).eq('id', nursery.id)
    load()
  }

  const openAddAdmin = (nursery) => {
    setAdminTarget(nursery)
    setAdminForm({ display_name: '', email: '', password: '' })
    setAdminError(null)
  }

  const addAdmin = async () => {
    if (!adminForm.display_name.trim() || !adminForm.email.trim() || !adminForm.password) {
      setAdminError('All fields are required.')
      return
    }
    if (adminForm.password.length < 6) {
      setAdminError('Password must be at least 6 characters.')
      return
    }

    setAdminSaving(true)
    setAdminError(null)

    let newUser
    try {
      newUser = await createUser(adminForm.email.trim(), adminForm.password)
    } catch (err) {
      setAdminError(`Failed to create account: ${err.message}`)
      setAdminSaving(false)
      return
    }

    const { error: profileError } = await supabase.from('staff_profiles').insert({
      id: newUser.id,
      nursery_id: adminTarget.id,
      display_name: adminForm.display_name.trim(),
      role: 'admin',
    })

    setAdminSaving(false)

    if (profileError) {
      setAdminError('Account created but profile could not be saved. Please try again.')
      return
    }

    setAdminSuccess(`Admin account created for ${adminTarget.name}.`)
    setAdminTarget(null)
    setTimeout(() => setAdminSuccess(null), 5000)
  }

  if (loading) {
    return <div className="text-gray-400 py-12 text-center">Loading…</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Nurseries</h1>
        <button
          onClick={openAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Add Nursery
        </button>
      </div>

      {adminSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-4 text-sm">
          {adminSuccess}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Nursery</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Slug</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Child Limit</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {nurseries.map((n) => (
              <tr key={n.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: n.primary_color }} />
                    <span className="font-medium text-gray-900">{n.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{n.slug}.technothera.com</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      n.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {n.is_active ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{n.child_limit ?? '—'}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => openAddAdmin(n)} className="text-blue-600 hover:underline text-xs mr-3">
                    Add Admin
                  </button>
                  <button onClick={() => openEdit(n)} className="text-blue-600 hover:underline text-xs mr-3">
                    Edit
                  </button>
                  <button onClick={() => toggleActive(n)} className="text-gray-500 hover:underline text-xs">
                    {n.is_active ? 'Suspend' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
            {nurseries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No nurseries yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit nursery modal */}
      {showModal && (
        <Modal title={editing ? 'Edit Nursery' : 'Add Nursery'} onClose={() => setShowModal(false)}>
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
              Slug <span className="text-gray-400 font-normal">(becomes &lt;slug&gt;.technothera.com)</span>
            </label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              disabled={!!editing}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
            <div className="flex items-center gap-3">
              {form.logo_url && (
                <img
                  src={form.logo_url}
                  alt="Logo preview"
                  className="w-12 h-12 rounded-lg object-contain border border-gray-200 bg-gray-50"
                />
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="flex-1 text-sm text-gray-600"
                onChange={(e) => uploadLogo(e.target.files?.[0])}
                disabled={uploadingLogo}
              />
            </div>
            {uploadingLogo && <p className="text-xs text-gray-400 mt-1">Uploading…</p>}
            <p className="text-xs text-gray-400 mt-1">Square image, at least 512×512px, works best.</p>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Primary</label>
              <input
                type="color"
                className="w-full h-10 rounded cursor-pointer border border-gray-300"
                value={form.primary_color}
                onChange={(e) => setForm((f) => ({ ...f, primary_color: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Secondary</label>
              <input
                type="color"
                className="w-full h-10 rounded cursor-pointer border border-gray-300"
                value={form.secondary_color}
                onChange={(e) => setForm((f) => ({ ...f, secondary_color: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Background</label>
              <input
                type="color"
                className="w-full h-10 rounded cursor-pointer border border-gray-300"
                value={form.background_color}
                onChange={(e) => setForm((f) => ({ ...f, background_color: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pickup countdown (min)</label>
              <input
                type="number"
                min="1"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.pickup_countdown_minutes}
                onChange={(e) => setForm((f) => ({ ...f, pickup_countdown_minutes: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Daily reset hour (0-23)</label>
              <input
                type="number"
                min="0"
                max="23"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.daily_reset_hour}
                onChange={(e) => setForm((f) => ({ ...f, daily_reset_hour: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Timezone <span className="text-gray-400 font-normal">(IANA)</span>
              </label>
              <input
                type="text"
                placeholder="Africa/Cairo"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Child limit <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="number"
                min="0"
                placeholder="Unlimited"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.child_limit}
                onChange={(e) => setForm((f) => ({ ...f, child_limit: e.target.value }))}
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Staff/Parent Email Domain <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="flex items-center gap-1">
              <span className="text-gray-400 text-sm">@</span>
              <input
                type="text"
                placeholder="finnly.com"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.email_domain}
                onChange={(e) => setForm((f) => ({ ...f, email_domain: e.target.value }))}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              When set, this nursery's admin can only create staff/parent accounts ending in this domain.
            </p>
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

      {/* Add first admin modal */}
      {adminTarget && (
        <Modal title={`Add Admin — ${adminTarget.name}`} onClose={() => setAdminTarget(null)}>
          {adminError && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{adminError}</div>}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={adminForm.display_name}
              onChange={(e) => setAdminForm((f) => ({ ...f, display_name: e.target.value }))}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={adminForm.email}
              onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Initial Password</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={adminForm.password}
              onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="min. 6 characters"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button onClick={() => setAdminTarget(null)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
            <button
              onClick={addAdmin}
              disabled={adminSaving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {adminSaving ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

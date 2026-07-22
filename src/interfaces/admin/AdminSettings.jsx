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

function toForm(nursery) {
  return {
    name: nursery.name,
    logo_url: nursery.logo_url || '',
    primary_color: nursery.primary_color,
    secondary_color: nursery.secondary_color,
    background_color: nursery.background_color,
    pickup_countdown_minutes: Math.round(nursery.pickup_countdown_seconds / 60),
    daily_reset_hour: nursery.daily_reset_hour,
    timezone: nursery.timezone,
  }
}

export default function AdminSettings() {
  const { nurseryId } = useAuth()
  const [nursery, setNursery] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!nurseryId) return
    supabase
      .from('nurseries')
      .select('*')
      .eq('id', nurseryId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setNursery(data)
          setForm(toForm(data))
        }
      })
  }, [nurseryId])

  const uploadLogo = async (file) => {
    if (!file || !nursery) return
    setUploadingLogo(true)
    setError(null)

    const ext = file.name.split('.').pop()
    const path = `${nursery.slug}-${Date.now()}.${ext}`

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
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    setSaving(true)
    setError(null)

    const { error: err } = await supabase
      .from('nurseries')
      .update({
        name: form.name.trim(),
        logo_url: form.logo_url || null,
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        background_color: form.background_color,
        pickup_countdown_seconds: Math.max(1, Number(form.pickup_countdown_minutes) || 10) * 60,
        daily_reset_hour: Number(form.daily_reset_hour),
        timezone: form.timezone.trim() || 'UTC',
      })
      .eq('id', nurseryId)

    setSaving(false)

    if (err) {
      setError('Something went wrong. Please try again.')
      return
    }

    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  const endOfDayReset = async () => {
    setResetting(true)
    setError(null)
    const today = new Date().toISOString().split('T')[0]

    const { error: err } = await supabase
      .from('pickup_requests')
      .update({ status: 'cleared' })
      .eq('date', today)
      .not('status', 'in', '(delivered,cleared)')

    setShowResetConfirm(false)
    setResetting(false)

    if (err) {
      setError('Something went wrong. Please try again.')
      return
    }

    setResetSuccess(true)
    setTimeout(() => setResetSuccess(false), 5000)
  }

  if (!form) {
    return <div className="text-gray-400 py-12 text-center">Loading…</div>
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Branding */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-4">
        <h2 className="font-semibold text-gray-900 mb-1">Branding</h2>
        <p className="text-gray-500 text-sm mb-4">
          Your name, logo and colors — shown across the display board, staff app, parent app and login page.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nursery Name</label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
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

        <div className="grid grid-cols-3 gap-3">
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
      </div>

      {/* Pickup timer + daily reset */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-4">
        <h2 className="font-semibold text-gray-900 mb-1">Pickup Timer & Daily Reset</h2>
        <p className="text-gray-500 text-sm mb-4">
          How long the countdown runs after a pickup request, and when today's board automatically clears.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Countdown (minutes)</label>
            <input
              type="number"
              min="1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.pickup_countdown_minutes}
              onChange={(e) => setForm((f) => ({ ...f, pickup_countdown_minutes: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Daily reset hour (0–23)</label>
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Timezone <span className="text-gray-400 font-normal">(IANA, e.g. Africa/Cairo)</span>
          </label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.timezone}
            onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
      {success && (
        <p className="text-green-600 text-xs text-right -mt-3 mb-4">Settings updated.</p>
      )}

      {/* Manual end-of-day reset */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Reset Today's Requests Now</h2>
        <p className="text-gray-500 text-sm mb-4">
          Clears all active pickup requests immediately, ahead of the automatic daily reset time above.
          Delivered records are kept in History.
        </p>

        {resetSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-4 text-sm">
            All active requests for today have been cleared.
          </div>
        )}

        <button
          onClick={() => setShowResetConfirm(true)}
          className="bg-red-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
        >
          Reset Today's Requests
        </button>
      </div>

      {/* Reset confirmation modal */}
      {showResetConfirm && (
        <Modal
          title="Confirm Reset"
          onClose={() => setShowResetConfirm(false)}
        >
          <p className="text-sm text-gray-700 mb-5">
            This will clear all active pickup requests for today. Delivered
            records are kept. This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={endOfDayReset}
              disabled={resetting}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {resetting ? 'Resetting…' : 'Yes, Reset'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { usePickupRequests } from '../../hooks/usePickupRequests'

const STATUS_STYLES = {
  requested: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Requested' },
  arrived:   { bg: 'bg-red-100',  text: 'text-red-700',  label: 'Arrived'   },
  ready:     { bg: 'bg-green-100', text: 'text-green-700', label: 'Ready'   },
}

function formatTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function AdminRequests() {
  const { requests, loading, refetch } = usePickupRequests()
  const [showConfirm, setShowConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)

  const clearRequest = async (id) => {
    await supabase
      .from('pickup_requests')
      .update({ status: 'cleared' })
      .eq('id', id)
    // real-time subscription in the hook will re-fetch automatically
  }

  const markDelivered = async (id) => {
    await supabase
      .from('pickup_requests')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', id)
    // real-time subscription in the hook will re-fetch automatically
  }

  const clearAll = async () => {
    setShowConfirm(false)
    setClearing(true)
    const ids = requests.map((r) => r.id)
    await supabase
      .from('pickup_requests')
      .update({ status: 'cleared' })
      .in('id', ids)
    setClearing(false)
    refetch()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Active Requests</h1>
        {requests.length > 0 && (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={clearing}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            Clear All Active
          </button>
        )}
      </div>

      {loading && (
        <div className="text-gray-400 py-12 text-center">Loading…</div>
      )}

      {!loading && requests.length === 0 && (
        <div className="text-gray-400 py-12 text-center">No active pickup requests today</div>
      )}

      {!loading && requests.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Child</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Class</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Requested</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => {
                const child = req.children
                const cls = child?.classes
                const style = STATUS_STYLES[req.status] || STATUS_STYLES.requested
                const color = cls?.color || '#6B7280'

                return (
                  <tr key={req.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {child?.full_name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${color}20`, color }}
                      >
                        {cls?.name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                        {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 tabular-nums">
                      {formatTime(req.requested_at)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => markDelivered(req.id)}
                        className="text-blue-600 hover:underline text-xs mr-3"
                      >
                        Mark Delivered
                      </button>
                      <button
                        onClick={() => clearRequest(req.id)}
                        className="text-red-500 hover:underline text-xs"
                      >
                        Clear
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Clear All Active Requests?</h2>
            <p className="text-sm text-gray-600 mb-5">
              This will mark all {requests.length} active request{requests.length !== 1 ? 's' : ''} as cleared. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={clearAll}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

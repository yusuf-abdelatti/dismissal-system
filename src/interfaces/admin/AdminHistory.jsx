import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'

const STATUS_STYLES = {
  requested: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Requested' },
  ready: { bg: 'bg-green-100', text: 'text-green-700', label: 'Ready' },
  arrived: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Arrived' },
  delivered: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Delivered' },
  cleared: { bg: 'bg-gray-100', text: 'text-gray-400', label: 'Cleared' },
}

function formatTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function todayLocal() {
  const d = new Date()
  const offset = d.getTimezoneOffset()
  return new Date(d.getTime() - offset * 60000).toISOString().split('T')[0]
}

export default function AdminHistory() {
  const [date, setDate] = useState(todayLocal())
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [date])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('pickup_requests')
      .select('*, children(full_name, classes(name, color))')
      .eq('date', date)
      .order('requested_at', { ascending: false })

    setRequests(data || [])
    setLoading(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">History</h1>
        <input
          type="date"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={date}
          max={todayLocal()}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {loading && <div className="text-gray-400 py-12 text-center">Loading…</div>}

      {!loading && requests.length === 0 && (
        <div className="text-gray-400 py-12 text-center">No requests on this date</div>
      )}

      {!loading && requests.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Child</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Class</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Requested</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Arrived</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Delivered</th>
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
                    <td className="px-4 py-3 text-gray-500 tabular-nums">{formatTime(req.requested_at)}</td>
                    <td className="px-4 py-3 text-gray-500 tabular-nums">{formatTime(req.arrived_at)}</td>
                    <td className="px-4 py-3 text-gray-500 tabular-nums">{formatTime(req.delivered_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

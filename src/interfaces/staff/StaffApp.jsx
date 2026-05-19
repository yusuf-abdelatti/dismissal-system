import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { usePickupRequests } from '../../hooks/usePickupRequests'
import { sortRequests } from '../../utils/sorting'
import { getCountdownSeconds, formatCountdown } from '../../utils/countdown'

function CountdownBadge({ requestedAt, status }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  void tick

  if (status === 'arrived') {
    return (
      <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 font-bold text-sm px-3 py-1 rounded-full">
        ⚡ ARRIVED
      </span>
    )
  }

  if (status === 'ready') {
    return (
      <span className="inline-flex items-center bg-green-100 text-green-700 font-semibold text-sm px-3 py-1 rounded-full">
        Ready
      </span>
    )
  }

  const remaining = getCountdownSeconds(requestedAt)
  const text = formatCountdown(remaining)

  if (!text) {
    return (
      <span className="text-amber-600 text-sm font-medium">Arriving Soon</span>
    )
  }

  return (
    <span className="text-gray-500 text-sm font-mono tabular-nums">{text}</span>
  )
}

function RequestCard({ request, onMarkReady, onMarkDelivered, delivering }) {
  const child = request.children
  const classColor = child?.classes?.color || '#6B7280'
  const isArrived = request.status === 'arrived'
  const isReady = request.status === 'ready'
  const isFading = delivering.has(request.id)

  return (
    <div
      className="rounded-xl p-4 mb-3 border transition-all duration-1000"
      style={{
        borderColor: `${classColor}40`,
        backgroundColor: isArrived ? `${classColor}15` : 'white',
        boxShadow: isArrived ? `0 0 12px ${classColor}44` : '0 1px 3px rgba(0,0,0,0.06)',
        opacity: isFading ? 0 : 1,
      }}
    >
      {/* Top row */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: classColor }}
        />
        <span className="font-semibold text-gray-900 text-lg flex-1 truncate">
          {child?.full_name || '—'}
        </span>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${classColor}20`, color: classColor }}
        >
          {child?.classes?.name || '—'}
        </span>
        <CountdownBadge
          requestedAt={request.requested_at}
          status={request.status}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onMarkReady(request.id)}
          disabled={isReady || isArrived || isFading}
          className="flex-1 py-3 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed"
          style={
            isReady || isArrived
              ? { backgroundColor: '#D1FAE5', color: '#065F46' }
              : { backgroundColor: '#EFF6FF', color: '#1D4ED8' }
          }
        >
          {isReady ? '✓ Ready' : 'Mark Ready'}
        </button>
        <button
          onClick={() => onMarkDelivered(request.id)}
          disabled={isFading}
          className="flex-1 py-3 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          Mark Delivered
        </button>
      </div>
    </div>
  )
}

export default function StaffApp() {
  const { user } = useAuth()
  const [staffName, setStaffName] = useState('')
  const [classes, setClasses] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [delivering, setDelivering] = useState(new Set())
  const [error, setError] = useState(null)

  const filter = selectedClass ? { classId: selectedClass } : {}
  const { requests, loading } = usePickupRequests(filter)

  useEffect(() => {
    if (!user) return

    supabase
      .from('staff_profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) setStaffName(data.display_name)
      })

    supabase
      .from('classes')
      .select('id, name')
      .order('name')
      .then(({ data }) => setClasses(data || []))
  }, [user])

  const markReady = async (requestId) => {
    setError(null)
    const { error: err } = await supabase
      .from('pickup_requests')
      .update({ status: 'ready', ready_at: new Date().toISOString() })
      .eq('id', requestId)

    if (err) setError('Something went wrong. Please try again.')
  }

  const markDelivered = async (requestId) => {
    setError(null)
    setDelivering((prev) => new Set(prev).add(requestId))

    const { error: err } = await supabase
      .from('pickup_requests')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', requestId)

    if (err) {
      setError('Something went wrong. Please try again.')
      setDelivering((prev) => {
        const next = new Set(prev)
        next.delete(requestId)
        return next
      })
      return
    }

    // Real-time hook will remove the record; keep fade going for 2s
    setTimeout(() => {
      setDelivering((prev) => {
        const next = new Set(prev)
        next.delete(requestId)
        return next
      })
    }, 2000)
  }

  const logout = async () => {
    await supabase.auth.signOut()
  }

  const sorted = sortRequests(requests)

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <span className="font-semibold text-gray-800">
            {staffName || 'Staff'}
          </span>
        </div>

        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Classes</option>
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </select>

        <button
          onClick={logout}
          className="text-gray-500 hover:text-gray-800 text-sm px-3 py-2 border border-gray-200 rounded-lg transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Request list */}
      <div className="flex-1 p-4 max-w-2xl mx-auto w-full">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-3 text-sm">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            No active pickup requests
          </div>
        )}

        {!loading &&
          sorted.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              onMarkReady={markReady}
              onMarkDelivered={markDelivered}
              delivering={delivering}
            />
          ))}
      </div>
    </div>
  )
}

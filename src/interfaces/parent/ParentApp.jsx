import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { useTenant } from '../../hooks/useTenant'
import { usePushNotifications } from '../../hooks/usePushNotifications'
import { getCountdownSeconds, formatCountdown, isOverdue } from '../../utils/countdown'

function Countdown({ requestedAt, durationSeconds, className }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  void tick

  const text = formatCountdown(getCountdownSeconds(requestedAt, durationSeconds))
  if (!text) return null

  return <p className={className}>{text} remaining</p>
}

function ArrivedStatus({ requestedAt, durationSeconds, firstName }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  void tick

  if (isOverdue(requestedAt, durationSeconds)) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-amber-700 text-sm font-medium">
        Any moment now — thank you for your patience
      </div>
    )
  }

  const text = formatCountdown(getCountdownSeconds(requestedAt, durationSeconds))

  return (
    <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-green-700 text-sm font-medium">
      <p>You arrived a little early — we'll bring {firstName || 'your child'} out as soon as we can 💛</p>
      {text && <p className="mt-2 font-mono text-lg tabular-nums text-green-800">{text} remaining</p>}
    </div>
  )
}

function deliveryMessageFor(request, durationSeconds) {
  if (!request?.delivered_at || !request?.requested_at) return null

  const deadline = new Date(request.requested_at).getTime() + durationSeconds * 1000
  const deliveredAt = new Date(request.delivered_at).getTime()
  const minutesEarly = Math.round((deadline - deliveredAt) / 60000)

  if (minutesEarly >= 1) return `Delivered ${minutesEarly} minute${minutesEarly === 1 ? '' : 's'} early.`
  if (minutesEarly === 0) return 'Delivered right on time.'
  return null // late — no message, per product decision
}

export default function ParentApp() {
  const { user } = useAuth()
  const { tenant } = useTenant()
  const [child, setChild] = useState(null)
  const [request, setRequest] = useState(null)
  const [loadingData, setLoadingData] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showGoodbye, setShowGoodbye] = useState(false)
  const [goodbyeMessage, setGoodbyeMessage] = useState(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const channelRef = useRef(null)
  const { status, errorMsg, isSupported, subscribe } = usePushNotifications(user?.id)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (!user) return
    loadChild()

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [user])

  const loadChild = async () => {
    setLoadingData(true)
    setError(null)

    const { data: childData, error: childError } = await supabase
      .from('children')
      .select('*, classes(name, color)')
      .eq('parent_user_id', user.id)
      .eq('is_active', true)
      .single()

    if (childError || !childData) {
      setError('No child account linked. Please contact the nursery.')
      setLoadingData(false)
      return
    }

    setChild(childData)
    await loadTodayRequest(childData.id)
    subscribeToChild(childData.id)
    setLoadingData(false)
  }

  const loadTodayRequest = async (childId) => {
    const { data } = await supabase
      .from('pickup_requests')
      .select('*')
      .eq('child_id', childId)
      .eq('date', today)
      .not('status', 'in', '(delivered,cleared)')
      .maybeSingle()

    setRequest(data ?? null)
  }

  const subscribeToChild = (childId) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    const channel = supabase
      .channel(`parent_${childId}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pickup_requests',
          filter: `child_id=eq.${childId}`,
        },
        (payload) => {
          const updated = payload.new
          if (!updated) return

          if (updated.status === 'delivered') {
            setGoodbyeMessage(deliveryMessageFor(updated, tenant.pickupCountdownSeconds))
            setShowGoodbye(true)
            setTimeout(() => {
              setShowGoodbye(false)
              setGoodbyeMessage(null)
              setRequest(null)
            }, 3000)
          } else if (updated.status === 'cleared') {
            // Cancelled (by the parent) or cleared out (end-of-day reset) —
            // neither is a "goodbye, see you tomorrow" moment, just reset quietly.
            setRequest(null)
          } else {
            setRequest(updated)
          }
        }
      )
      .subscribe()

    channelRef.current = channel
  }

  const requestPickup = async () => {
    setActionLoading(true)
    setError(null)

    const { data, error: insertError } = await supabase
      .from('pickup_requests')
      .insert({ child_id: child.id, nursery_id: child.nursery_id, status: 'requested', date: today })
      .select()
      .single()

    if (insertError) {
      setError('Something went wrong. Please try again.')
      setActionLoading(false)
      return
    }

    setRequest(data)
    setActionLoading(false)
  }

  const cancelRequest = async () => {
    setActionLoading(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('pickup_requests')
      .update({ status: 'cleared' })
      .eq('id', request.id)

    if (updateError) {
      setError('Something went wrong. Please try again.')
    } else {
      setRequest(null)
    }
    setConfirmingCancel(false)
    setActionLoading(false)
  }

  const markArrived = async () => {
    setActionLoading(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('pickup_requests')
      .update({ status: 'arrived', arrived_at: new Date().toISOString() })
      .eq('id', request.id)

    if (updateError) {
      setError('Something went wrong. Please try again.')
    }
    setActionLoading(false)
  }

  const logout = async () => {
    await supabase.auth.signOut()
  }

  if (loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: tenant.backgroundColor }}>
        <div className="text-gray-500 text-lg">Loading…</div>
      </div>
    )
  }

  if (error && !child) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: tenant.backgroundColor }}>
        <div className="text-center">
          <p className="text-red-600 text-lg mb-4">{error}</p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-gray-500 underline"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const accentColor = child?.classes?.color || tenant.primaryColor
  const firstName = child?.full_name?.split(' ')[0] || child?.full_name || ''

  // State E — goodbye after delivered/cleared
  if (showGoodbye) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: `${accentColor}15` }}>
        <div className="text-center">
          <div className="text-5xl mb-4">👋</div>
          <h2 className="text-2xl font-bold text-gray-800">Goodbye!</h2>
          <p className="text-gray-500 mt-2">{goodbyeMessage || 'See you tomorrow'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: tenant.backgroundColor }}>
      {/* Header */}
      <div
        className="px-6 pb-8 text-white"
        style={{ backgroundColor: accentColor, paddingTop: 'max(3rem, calc(1.5rem + env(safe-area-inset-top)))' }}
      >
        <div className="flex justify-between items-start">
          <div>
            <p className="text-white text-opacity-80 text-sm font-medium uppercase tracking-wide">
              {child?.classes?.name || 'Nursery'}
            </p>
            <h1 className="text-3xl font-bold mt-1">{child?.full_name}</h1>
          </div>
          <button
            onClick={logout}
            className="text-white text-opacity-70 text-xs border border-white border-opacity-30 rounded px-2 py-1 mt-1"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-6">
        {error && (
          <div className="w-full max-w-sm bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm text-center">
            {error}
          </div>
        )}

        {/* State A — no active request */}
        {!request && (
          <div className="w-full max-w-sm text-center">
            {isSupported && status !== 'subscribed' && status !== 'denied' && (
              <div className="w-full max-w-sm bg-amber-50 border border-amber-200 px-4 py-3 rounded-xl mb-4 flex items-center justify-between">
                <span className="text-sm text-amber-800">
                  Get notified when your child is ready
                </span>
                <button
                  onClick={subscribe}
                  disabled={status === 'requesting'}
                  className="ml-3 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                  style={{ backgroundColor: tenant.secondaryColor }}
                >
                  {status === 'requesting' ? '…' : 'Enable'}
                </button>
              </div>
            )}
            {errorMsg && (
              <p className="text-red-600 text-xs mb-4">{errorMsg}</p>
            )}
            <p className="text-gray-500 mb-8 text-lg">Ready for pickup?</p>
            <button
              onClick={requestPickup}
              disabled={actionLoading}
              className="w-full text-white font-semibold text-xl py-5 rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50"
              style={{ backgroundColor: tenant.primaryColor, minHeight: '72px' }}
            >
              {actionLoading ? 'Sending…' : 'Request Pickup'}
            </button>
          </div>
        )}

        {/* State B — requested, staff notified */}
        {request && request.status === 'requested' && (
          <div className="w-full max-w-sm text-center">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-8">
              <p className="font-semibold text-gray-800 text-lg">
                Pickup requested
              </p>
              <p className="text-gray-500 text-sm mt-1">
                Staff have been notified
              </p>
              <Countdown
                requestedAt={request.requested_at}
                durationSeconds={tenant.pickupCountdownSeconds}
                className="text-blue-600 text-sm font-mono tabular-nums mt-3"
              />
            </div>
            <p className="text-gray-500 mb-4 text-sm">
              Press the button below when you arrive at the nursery
            </p>
            <button
              onClick={markArrived}
              disabled={actionLoading}
              className="w-full text-white font-semibold text-xl py-5 rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50"
              style={{ backgroundColor: tenant.secondaryColor, minHeight: '72px' }}
            >
              {actionLoading ? 'Updating…' : 'I Have Arrived'}
            </button>
            {confirmingCancel ? (
              <div className="w-full mt-4 bg-red-50 border border-red-200 rounded-xl p-4 text-left">
                <p className="text-sm text-red-700 mb-3 text-center">Cancel this pickup request?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmingCancel(false)}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700"
                  >
                    Keep it
                  </button>
                  <button
                    onClick={cancelRequest}
                    disabled={actionLoading}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white disabled:opacity-50"
                  >
                    {actionLoading ? 'Cancelling…' : 'Yes, Cancel'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="text-gray-400 text-sm underline mt-4"
              >
                Cancel request
              </button>
            )}
          </div>
        )}

        {/* State C — ready, warm message */}
        {request && request.status === 'ready' && (
          <div className="w-full max-w-sm text-center">
            <div className="rounded-2xl p-6 mb-6" style={{ backgroundColor: '#FFFBEB', border: `1px solid ${tenant.secondaryColor}` }}>
              <div className="text-4xl mb-3">🌟</div>
              <p className="font-bold text-gray-800 text-xl mb-2">
                {firstName} is ready and waiting for you!
              </p>
              <p className="text-amber-700 text-sm">
                Come on over — we'll have them at the door with a smile 💛
              </p>
              <Countdown
                requestedAt={request.requested_at}
                durationSeconds={tenant.pickupCountdownSeconds}
                className="text-amber-700 text-sm font-mono tabular-nums mt-3"
              />
            </div>
            <p className="text-gray-500 mb-4 text-sm">
              Press the button below when you arrive
            </p>
            <button
              onClick={markArrived}
              disabled={actionLoading}
              className="w-full text-white font-semibold text-xl py-5 rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50"
              style={{ backgroundColor: tenant.secondaryColor, minHeight: '72px' }}
            >
              {actionLoading ? 'Updating…' : 'I Have Arrived'}
            </button>
            {confirmingCancel ? (
              <div className="w-full mt-4 bg-red-50 border border-red-200 rounded-xl p-4 text-left">
                <p className="text-sm text-red-700 mb-3 text-center">Cancel this pickup request?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmingCancel(false)}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700"
                  >
                    Keep it
                  </button>
                  <button
                    onClick={cancelRequest}
                    disabled={actionLoading}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white disabled:opacity-50"
                  >
                    {actionLoading ? 'Cancelling…' : 'Yes, Cancel'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingCancel(true)}
                className="text-gray-400 text-sm underline mt-4"
              >
                Cancel request
              </button>
            )}
          </div>
        )}

        {/* State D — arrived, awaiting handoff */}
        {request && request.status === 'arrived' && (
          <div className="w-full max-w-sm text-center">
            <div className="rounded-2xl p-6 mb-6" style={{ backgroundColor: `${accentColor}15` }}>
              <div className="flex justify-center mb-4">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${accentColor}25` }}
                >
                  <div
                    className="w-8 h-8 rounded-full animate-pulse"
                    style={{ backgroundColor: accentColor }}
                  />
                </div>
              </div>
              <p className="font-bold text-gray-800 text-xl mb-2">You're here!</p>
              <p className="text-gray-600">
                We're bringing {firstName} to you now 🤗
              </p>
            </div>

            <ArrivedStatus requestedAt={request.requested_at} durationSeconds={tenant.pickupCountdownSeconds} firstName={firstName} />
          </div>
        )}
      </div>
    </div>
  )
}

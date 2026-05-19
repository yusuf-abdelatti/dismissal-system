import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../hooks/useAuth'

export default function ParentApp() {
  const { user } = useAuth()
  const [child, setChild] = useState(null)
  const [request, setRequest] = useState(null)
  const [loadingData, setLoadingData] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showGoodbye, setShowGoodbye] = useState(false)
  const channelRef = useRef(null)

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
            setShowGoodbye(true)
            setTimeout(() => {
              setShowGoodbye(false)
              setRequest(null)
            }, 3000)
          } else if (updated.status === 'cleared') {
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
      .insert({ child_id: child.id, status: 'requested', date: today })
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading…</div>
      </div>
    )
  }

  if (error && !child) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
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

  const accentColor = child?.classes?.color || '#3B82F6'

  if (showGoodbye) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: `${accentColor}15` }}>
        <div className="text-center">
          <div className="text-5xl mb-4">👋</div>
          <h2 className="text-2xl font-bold text-gray-800">Goodbye!</h2>
          <p className="text-gray-500 mt-2">See you tomorrow</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div
        className="px-6 pt-12 pb-8 text-white"
        style={{ backgroundColor: accentColor }}
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
            <p className="text-gray-500 mb-8 text-lg">Ready for pickup?</p>
            <button
              onClick={requestPickup}
              disabled={actionLoading}
              className="w-full text-white font-semibold text-xl py-5 rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50"
              style={{ backgroundColor: accentColor, minHeight: '72px' }}
            >
              {actionLoading ? 'Sending…' : 'Request Pickup'}
            </button>
          </div>
        )}

        {/* State B — requested, not yet arrived */}
        {request && request.status === 'requested' && (
          <div className="w-full max-w-sm text-center">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-8">
              <p className="font-semibold text-gray-800 text-lg">
                Pickup requested
              </p>
              <p className="text-gray-500 text-sm mt-1">
                Staff have been notified
              </p>
            </div>
            <p className="text-gray-500 mb-4 text-sm">
              Press the button below when you arrive at the nursery
            </p>
            <button
              onClick={markArrived}
              disabled={actionLoading}
              className="w-full bg-green-500 text-white font-semibold text-xl py-5 rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50"
              style={{ minHeight: '72px' }}
            >
              {actionLoading ? 'Updating…' : 'I Have Arrived'}
            </button>
          </div>
        )}

        {/* State C — arrived, awaiting handoff */}
        {request && (request.status === 'arrived' || request.status === 'ready') && (
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
              <p className="font-bold text-gray-800 text-xl">You're here!</p>
              <p className="text-gray-600 mt-2">
                Staff are bringing {child?.full_name?.split(' ')[0]} to you.
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 text-green-700 text-sm font-medium">
              Arrival confirmed — please wait
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

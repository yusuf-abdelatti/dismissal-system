import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { useTenant } from '../../hooks/useTenant'
import { usePickupRequests } from '../../hooks/usePickupRequests'
import { sortRequests } from '../../utils/sorting'
import { playNewRequestSound, playArrivalSound } from '../../utils/sound'
import RequestRow from '../../components/RequestRow'

function LiveClock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="text-right">
      <div className="text-2xl font-bold tabular-nums text-gray-100">
        {now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </div>
      <div className="text-gray-500 text-sm">
        {now.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </div>
    </div>
  )
}

function LiveBoard({ audioCtx, tenant }) {
  const { requests, loading } = usePickupRequests()
  const [tick, setTick] = useState(0)
  const seenRef = useRef({}) // id -> last known status

  // Tick every second to drive countdown re-renders
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Sound triggers — fire when requests change
  useEffect(() => {
    if (!audioCtx) return

    requests.forEach((req) => {
      const prev = seenRef.current[req.id]

      if (prev === undefined) {
        playNewRequestSound(audioCtx)
      } else if (prev !== 'arrived' && req.status === 'arrived') {
        playArrivalSound(audioCtx)
      }

      seenRef.current[req.id] = req.status
    })

    // Prune stale IDs
    const currentIds = new Set(requests.map((r) => r.id))
    Object.keys(seenRef.current).forEach((id) => {
      if (!currentIds.has(id)) delete seenRef.current[id]
    })
  }, [requests, audioCtx])

  const sorted = sortRequests(requests, tenant.pickupCountdownSeconds)

  return (
    <div className="min-h-screen bg-[#0F1117] flex flex-col font-mono">
      {/* Header */}
      <div
        className="flex justify-between items-center px-8 py-5 border-b border-gray-800"
        style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
      >
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <img src={tenant.logoUrl} alt={tenant.name} className="h-8 w-auto" />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: tenant.primaryColor }}>
              {tenant.name}
            </span>
          </div>
          <div className="text-2xl font-bold text-white">{tenant.name}</div>
          <div className="text-gray-500 text-xs mt-0.5 uppercase tracking-widest">
            Live Dismissal Board
          </div>
        </div>
        <LiveClock />
      </div>

      {/* Request list */}
      <div className="flex-1 px-4 py-4 overflow-auto">
        {loading && (
          <div className="text-gray-600 text-center py-20 text-lg">
            Loading…
          </div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="text-gray-700 text-center py-20 text-xl">
            No active pickup requests
          </div>
        )}

        {!loading &&
          sorted.map((req) => (
            <RequestRow key={req.id} request={req} tick={tick} />
          ))}
      </div>
    </div>
  )
}

export default function DisplayScreen() {
  const { tenant: baseTenant } = useTenant()
  const [tenant, setTenant] = useState(baseTenant)
  const [activated, setActivated] = useState(false)
  const [audioCtx, setAudioCtx] = useState(null)

  useEffect(() => {
    setTenant(baseTenant)
  }, [baseTenant])

  // Live-sync branding if the nursery admin edits name/colors mid-day —
  // same behavior the old settings-table subscription provided.
  useEffect(() => {
    if (!baseTenant?.id) return

    const channel = supabase
      .channel(`nursery_${baseTenant.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'nurseries', filter: `id=eq.${baseTenant.id}` },
        (payload) => {
          const row = payload.new
          if (!row) return
          setTenant((t) => ({
            ...t,
            name: row.name ?? t.name,
            logoUrl: row.logo_url ?? t.logoUrl,
            primaryColor: row.primary_color ?? t.primaryColor,
          }))
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [baseTenant?.id])

  const activate = async () => {
    const ctx = new AudioContext()
    setAudioCtx(ctx)

    try {
      await document.documentElement.requestFullscreen()
    } catch {
      // Fullscreen not available in all environments — continue anyway
    }

    setActivated(true)
  }

  if (!activated) {
    return (
      <div
        className="fixed inset-0 bg-[#0F1117] flex flex-col items-center justify-center cursor-pointer select-none"
        onClick={activate}
      >
        <div className="text-center px-8">
          <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: tenant.primaryColor }}>
            {tenant.name}
          </div>
          <h1 className="text-white text-4xl font-bold mb-2">{tenant.name}</h1>
          <p className="text-gray-600 text-sm mb-12 uppercase tracking-widest">
            Dismissal System
          </p>
          <button
            className="text-white text-2xl font-semibold px-16 py-7 rounded-2xl transition-opacity shadow-2xl"
            style={{ backgroundColor: tenant.primaryColor }}
            onClick={(e) => {
              e.stopPropagation()
              activate()
            }}
          >
            Activate Display Screen
          </button>
          <p className="text-gray-700 text-xs mt-6">
            Click anywhere or the button above to begin
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation()
              supabase.auth.signOut()
            }}
            className="text-gray-700 text-xs underline mt-8 hover:text-gray-400"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return <LiveBoard audioCtx={audioCtx} tenant={tenant} />
}

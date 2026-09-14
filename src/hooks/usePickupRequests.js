import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'

// Periodically rebuild the realtime channel from scratch, not just
// re-fetch data — covers the case where the channel itself is silently
// stuck (not just the data being momentarily stale).
const HARD_RESYNC_INTERVAL_MS = 20 * 60 * 1000

export function usePickupRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef(null)

  const today = new Date().toISOString().split('T')[0]

  const removeRequest = useCallback((id) => {
    setRequests((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from('pickup_requests')
      .select(`
        *,
        children (
          id,
          full_name,
          class_id,
          classes (
            id,
            name,
            color
          )
        )
      `)
      .eq('date', today)
      .not('status', 'in', '("delivered","cleared")')
      .order('requested_at', { ascending: true })

    if (!error && data) {
      setRequests(data)
    }
    setLoading(false)
  }

  const subscribe = () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }
    const channel = supabase
      .channel(`pickup_realtime_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pickup_requests' },
        () => fetchRequests()
      )
      .subscribe()
    channelRef.current = channel
  }

  // Re-fetches and rebuilds the realtime channel from scratch — the same
  // recovery a manual page refresh gives you, without actually reloading
  // the page. That matters most for the display screen: a real reload
  // would drop it out of fullscreen and mute the sound until someone
  // physically walks over and taps it again.
  const resync = () => {
    fetchRequests()
    subscribe()
  }

  useEffect(() => {
    resync()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') resync()
    }

    // A kiosk-style screen (the display board) never goes hidden, so the
    // visibilitychange resync above never fires for it — but the browser
    // still tells us the moment connectivity actually comes back after a
    // WiFi drop, which is exactly the gap a manual refresh was covering.
    const handleOnline = () => resync()

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    // Safety net for kiosk-style screens (the display board) that never go
    // hidden, so the visibilitychange resync above never fires for them —
    // if the realtime socket silently dies after hours of uptime (idle
    // proxy timeout, brief network drop) with nothing to trigger a resync,
    // a long-running screen could keep showing a stale request indefinitely.
    // This guarantees it self-heals within one interval regardless of why
    // realtime stopped, without touching the realtime path itself.
    const pollInterval = setInterval(fetchRequests, 30000)

    // Belt-and-suspenders on top of the poll above, for a connection that's
    // stuck rather than just momentarily behind.
    const hardResyncInterval = setInterval(resync, HARD_RESYNC_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      clearInterval(pollInterval)
      clearInterval(hardResyncInterval)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [])

  return { requests, loading, refetch: fetchRequests, removeRequest }
}

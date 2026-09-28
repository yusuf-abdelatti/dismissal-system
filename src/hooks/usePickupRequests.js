import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'

// Periodically rebuild the realtime channel from scratch, not just
// re-fetch data — covers the case where the channel itself is silently
// stuck (not just the data being momentarily stale).
const HARD_RESYNC_INTERVAL_MS = 20 * 60 * 1000

// Supabase's own auto-refresh timer only runs while the tab reports itself
// as visible (its GoTrueClient stops it on a "hidden" visibilitychange and
// only restarts it on a matching "visible" one). Some embedded/kiosk TV
// browsers fire a stray "hidden" event without ever firing "visible" again,
// which permanently stops that internal ticker. Once that happens the login
// session's token silently expires, and every request after that — this
// fetch and the realtime channel's own auth — fails with nothing on screen
// to show it, which on a kiosk display looks exactly like it's frozen.
// Refreshing explicitly on our own timer sidesteps that failure mode
// entirely, independent of the library's internal visibility gating.
const SESSION_REFRESH_INTERVAL_MS = 10 * 60 * 1000

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

    if (error) {
      // No longer silent — surfaces in the console for future debugging,
      // and attempts an immediate session refresh in case an expired,
      // unrefreshed token is the cause (see SESSION_REFRESH_INTERVAL_MS).
      console.error('Failed to fetch pickup requests:', error)
      await supabase.auth.refreshSession().catch((refreshError) => {
        console.error('Session refresh also failed:', refreshError)
      })
      setLoading(false)
      return
    }

    setRequests(data)
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

    // See SESSION_REFRESH_INTERVAL_MS above — keeps the login session alive
    // on a long-running kiosk tab even if the browser's visibility events
    // never come back, so the poll/resync above never run into a
    // permanently expired token in the first place.
    const sessionRefreshInterval = setInterval(() => {
      supabase.auth.refreshSession().catch((err) => {
        console.error('Periodic session refresh failed:', err)
      })
    }, SESSION_REFRESH_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      clearInterval(pollInterval)
      clearInterval(hardResyncInterval)
      clearInterval(sessionRefreshInterval)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [])

  return { requests, loading, refetch: fetchRequests, removeRequest }
}

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'

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

  useEffect(() => {
    fetchRequests()
    subscribe()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchRequests()
        subscribe()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Safety net for kiosk-style screens (the display board) that never go
    // hidden, so the visibilitychange resync above never fires for them —
    // if the realtime socket silently dies after hours of uptime (idle
    // proxy timeout, brief network drop) with nothing to trigger a resync,
    // a long-running screen could keep showing a stale request indefinitely.
    // This guarantees it self-heals within one interval regardless of why
    // realtime stopped, without touching the realtime path itself.
    const pollInterval = setInterval(fetchRequests, 30000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(pollInterval)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [])

  return { requests, loading, refetch: fetchRequests, removeRequest }
}

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

  useEffect(() => {
    fetchRequests()

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channelName = `pickup_realtime_${Date.now()}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pickup_requests',
        },
        (payload) => {
          console.log('Realtime event:', payload.eventType, payload.new)
          fetchRequests()
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status)
      })

    channelRef.current = channel

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchRequests()
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current)
        }
        const newChannel = supabase
          .channel(`pickup_realtime_${Date.now()}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'pickup_requests' },
            (payload) => {
              console.log('Realtime event:', payload.eventType, payload.new)
              fetchRequests()
            }
          )
          .subscribe((status) => {
            console.log('Realtime subscription status:', status)
          })
        channelRef.current = newChannel
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [])

  return { requests, loading, refetch: fetchRequests, removeRequest }
}

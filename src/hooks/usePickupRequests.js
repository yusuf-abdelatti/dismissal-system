import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'

export function usePickupRequests(filter = {}) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef(null)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const fetchRequests = async () => {
      const { data } = await supabase
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
        .not('status', 'in', '(delivered,cleared)')

      let results = data || []

      // Class filter applied client-side for reliable nested-field filtering
      if (filter.classId) {
        results = results.filter((r) => r.children?.class_id === filter.classId)
      }

      setRequests(results)
      setLoading(false)
    }

    fetchRequests()

    // Unique channel name per mount to avoid conflicts with multiple subscribers
    const channelName = `pickup_requests_${Date.now()}_${Math.random()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pickup_requests',
        },
        () => {
          fetchRequests()
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [filter.classId, today])

  return { requests, loading }
}

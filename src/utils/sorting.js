import { getCountdownSeconds } from './countdown'

export function sortRequests(requests) {
  return [...requests].sort((a, b) => {
    const priority = (req) => {
      if (req.status === 'arrived') return 0
      if (req.status === 'ready') return 1
      const remaining = getCountdownSeconds(req.requested_at)
      if (remaining > 0) return 2 + (600 - remaining)
      return 10000 // "Arriving Soon" — bottom
    }
    return priority(a) - priority(b)
  })
}

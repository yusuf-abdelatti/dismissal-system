import { getCountdownSeconds, isOverdue } from './countdown'

export function sortRequests(requests, durationSeconds) {
  return [...requests].sort((a, b) => {
    const priority = (req) => {
      // A parent physically waiting past the window is the single most
      // urgent thing on the board — always float it above everything else,
      // including a request that just arrived a moment ago.
      if (req.status === 'arrived' && isOverdue(req.requested_at, durationSeconds)) return -1
      if (req.status === 'arrived') return 0
      if (req.status === 'ready') return 1
      const remaining = getCountdownSeconds(req.requested_at, durationSeconds)
      if (remaining > 0) return 2 + (durationSeconds - remaining)
      return 10000 // "Arriving Soon" — bottom
    }
    return priority(a) - priority(b)
  })
}

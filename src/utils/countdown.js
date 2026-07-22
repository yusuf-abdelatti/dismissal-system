const DEFAULT_DURATION = 600 // 10 minutes — used only if a nursery's own setting isn't available yet

// Unclamped — negative once the window has elapsed, used to detect overdue/escalated state.
export function getRemainingSeconds(requestedAt, durationSeconds = DEFAULT_DURATION) {
  const elapsed = (Date.now() - new Date(requestedAt).getTime()) / 1000
  return durationSeconds - elapsed
}

export function getCountdownSeconds(requestedAt, durationSeconds = DEFAULT_DURATION) {
  return Math.max(0, getRemainingSeconds(requestedAt, durationSeconds))
}

export function isOverdue(requestedAt, durationSeconds = DEFAULT_DURATION) {
  return getRemainingSeconds(requestedAt, durationSeconds) <= 0
}

export function formatCountdown(seconds) {
  if (seconds <= 0) return null // caller shows "Arriving Soon"
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

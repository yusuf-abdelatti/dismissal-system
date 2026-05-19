export function getCountdownSeconds(requestedAt) {
  const elapsed = (Date.now() - new Date(requestedAt).getTime()) / 1000
  return Math.max(0, 600 - elapsed) // 600 seconds = 10 minutes
}

export function formatCountdown(seconds) {
  if (seconds <= 0) return null // caller shows "Arriving Soon"
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

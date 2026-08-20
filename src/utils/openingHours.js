// Whether pickup requests are open right now, per the nursery's own local
// clock. `tenant.timezone` is an IANA name (e.g. "Africa/Cairo"), so DST
// transitions are handled automatically by the JS engine's built-in
// timezone database — never subtract/add a fixed offset here.
export function isRequestsOpen(tenant) {
  if (!tenant.requestsOpenTime) return true // no restriction configured

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tenant.timezone || 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())

  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value)
  const nowMinutes = hour * 60 + minute

  const [openHour, openMinute] = tenant.requestsOpenTime.split(':').map(Number)
  return nowMinutes >= openHour * 60 + openMinute
}

// "14:05:00" / "14:05" -> "2:05 PM"
export function formatOpenTimeLabel(requestsOpenTime) {
  if (!requestsOpenTime) return null
  const [h, m] = requestsOpenTime.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

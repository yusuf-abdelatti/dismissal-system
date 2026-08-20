import { getCountdownSeconds, formatCountdown, isOverdue, getOverdueSeconds } from '../utils/countdown'
import { useTenant } from '../hooks/useTenant'

export default function RequestRow({ request, tick }) {
  // tick prop triggers re-render every second so countdown stays live
  void tick

  const { tenant } = useTenant()
  const duration = tenant.pickupCountdownSeconds

  const child = request.children
  const classColor = child?.classes?.color || '#6B7280'
  const className = child?.classes?.name || '—'
  const childName = child?.full_name || '—'

  const remaining = getCountdownSeconds(request.requested_at, duration)
  const countdownText = formatCountdown(remaining)
  const overdue = isOverdue(request.requested_at, duration)
  const waitedText = formatCountdown(getOverdueSeconds(request.requested_at, duration))

  const isArrived = request.status === 'arrived'
  const isReady = request.status === 'ready'
  const isEscalated = isArrived && overdue
  const isReadyEscalated = isReady && overdue

  return (
    <div
      className={`flex items-center px-6 rounded-lg mb-1.5 transition-all ${
        isArrived ? 'arrived-pulse' : ''
      } ${isEscalated ? 'escalated-pulse' : ''}`}
      style={{
        height: isEscalated ? '84px' : '60px',
        backgroundColor: isEscalated ? 'rgba(220,38,38,0.2)' : `${classColor}12`,
        borderLeft: `${isEscalated ? 10 : 5}px solid ${isEscalated ? '#DC2626' : classColor}`,
        boxShadow: isEscalated
          ? '0 0 30px #DC2626aa'
          : isArrived
            ? `0 0 18px ${classColor}66`
            : 'none',
      }}
    >
      {/* Class color dot */}
      <div
        className={`rounded-full flex-shrink-0 mr-4 ${isEscalated ? 'w-5 h-5' : 'w-4 h-4'}`}
        style={{ backgroundColor: classColor }}
      />

      {/* Child name */}
      <div className={`flex-1 font-black text-white truncate mr-6 ${isEscalated ? 'text-4xl' : 'text-3xl'}`}>
        {childName}
      </div>

      {/* Class label */}
      <div
        className="text-lg font-semibold mr-8 w-28 text-center shrink-0"
        style={{ color: classColor }}
      >
        {className}
      </div>

      {/* Status / countdown */}
      <div className="w-64 text-right shrink-0 font-mono whitespace-nowrap overflow-hidden">
        {isArrived ? (
          isEscalated ? (
            <span className="font-black text-2xl tracking-wide text-red-300">
              ⚡ WAITING
              {waitedText && (
                <span className="ml-2 text-lg font-bold text-red-200 tabular-nums">{waitedText}</span>
              )}
            </span>
          ) : (
            <span className="font-black text-xl tracking-wide text-white">
              ⚡ ARRIVED
              {countdownText && (
                <span className="ml-2 text-base font-bold text-gray-300 tabular-nums">{countdownText}</span>
              )}
            </span>
          )
        ) : isReady ? (
          isReadyEscalated ? (
            <span className="font-black text-xl tracking-wide text-amber-400">
              🌟 READY — WAITING
            </span>
          ) : (
            <span className="font-black text-2xl tracking-wide text-green-400">
              Ready
              {countdownText && (
                <span className="ml-2 text-base font-bold text-gray-300 tabular-nums">{countdownText}</span>
              )}
            </span>
          )
        ) : countdownText ? (
          <span className="text-gray-200 text-2xl font-bold tabular-nums">
            {countdownText}
          </span>
        ) : (
          <span className="text-amber-500 font-bold text-lg">Arriving Soon</span>
        )}
      </div>
    </div>
  )
}

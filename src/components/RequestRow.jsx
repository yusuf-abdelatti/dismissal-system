import { getCountdownSeconds, formatCountdown } from '../utils/countdown'

export default function RequestRow({ request, tick }) {
  // tick prop triggers re-render every second so countdown stays live
  void tick

  const child = request.children
  const classColor = child?.classes?.color || '#6B7280'
  const className = child?.classes?.name || '—'
  const childName = child?.full_name || '—'

  const remaining = getCountdownSeconds(request.requested_at)
  const countdownText = formatCountdown(remaining)

  const isArrived = request.status === 'arrived'
  const isReady = request.status === 'ready'

  return (
    <div
      className={`flex items-center px-6 rounded-lg mb-2 transition-all ${
        isArrived ? 'arrived-pulse' : ''
      }`}
      style={{
        height: '64px',
        backgroundColor: `${classColor}12`,
        borderLeft: `4px solid ${classColor}`,
        boxShadow: isArrived ? `0 0 16px ${classColor}66` : 'none',
      }}
    >
      {/* Class color dot */}
      <div
        className="w-3 h-3 rounded-full flex-shrink-0 mr-4"
        style={{ backgroundColor: classColor }}
      />

      {/* Child name */}
      <div className="flex-1 text-xl font-semibold text-white truncate mr-4">
        {childName}
      </div>

      {/* Class label */}
      <div
        className="text-sm font-medium mr-8 w-20 text-center shrink-0"
        style={{ color: classColor }}
      >
        {className}
      </div>

      {/* Status / countdown */}
      <div className="w-36 text-right shrink-0 font-mono">
        {isArrived ? (
          <span className="text-white font-bold text-lg tracking-wide">
            ⚡ ARRIVED
          </span>
        ) : isReady ? (
          <span className="text-green-400 font-bold text-lg">Ready</span>
        ) : countdownText ? (
          <span className="text-gray-200 text-lg tabular-nums">
            {countdownText}
          </span>
        ) : (
          <span className="text-amber-500 text-sm">Arriving Soon</span>
        )}
      </div>
    </div>
  )
}

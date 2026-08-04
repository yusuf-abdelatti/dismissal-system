import { useState, useEffect } from 'react'
import { useTenant } from '../hooks/useTenant'

function detectDevice() {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return null
}

const DEVICES = {
  ios: {
    label: 'iPhone',
    sublabel: 'Safari',
    video: '/videos/install-ios.mp4',
    browserNote: (
      <>Make sure you're using <strong>Safari</strong> — other browsers (like Chrome) can't add this app to your
        Home Screen on iPhone, and you won't get pickup notifications.</>
    ),
    steps: [
      <>Tap the <strong>Share</strong> button at the bottom of Safari</>,
      <>Scroll down and tap <strong>"Add to Home Screen"</strong></>,
      <>Tap <strong>"Add"</strong> in the top-right corner</>,
    ],
  },
  android: {
    label: 'Android',
    sublabel: 'Chrome',
    video: '/videos/install-android.mp4',
    browserNote: (
      <>Make sure you're using <strong>Chrome</strong> — other browsers may not support installing the app or
        sending you pickup notifications.</>
    ),
    steps: [
      <>Tap the <strong>⋮ menu</strong> in the top-right of Chrome</>,
      <>Tap <strong>"Install app"</strong> (or <strong>"Add to Home screen"</strong>)</>,
      <>Tap <strong>"Install"</strong> to confirm</>,
    ],
  },
}

function PhoneIcon({ color }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="2" width="12" height="20" rx="2.5" stroke={color} strokeWidth="1.8" />
      <line x1="10" y1="18.3" x2="14" y2="18.3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export default function InstallGuide() {
  const { tenant } = useTenant()
  const [device, setDevice] = useState(null)
  const [autoDetected, setAutoDetected] = useState(false)

  useEffect(() => {
    const detected = detectDevice()
    if (detected) {
      setDevice(detected)
      setAutoDetected(true)
    }
  }, [])

  const info = device ? DEVICES[device] : null

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-10"
      style={{ backgroundColor: tenant.backgroundColor }}
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <img src={tenant.logoUrl} alt={tenant.name} className="w-20 h-auto mb-4" />
          <h1 className="text-xl font-bold mb-1" style={{ color: tenant.primaryColor }}>
            Install the App
          </h1>
          <p className="text-sm" style={{ color: '#5A5A5A' }}>
            Add {tenant.name} to your home screen for quick, one-tap access at pickup time.
          </p>
        </div>

        {/* Device picker */}
        <div className="flex gap-3 mb-6">
          {Object.entries(DEVICES).map(([key, d]) => {
            const active = device === key
            return (
              <button
                key={key}
                onClick={() => {
                  setDevice(key)
                  setAutoDetected(false)
                }}
                className="flex-1 flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 transition-colors"
                style={{
                  borderColor: active ? tenant.primaryColor : '#E0DBD3',
                  backgroundColor: active ? '#ffffff' : 'transparent',
                }}
              >
                <PhoneIcon color={active ? tenant.primaryColor : '#8A8478'} />
                <span
                  className="text-sm font-semibold"
                  style={{ color: active ? tenant.primaryColor : '#5A5A5A' }}
                >
                  {d.label}
                </span>
              </button>
            )
          })}
        </div>

        {!info && (
          <p className="text-center text-sm" style={{ color: '#8A8478' }}>
            Choose your phone above to see how
          </p>
        )}

        {info && (
          <div>
            <div
              className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 mb-5 border"
              style={{ backgroundColor: '#FBF3E4', borderColor: tenant.secondaryColor }}
            >
              <span className="text-base leading-none flex-shrink-0" aria-hidden="true">⚠️</span>
              <p className="text-xs leading-snug" style={{ color: '#5A4A2A' }}>
                {info.browserNote}
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden shadow-lg mb-5 bg-black">
              <video
                key={device}
                src={info.video}
                controls
                playsInline
                preload="none"
                className="w-full block"
              />
            </div>

            <div className="bg-white rounded-2xl p-4 mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#8A8478' }}>
                {info.label} · {info.sublabel}
              </p>
              {info.steps.map((step, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3"
                  style={{ marginBottom: i < info.steps.length - 1 ? '12px' : 0 }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: tenant.primaryColor, color: 'white' }}
                  >
                    {i + 1}
                  </div>
                  <p className="text-sm leading-snug pt-0.5" style={{ color: '#2C2C2C' }}>
                    {step}
                  </p>
                </div>
              ))}
            </div>

            {autoDetected && (
              <p className="text-center text-xs" style={{ color: '#8A8478' }}>
                Detected automatically — not your phone? Pick the other option above.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

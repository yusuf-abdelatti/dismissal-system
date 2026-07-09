import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

const DISMISSED_KEY = 'finnly-pwa-dismissed'

function getDevice() {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    !!window.navigator.standalone
  )
}

const IOS_STEPS = [
  {
    n: 1,
    icon: '↑',
    text: (
      <>
        Tap the <strong>Share</strong> button{' '}
        <span style={{ fontSize: '15px' }}>⬆</span> at the bottom of Safari
      </>
    ),
  },
  {
    n: 2,
    icon: '+',
    text: (
      <>
        Scroll and tap{' '}
        <strong>"Add to Home Screen"</strong>
      </>
    ),
  },
  {
    n: 3,
    icon: '✓',
    text: (
      <>
        Tap <strong>"Add"</strong> in the top-right corner
      </>
    ),
  },
]

export default function PWAInstallBanner() {
  const { pathname } = useLocation()
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false) // for slide-up animation
  const [device, setDevice] = useState('desktop')
  const [prompt, setPrompt] = useState(null)
  const [showSteps, setShowSteps] = useState(false)
  const promptRef = useRef(null)

  useEffect(() => {
    if (pathname.startsWith('/display')) return
    if (isStandalone()) return
    if (localStorage.getItem(DISMISSED_KEY)) return

    const d = getDevice()
    setDevice(d)

    if (d === 'ios') {
      const t = setTimeout(() => {
        setVisible(true)
        requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)))
      }, 1200)
      return () => clearTimeout(t)
    }

    const handler = (e) => {
      e.preventDefault()
      promptRef.current = e
      setPrompt(e)
      setVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)))
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [pathname])

  const dismiss = () => {
    setMounted(false)
    setTimeout(() => {
      setVisible(false)
      setShowSteps(false)
    }, 280)
    localStorage.setItem(DISMISSED_KEY, '1')
  }

  const handleInstall = async () => {
    if (device === 'ios') {
      setShowSteps(true)
      return
    }
    const p = promptRef.current || prompt
    if (!p) return
    p.prompt()
    const { outcome } = await p.userChoice
    if (outcome === 'accepted') dismiss()
    promptRef.current = null
    setPrompt(null)
  }

  if (!visible) return null

  const isDesktopOrAndroid = device !== 'ios'

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 px-4 pointer-events-none"
      style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
    >
      <div
        className="w-full max-w-sm mx-auto rounded-2xl shadow-2xl pointer-events-auto overflow-hidden"
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid rgba(107,155,175,0.25)',
          transform: mounted ? 'translateY(0)' : 'translateY(16px)',
          opacity: mounted ? 1 : 0,
          transition: 'transform 0.28s cubic-bezier(0.34,1.2,0.64,1), opacity 0.25s ease',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ backgroundColor: '#6B9BAF' }}
          >
            <img
              src="/finnly-logo.png"
              alt="Finnly"
              className="w-8 h-8 object-contain"
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.parentElement.querySelector('span').style.display = 'block'
              }}
            />
            <span className="text-white font-bold text-lg hidden">F</span>
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight" style={{ color: '#2C2C2C' }}>
              Install Finnly
            </p>
            <p className="text-xs mt-0.5 leading-tight" style={{ color: '#5A5A5A' }}>
              {showSteps
                ? 'Follow these steps in Safari'
                : 'Add to your home screen for quick access'}
            </p>
          </div>

          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-lg leading-none transition-opacity hover:opacity-70"
            style={{ color: '#5A5A5A', backgroundColor: '#EAE5DF' }}
          >
            ×
          </button>
        </div>

        {/* iOS step-by-step instructions */}
        {showSteps && (
          <div className="px-4 pb-1">
            <div
              className="rounded-xl p-3 mb-3"
              style={{ backgroundColor: '#EAE5DF' }}
            >
              {IOS_STEPS.map((step, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3"
                  style={{ marginBottom: i < IOS_STEPS.length - 1 ? '10px' : 0 }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: '#6B9BAF', color: 'white', minWidth: '24px' }}
                  >
                    {step.n}
                  </div>
                  <p className="text-sm leading-snug" style={{ color: '#2C2C2C' }}>
                    {step.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Android/Desktop: single install button */}
        {!showSteps && isDesktopOrAndroid && (
          <div className="px-4 pb-4">
            <button
              onClick={handleInstall}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity active:opacity-80"
              style={{ backgroundColor: '#6B9BAF' }}
            >
              Install
            </button>
          </div>
        )}

        {/* iOS: show "How to Install" → then "Got it" */}
        {!showSteps && !isDesktopOrAndroid && (
          <div className="px-4 pb-4">
            <button
              onClick={handleInstall}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity active:opacity-80"
              style={{ backgroundColor: '#6B9BAF' }}
            >
              How to Install
            </button>
          </div>
        )}

        {showSteps && (
          <div className="px-4 pb-4">
            <button
              onClick={dismiss}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity active:opacity-80"
              style={{ backgroundColor: '#EAE5DF', color: '#2C2C2C' }}
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

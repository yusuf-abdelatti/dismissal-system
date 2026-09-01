import { useState, useRef, useEffect } from 'react'

// A small "i" button that reveals a plain-language explanation on tap.
// Click-toggle rather than hover — hover doesn't work on the tablets/phones
// this dashboard might also be opened on.
export default function InfoTip({ text }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [open])

  return (
    <span className="relative inline-block ml-1 align-middle" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="What does this mean?"
        className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold leading-none inline-flex items-center justify-center hover:bg-gray-300 focus:outline-none"
      >
        i
      </button>
      {open && (
        <div className="absolute z-20 left-0 top-6 w-56 max-w-[80vw] bg-gray-900 text-white text-xs rounded-lg p-2.5 shadow-lg leading-snug font-normal normal-case">
          {text}
        </div>
      )}
    </span>
  )
}

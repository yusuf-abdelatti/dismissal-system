import { useState } from 'react'
import { useTenant } from '../hooks/useTenant'

// Shown once, on first launch of the native app, until a nursery code is
// stored. A typed code (not a QR) because the store apps have no admin screen
// to scan from; the code is the same slug used for ?slug= on the web.
export default function NurseryCodeScreen() {
  const { submitNurseryCode } = useTenant()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const ok = await submitNurseryCode(code)
      if (!ok) setError("We couldn't find that nursery code. Check it with your nursery and try again.")
    } catch {
      setError('Something went wrong connecting. Check your internet connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--tenant-bg, #EAE5DF)' }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-2xl shadow-md p-6 space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">Welcome to Finnly</h1>
          <p className="text-sm text-gray-600 mt-1">Enter the nursery code you were given to get started.</p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Nursery code</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. sunnyside"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2"
            required
          />
        </label>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !code.trim()}
          className="w-full rounded-lg py-2.5 font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--tenant-primary, #6B9BAF)' }}
        >
          {submitting ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}

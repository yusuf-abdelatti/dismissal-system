import { useState } from 'react'
import { FEEDBACK_SECTIONS, NURSERY_OPTIONS } from '../../utils/feedbackQuestions'

const TEAL = '#2E5A63'
const ACCENT = '#5F94AC'

function Field({ field, value, onChange }) {
  const [otherText, setOtherText] = useState('')

  if (field.type === 'text') {
    return (
      <textarea
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
        rows={2}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  if (field.type === 'scale5') {
    return (
      <div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                value === n ? 'text-white border-transparent' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
              style={value === n ? { backgroundColor: ACCENT } : {}}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{field.low}</span>
          <span>{field.high}</span>
        </div>
      </div>
    )
  }

  if (field.type === 'radio') {
    return (
      <div className="flex flex-col gap-2">
        {field.options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="radio"
              name={field.key}
              checked={value === opt}
              onChange={() => onChange(opt)}
              className="accent-blue-500"
            />
            {opt}
          </label>
        ))}
        {field.other && value === 'Other' && (
          <input
            type="text"
            placeholder="Please specify"
            className="mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={otherText}
            onChange={(e) => {
              setOtherText(e.target.value)
              onChange('Other: ' + e.target.value)
            }}
          />
        )}
      </div>
    )
  }

  if (field.type === 'checkbox') {
    const selected = Array.isArray(value) ? value : []
    const hasOther = selected.some((v) => v === 'Other' || v.startsWith('Other:'))
    const toggle = (opt) => {
      onChange(hasOther && opt === 'Other' ? selected.filter((v) => v !== 'Other' && !v.startsWith('Other:')) : [...selected, opt])
    }
    return (
      <div className="flex flex-col gap-2">
        {field.options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={opt === 'Other' ? hasOther : selected.includes(opt)}
              onChange={() => toggle(opt)}
              className="accent-blue-500"
            />
            {opt}
          </label>
        ))}
        {field.other && hasOther && (
          <input
            type="text"
            placeholder="Please specify"
            className="mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={otherText}
            onChange={(e) => {
              setOtherText(e.target.value)
              const withoutOther = selected.filter((v) => v !== 'Other' && !v.startsWith('Other:'))
              onChange([...withoutOther, `Other: ${e.target.value}`])
            }}
          />
        )}
      </div>
    )
  }

  return null
}

export default function FeedbackForm() {
  const [answers, setAnswers] = useState({})
  const [nurseryName, setNurseryName] = useState('')
  const [pilotPeriod, setPilotPeriod] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  const setAnswer = (key, value) => setAnswers((a) => ({ ...a, [key]: value }))

  const requiredMissing = () => {
    if (!nurseryName) return true
    for (const section of FEEDBACK_SECTIONS) {
      for (const field of section.fields) {
        if (field.optional) continue
        const v = answers[field.key]
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return true
      }
    }
    return false
  }

  const submit = async () => {
    setError(null)
    if (requiredMissing()) {
      setError('Please fill in all required questions before submitting.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/submit-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nurseryName, pilotPeriod, answers }),
      })
      if (!res.ok) throw new Error('Submission failed')
      setSubmitted(true)
    } catch {
      setError('Something went wrong submitting the form. Please try again.')
    }
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#EEF1F4] flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl shadow-sm p-10 max-w-md text-center">
          <div className="text-4xl mb-4">💛</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Thank you!</h1>
          <p className="text-gray-500 text-sm">
            Your feedback has been submitted. We really appreciate you taking the time — it directly shapes where
            the Smart Dismissal System goes next.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#EEF1F4] py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M2 12h4l2-7 4 14 2-7h8" stroke={ACCENT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-bold text-lg" style={{ color: TEAL }}>Technothera</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Smart Dismissal System — Pilot Feedback</h1>
          <p className="text-gray-500 text-sm mt-2">
            A few minutes of your time helps us improve the system for your nursery and every nursery after it.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">About This Submission</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nursery</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={nurseryName}
              onChange={(e) => setNurseryName(e.target.value)}
            >
              <option value="">Select a nursery…</option>
              {NURSERY_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pilot Period <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. July – August 2026"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={pilotPeriod}
              onChange={(e) => setPilotPeriod(e.target.value)}
            />
          </div>
        </div>

        {FEEDBACK_SECTIONS.map((section) => (
          <div key={section.title} className="bg-white rounded-2xl shadow-sm p-6 mb-4">
            <h2 className="font-semibold text-gray-900 mb-4">{section.title}</h2>
            <div className="flex flex-col gap-5">
              {section.fields.map((field) => {
                const showExplain =
                  field.explainOn &&
                  (Array.isArray(field.explainOn)
                    ? field.explainOn.includes(answers[field.key])
                    : answers[field.key] === field.explainOn)

                return (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {field.label}
                      {!field.optional && <span className="text-red-400"> *</span>}
                    </label>
                    <Field field={field} value={answers[field.key]} onChange={(v) => setAnswer(field.key, v)} />
                    {showExplain && (
                      <textarea
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                        rows={2}
                        placeholder="Please explain"
                        value={answers[field.explainKey] || ''}
                        onChange={(e) => setAnswer(field.explainKey, e.target.value)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm text-center">
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full text-white font-semibold text-lg py-4 rounded-2xl shadow-lg transition-opacity disabled:opacity-50"
          style={{ backgroundColor: TEAL }}
        >
          {submitting ? 'Submitting…' : 'Submit Feedback'}
        </button>
        <p className="text-center text-gray-400 text-xs mt-4">Technothera · Smart Dismissal System</p>
      </div>
    </div>
  )
}

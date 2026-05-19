import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function AdminSettings() {
  const [branchName, setBranchName] = useState('')
  const [branchNameInput, setBranchNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameSuccess, setNameSuccess] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'branch_name')
      .single()
      .then(({ data }) => {
        const name = data?.value || ''
        setBranchName(name)
        setBranchNameInput(name)
      })
  }, [])

  const saveBranchName = async () => {
    if (!branchNameInput.trim()) return
    setSavingName(true)
    setError(null)

    const { error: err } = await supabase
      .from('settings')
      .update({ value: branchNameInput.trim(), updated_at: new Date().toISOString() })
      .eq('key', 'branch_name')

    if (err) {
      setError('Something went wrong. Please try again.')
      setSavingName(false)
      return
    }

    setBranchName(branchNameInput.trim())
    setNameSuccess(true)
    setSavingName(false)
    setTimeout(() => setNameSuccess(false), 3000)
  }

  const endOfDayReset = async () => {
    setResetting(true)
    setError(null)
    const today = new Date().toISOString().split('T')[0]

    const { error: err } = await supabase
      .from('pickup_requests')
      .update({ status: 'cleared' })
      .eq('date', today)
      .not('status', 'in', '(delivered,cleared)')

    setShowResetConfirm(false)
    setResetting(false)

    if (err) {
      setError('Something went wrong. Please try again.')
      return
    }

    setResetSuccess(true)
    setTimeout(() => setResetSuccess(false), 5000)
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Branch name */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-4">
        <h2 className="font-semibold text-gray-900 mb-1">Branch Name</h2>
        <p className="text-gray-500 text-sm mb-4">
          Displayed in the header of the live dismissal board.
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={branchNameInput}
            onChange={(e) => setBranchNameInput(e.target.value)}
          />
          <button
            onClick={saveBranchName}
            disabled={savingName || branchNameInput.trim() === branchName}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>
        {nameSuccess && (
          <p className="text-green-600 text-xs mt-2">Branch name updated.</p>
        )}
      </div>

      {/* End-of-day reset */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-1">End-of-Day Reset</h2>
        <p className="text-gray-500 text-sm mb-4">
          Clears all active pickup requests for today. Use this at the end of
          each school day after all children have been collected.
        </p>

        {resetSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-4 text-sm">
            All active requests for today have been cleared.
          </div>
        )}

        <button
          onClick={() => setShowResetConfirm(true)}
          className="bg-red-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
        >
          Reset Today's Requests
        </button>
      </div>

      {/* Reset confirmation modal */}
      {showResetConfirm && (
        <Modal
          title="Confirm End-of-Day Reset"
          onClose={() => setShowResetConfirm(false)}
        >
          <p className="text-sm text-gray-700 mb-5">
            This will clear all active pickup requests for today. Delivered
            records are kept. This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={endOfDayReset}
              disabled={resetting}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {resetting ? 'Resetting…' : 'Yes, Reset'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

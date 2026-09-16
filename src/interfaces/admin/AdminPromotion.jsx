import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
import InfoTip from '../../components/InfoTip'

const PROMOTE = 'promote'
const KEEP = 'keep'
const ARCHIVE = 'archive'

function newPairId() {
  return crypto.randomUUID()
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ActionToggle({ value, onChange, sourceName, targetName }) {
  const options = [
    { key: PROMOTE, label: `Promote to ${targetName}` },
    { key: KEEP, label: `Keep in ${sourceName}` },
    { key: ARCHIVE, label: 'Archive' },
  ]

  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            value === opt.key
              ? opt.key === ARCHIVE
                ? 'bg-red-600 border-red-600 text-white'
                : 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function AdminPromotion() {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)

  // The plan: a list of {id, sourceClassId, targetClassId} pairs, built up
  // front — nothing is read from the database for review until every pair
  // in the whole cascade is decided.
  const [pairs, setPairs] = useState([{ id: newPairId(), sourceClassId: '', targetClassId: '' }])

  // childrenByPairId[pairId] = [{id, full_name}, ...] — captured ONCE, all
  // pairs at the same moment, before any writes happen. This is what
  // actually solves the Lotus→Lily→Rose problem: a child who's about to be
  // moved INTO Lily by one pair still shows up under Lotus's own snapshot,
  // not Lily's, because the snapshot was taken before that move exists.
  const [childrenByPairId, setChildrenByPairId] = useState({})
  const [actions, setActions] = useState({}) // childId -> action

  const [step, setStep] = useState('plan')
  const [loadingChildren, setLoadingChildren] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  useEffect(() => {
    loadClasses()
  }, [])

  const loadClasses = async () => {
    setLoading(true)
    const { data } = await supabase.from('classes').select('id, name, color').order('name')
    setClasses(data || [])
    setLoading(false)
  }

  const classById = (id) => classes.find((c) => c.id === id)

  const updatePair = (id, patch) => {
    setPairs((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const addPair = () => {
    // Defaults the new row's source to the previous row's target — the
    // common case is exactly this chain (Lotus→Lily, then Lily→___).
    const lastTarget = pairs[pairs.length - 1]?.targetClassId || ''
    setPairs((prev) => [...prev, { id: newPairId(), sourceClassId: lastTarget, targetClassId: '' }])
  }

  const removePair = (id) => {
    setPairs((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev))
  }

  const planErrors = useMemo(() => {
    const errors = []
    const sourcesSeen = new Set()

    for (const p of pairs) {
      if (!p.sourceClassId || !p.targetClassId) {
        errors.push('Every row needs both a "From" and a "Moves into" class.')
        break
      }
    }
    for (const p of pairs) {
      if (p.sourceClassId && p.sourceClassId === p.targetClassId) {
        errors.push('A class can\'t move into itself.')
        break
      }
    }
    for (const p of pairs) {
      if (!p.sourceClassId) continue
      if (sourcesSeen.has(p.sourceClassId)) {
        errors.push('The same "From" class is used more than once — combine those into a single row.')
        break
      }
      sourcesSeen.add(p.sourceClassId)
    }

    return errors
  }, [pairs])

  const startReview = async () => {
    setLoadingChildren(true)
    setError(null)

    const sourceIds = pairs.map((p) => p.sourceClassId)
    const { data, error: err } = await supabase
      .from('children')
      .select('id, full_name, class_id')
      .in('class_id', sourceIds)
      .eq('is_active', true)
      .order('full_name')

    if (err) {
      setError('Could not load children for those classes. Please try again.')
      setLoadingChildren(false)
      return
    }

    const byPair = {}
    const initialActions = {}
    for (const pair of pairs) {
      const classChildren = (data || []).filter((c) => c.class_id === pair.sourceClassId)
      byPair[pair.id] = classChildren
      classChildren.forEach((c) => {
        initialActions[c.id] = PROMOTE
      })
    }

    setChildrenByPairId(byPair)
    setActions(initialActions)
    setLoadingChildren(false)
    setStep('review')
  }

  const setChildAction = (childId, action) => {
    setActions((prev) => ({ ...prev, [childId]: action }))
  }

  const pairCounts = (pairId) => {
    const c = { [PROMOTE]: 0, [KEEP]: 0, [ARCHIVE]: 0 }
    ;(childrenByPairId[pairId] || []).forEach((child) => {
      const a = actions[child.id]
      c[a] = (c[a] || 0) + 1
    })
    return c
  }

  const totalCounts = useMemo(() => {
    const c = { [PROMOTE]: 0, [KEEP]: 0, [ARCHIVE]: 0 }
    Object.values(actions).forEach((a) => {
      c[a] = (c[a] || 0) + 1
    })
    return c
  }, [actions])

  const backToPlan = () => {
    setStep('plan')
    setChildrenByPairId({})
    setActions({})
    setError(null)
  }

  const apply = async () => {
    setApplying(true)
    setError(null)

    // One promote-update per pair (each pair has its own target class), plus
    // a single combined archive-update across every pair — archiving
    // doesn't depend on which pair a child came from.
    for (const pair of pairs) {
      const promoteIds = (childrenByPairId[pair.id] || [])
        .filter((c) => actions[c.id] === PROMOTE)
        .map((c) => c.id)

      if (promoteIds.length > 0) {
        const { error: err } = await supabase.from('children').update({ class_id: pair.targetClassId }).in('id', promoteIds)
        if (err) {
          setError(
            `Something went wrong applying ${classById(pair.sourceClassId)?.name} → ${classById(pair.targetClassId)?.name}. Some earlier rows in this plan may already be applied — check the Children list before retrying.`
          )
          setApplying(false)
          return
        }
      }
    }

    const archiveIds = Object.entries(actions).filter(([, a]) => a === ARCHIVE).map(([id]) => id)
    if (archiveIds.length > 0) {
      const { error: err } = await supabase.from('children').update({ is_active: false }).in('id', archiveIds)
      if (err) {
        setError('Promotions were applied, but archiving failed partway through. Check the Children list for anyone still marked active.')
        setApplying(false)
        return
      }
    }

    setApplying(false)
    setShowConfirm(false)
    setDone(
      pairs.map((pair) => {
        const c = pairCounts(pair.id)
        return {
          from: classById(pair.sourceClassId)?.name,
          to: classById(pair.targetClassId)?.name,
          promoted: c[PROMOTE],
          kept: c[KEEP],
          archived: c[ARCHIVE],
        }
      })
    )
    setPairs([{ id: newPairId(), sourceClassId: '', targetClassId: '' }])
    backToPlan()
  }

  if (loading) {
    return <div className="text-gray-400 py-12 text-center">Loading…</div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Class Promotion</h1>
        <p className="text-sm text-gray-500 mt-1">
          Build the whole level-change cascade at once, review every child, then apply it all together.
        </p>
      </div>

      {done && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl mb-6 text-sm">
          <div className="flex items-start justify-between gap-4 mb-1">
            <strong>Done</strong>
            <button onClick={() => setDone(null)} className="text-green-700 hover:underline text-xs whitespace-nowrap">
              Dismiss
            </button>
          </div>
          <ul className="space-y-0.5">
            {done.map((d, i) => (
              <li key={i}>
                {d.from} → {d.to}: {d.promoted} moved
                {d.kept > 0 ? `, ${d.kept} kept` : ''}
                {d.archived > 0 ? `, ${d.archived} archived` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm">{error}</div>
      )}

      {step === 'plan' && (
        <div className="bg-white rounded-xl shadow-sm p-6 max-w-xl">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">1. Build the cascade</h2>
          <p className="text-xs text-gray-400 mb-4">
            Add one row per level change. A class can be a "Moves into" target in one row and a "From" class in the
            next — e.g. Lotus → Lily, then Lily → Rose — and every child is captured before any of it is applied, so
            kids arriving into Lily from Lotus are never also swept into the Lily → Rose move.
          </p>

          <div className="space-y-3 mb-4">
            {pairs.map((pair, i) => (
              <div key={pair.id} className="flex items-center gap-2 flex-wrap">
                <select
                  className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={pair.sourceClassId}
                  onChange={(e) => updatePair(pair.id, { sourceClassId: e.target.value })}
                >
                  <option value="">From class</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="text-gray-400 text-sm">→</span>
                <select
                  className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={pair.targetClassId}
                  onChange={(e) => updatePair(pair.id, { targetClassId: e.target.value })}
                >
                  <option value="">Moves into</option>
                  {classes
                    .filter((c) => c.id !== pair.sourceClassId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                {pairs.length > 1 && (
                  <button
                    onClick={() => removePair(pair.id)}
                    className="text-gray-400 hover:text-red-500 text-sm px-2"
                    aria-label="Remove row"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <button onClick={addPair} className="text-blue-600 hover:underline text-sm mb-6">
            + Add another class
          </button>

          {planErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg mb-4">
              {planErrors[0]}
            </div>
          )}

          <button
            onClick={startReview}
            disabled={planErrors.length > 0 || loadingChildren}
            className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loadingChildren ? 'Loading…' : 'Continue to Review'}
          </button>
        </div>
      )}

      {step === 'review' && (
        <div>
          <button onClick={backToPlan} className="text-sm text-blue-600 hover:underline mb-4">
            ← Change the plan
          </button>

          {pairs.map((pair) => {
            const pairChildren = childrenByPairId[pair.id] || []
            const c = pairCounts(pair.id)
            const sourceClass = classById(pair.sourceClassId)
            const targetClass = classById(pair.targetClassId)

            return (
              <div key={pair.id} className="mb-6">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h2 className="text-sm font-semibold text-gray-700">
                    {sourceClass?.name} → {targetClass?.name}{' '}
                    <span className="text-gray-400 font-normal">({pairChildren.length} active children)</span>
                  </h2>
                  <div className="text-xs text-gray-500">
                    {c[PROMOTE]} promote · {c[KEEP]} keep · {c[ARCHIVE]} archive
                  </div>
                </div>

                {pairChildren.length === 0 ? (
                  <div className="bg-white rounded-xl shadow-sm px-4 py-6 text-center text-gray-400 text-sm">
                    No active children in {sourceClass?.name}.
                  </div>
                ) : (
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    {pairChildren.map((child, i) => (
                      <div
                        key={child.id}
                        className={`flex items-center justify-between gap-4 px-4 py-3 flex-wrap ${
                          i !== pairChildren.length - 1 ? 'border-b' : ''
                        }`}
                      >
                        <span className="font-medium text-gray-900 text-sm">{child.full_name}</span>
                        <ActionToggle
                          value={actions[child.id]}
                          onChange={(a) => setChildAction(child.id, a)}
                          sourceName={sourceClass?.name}
                          targetName={targetClass?.name}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setShowConfirm(true)}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Review & Apply
            </button>
            <span className="text-xs text-gray-500">
              {totalCounts[PROMOTE]} promote · {totalCounts[KEEP]} keep · {totalCounts[ARCHIVE]} archive — across all
              rows
            </span>
            <InfoTip text="Archiving a child deactivates them, the same as using Deactivate in the Children list — it doesn't delete their record, and can be manually undone from Children if needed." />
          </div>
        </div>
      )}

      {showConfirm && (
        <Modal title="Confirm class promotion" onClose={() => setShowConfirm(false)}>
          <p className="text-sm text-gray-700 mb-4">This will apply immediately and cannot be undone in bulk:</p>
          <ul className="text-sm text-gray-700 mb-5 space-y-3">
            {pairs.map((pair) => {
              const c = pairCounts(pair.id)
              return (
                <li key={pair.id}>
                  <div className="font-medium text-gray-900 mb-1">
                    {classById(pair.sourceClassId)?.name} → {classById(pair.targetClassId)?.name}
                  </div>
                  <ul className="list-disc list-inside text-gray-600 space-y-0.5">
                    <li>
                      <strong>{c[PROMOTE]}</strong> {c[PROMOTE] === 1 ? 'child moves' : 'children move'}
                    </li>
                    <li>
                      <strong>{c[KEEP]}</strong> {c[KEEP] === 1 ? 'child stays' : 'children stay'}
                    </li>
                    <li>
                      <strong>{c[ARCHIVE]}</strong> {c[ARCHIVE] === 1 ? 'child is' : 'children are'} archived
                    </li>
                  </ul>
                </li>
              )
            })}
          </ul>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              disabled={applying}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {applying ? 'Applying…' : 'Confirm & Apply'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

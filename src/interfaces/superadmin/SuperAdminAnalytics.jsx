import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { getPresetRange, computeOverview } from '../../utils/analytics'

const OVERVIEW_RANGE = getPresetRange('7d')

export default function SuperAdminAnalytics() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)

    const [{ data: nurseries }, { data: requests }, { data: children }] = await Promise.all([
      supabase.from('nurseries').select('id, name, slug, pickup_countdown_seconds').order('name'),
      supabase
        .from('pickup_requests')
        .select('nursery_id, child_id, date')
        .gte('date', OVERVIEW_RANGE.from)
        .lte('date', OVERVIEW_RANGE.to),
      supabase.from('children').select('id, nursery_id, is_active'),
    ])

    const requestsByNursery = new Map()
    for (const r of requests || []) {
      if (!requestsByNursery.has(r.nursery_id)) requestsByNursery.set(r.nursery_id, [])
      requestsByNursery.get(r.nursery_id).push(r)
    }

    const childrenByNursery = new Map()
    for (const c of children || []) {
      if (!childrenByNursery.has(c.nursery_id)) childrenByNursery.set(c.nursery_id, [])
      childrenByNursery.get(c.nursery_id).push(c)
    }

    const computed = (nurseries || []).map((n) => {
      const overview = computeOverview({
        requests: requestsByNursery.get(n.id) || [],
        children: childrenByNursery.get(n.id) || [],
      })
      return { nursery: n, overview }
    })

    setRows(computed)
    setLoading(false)
  }

  if (loading) {
    return <div className="text-gray-400 py-12 text-center">Loading…</div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">
          Usage across all nurseries — last 7 days. Select a nursery for detailed reporting and PDF export.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Nursery</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Active Children</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Pickup Requests</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Adoption</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Avg / Active Day</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ nursery, overview }) => (
              <tr key={nursery.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{nursery.name}</td>
                <td className="px-4 py-3 text-gray-600">
                  {overview.activeChildren} / {overview.totalChildren}
                </td>
                <td className="px-4 py-3 text-gray-600">{overview.totalRequests}</td>
                <td className="px-4 py-3 text-gray-600">{Math.round(overview.adoptionRate * 100)}%</td>
                <td className="px-4 py-3 text-gray-600">{overview.avgPerActiveDay.toFixed(1)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => navigate(`/super-admin/analytics/${nursery.id}`)}
                    className="text-blue-600 hover:underline text-xs"
                  >
                    View details →
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No nurseries yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

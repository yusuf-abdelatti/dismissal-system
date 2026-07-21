import { useState } from 'react'
import { NavLink, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import SuperAdminNurseries from './SuperAdminNurseries'

// Deliberately not tenant-branded — this is the cross-nursery operator
// console, not a nursery's own interface, so it gets its own fixed look
// instead of reading colors from useTenant().
const NAV_ITEMS = [{ path: 'nurseries', label: 'Nurseries' }]

function Hamburger() {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="w-5 h-0.5 bg-gray-400" />
      <div className="w-5 h-0.5 bg-gray-400" />
      <div className="w-5 h-0.5 bg-gray-400" />
    </div>
  )
}

export default function SuperAdminDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static z-30 h-full w-64 bg-gray-900 text-white flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-6 border-b border-white/10">
          <h1 className="text-lg font-bold text-white">Platform Console</h1>
          <p className="text-xs mt-1 truncate text-gray-400">{user?.email}</p>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={`/super-admin/${item.path}`}
              className={({ isActive }) =>
                `block px-4 py-3 rounded-lg mb-1 text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10 hover:text-white'
                }`
              }
              onClick={() => setSidebarOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button
            onClick={logout}
            className="w-full px-4 py-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg text-sm text-left transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <header className="lg:hidden bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-black/5"
            aria-label="Open menu"
          >
            <Hamburger />
          </button>
          <span className="font-semibold text-sm text-gray-900">Platform Console</span>
        </header>

        <main className="flex-1 p-6">
          <Routes>
            <Route index element={<Navigate to="nurseries" replace />} />
            <Route path="nurseries" element={<SuperAdminNurseries />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

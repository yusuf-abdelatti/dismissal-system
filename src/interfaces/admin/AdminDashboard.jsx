import { useState } from 'react'
import { NavLink, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import AdminChildren from './AdminChildren'
import AdminClasses from './AdminClasses'
import AdminParents from './AdminParents'
import AdminStaff from './AdminStaff'
import AdminSettings from './AdminSettings'

const NAV_ITEMS = [
  { path: 'children', label: 'Children' },
  { path: 'classes', label: 'Classes' },
  { path: 'parents', label: 'Parent Accounts' },
  { path: 'staff', label: 'Staff Accounts' },
  { path: 'settings', label: 'Settings' },
]

function Hamburger() {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="w-5 h-0.5 bg-gray-600" />
      <div className="w-5 h-0.5 bg-gray-600" />
      <div className="w-5 h-0.5 bg-gray-600" />
    </div>
  )
}

export default function AdminDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static z-30 h-full w-64 bg-gray-900 text-white flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-lg font-bold text-white">Nursery Admin</h1>
          <p className="text-gray-500 text-xs mt-1 truncate">{user?.email}</p>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={`/admin/${item.path}`}
              className={({ isActive }) =>
                `block px-4 py-3 rounded-lg mb-1 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
              onClick={() => setSidebarOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={logout}
            className="w-full px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg text-sm text-left transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        {/* Mobile top bar */}
        <header className="lg:hidden bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label="Open menu"
          >
            <Hamburger />
          </button>
          <span className="font-semibold text-gray-800 text-sm">
            Nursery Admin
          </span>
        </header>

        <main className="flex-1 p-6">
          <Routes>
            <Route index element={<Navigate to="children" replace />} />
            <Route path="children" element={<AdminChildren />} />
            <Route path="classes" element={<AdminClasses />} />
            <Route path="parents" element={<AdminParents />} />
            <Route path="staff" element={<AdminStaff />} />
            <Route path="settings" element={<AdminSettings />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

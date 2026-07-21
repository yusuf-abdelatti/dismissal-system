import { useState } from 'react'
import { NavLink, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { useTenant } from '../../hooks/useTenant'
import AdminChildren from './AdminChildren'
import AdminClasses from './AdminClasses'
import AdminParents from './AdminParents'
import AdminStaff from './AdminStaff'
import AdminSettings from './AdminSettings'
import AdminRequests from './AdminRequests'

const NAV_ITEMS = [
  { path: 'requests', label: 'Active Requests' },
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
  const { tenant } = useTenant()
  const navigate = useNavigate()

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: tenant.backgroundColor }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static z-30 h-full w-64 text-white flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        style={{ backgroundColor: tenant.primaryColor }}
      >
        <div className="p-6 border-b border-white/20">
          <img
            src={tenant.logoUrl}
            alt={tenant.name}
            className="w-36 h-auto mb-6 mx-auto"
          />
          <h1 className="text-lg font-bold text-white">{tenant.name} Admin</h1>
          <p className="text-xs mt-1 truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>{user?.email}</p>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={`/admin/${item.path}`}
              className={({ isActive }) =>
                `block px-4 py-3 rounded-lg mb-1 text-sm font-medium transition-colors ${
                  isActive ? 'text-white' : 'hover:bg-white/10 hover:text-white'
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? { backgroundColor: tenant.secondaryColor }
                  : { color: 'rgba(255,255,255,0.75)' }
              }
              onClick={() => setSidebarOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/20">
          <button
            onClick={logout}
            className="w-full px-4 py-2 hover:text-white hover:bg-white/10 rounded-lg text-sm text-left transition-colors"
            style={{ color: 'rgba(255,255,255,0.75)' }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        {/* Mobile top bar */}
        <header className="lg:hidden border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10" style={{ backgroundColor: tenant.backgroundColor, borderColor: '#d4cfc8' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-black/5"
            aria-label="Open menu"
          >
            <Hamburger />
          </button>
          <span className="font-semibold text-sm" style={{ color: '#2C2C2C' }}>
            {tenant.name} Admin
          </span>
        </header>

        <main className="flex-1 p-6">
          <Routes>
            <Route index element={<Navigate to="requests" replace />} />
            <Route path="requests" element={<AdminRequests />} />
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

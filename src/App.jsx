import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { TenantProvider, useTenant } from './hooks/useTenant'
import LoginPage from './components/LoginPage'
import ProtectedRoute from './components/ProtectedRoute'
import ParentApp from './interfaces/parent/ParentApp'
import DisplayScreen from './interfaces/display/DisplayScreen'
import StaffApp from './interfaces/staff/StaffApp'
import AdminDashboard from './interfaces/admin/AdminDashboard'
import SuperAdminDashboard from './interfaces/superadmin/SuperAdminDashboard'
import PWAInstallBanner from './components/PWAInstallBanner'

const ROLE_REDIRECTS = {
  admin: '/admin',
  staff: '/staff',
  display: '/display',
  parent: '/parent',
  super_admin: '/super-admin',
}

// Blocks rendering until the tenant is resolved from the subdomain, so no
// page ever flashes another nursery's (or the default) branding first.
function TenantGate({ children }) {
  const { loading } = useTenant()

  if (loading) {
    return <div className="min-h-screen bg-gray-900" />
  }

  return children
}

function RootRedirect() {
  const { user, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading…</div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={ROLE_REDIRECTS[role] ?? '/login'} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RootRedirect />} />

      <Route
        path="/parent"
        element={
          <ProtectedRoute allowedRoles={['parent']}>
            <ParentApp />
          </ProtectedRoute>
        }
      />

      <Route
        path="/display"
        element={
          <ProtectedRoute allowedRoles={['display']}>
            <DisplayScreen />
          </ProtectedRoute>
        }
      />

      <Route
        path="/staff"
        element={
          <ProtectedRoute allowedRoles={['staff']}>
            <StaffApp />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/super-admin/*"
        element={
          <ProtectedRoute allowedRoles={['super_admin']}>
            <SuperAdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <TenantProvider>
        <TenantGate>
          <AuthProvider>
            <AppRoutes />
            <PWAInstallBanner />
          </AuthProvider>
        </TenantGate>
      </TenantProvider>
    </BrowserRouter>
  )
}

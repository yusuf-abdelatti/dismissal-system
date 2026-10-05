import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { TenantProvider, useTenant } from './hooks/useTenant'
import { APP_ROLE, isNative } from './native/platform'
import { registerNativePush, releaseNativePush } from './native/push'
import { supabase } from './supabaseClient'
import NurseryCodeScreen from './components/NurseryCodeScreen'
import LoginPage from './components/LoginPage'
import InstallGuide from './components/InstallGuide'
import ProtectedRoute from './components/ProtectedRoute'
import LicenseGate from './components/LicenseGate'
import ParentApp from './interfaces/parent/ParentApp'
import DisplayScreen from './interfaces/display/DisplayScreen'
import StaffApp from './interfaces/staff/StaffApp'
import AdminDashboard from './interfaces/admin/AdminDashboard'
import SuperAdminDashboard from './interfaces/superadmin/SuperAdminDashboard'
import PWAInstallBanner from './components/PWAInstallBanner'
import FeedbackForm from './interfaces/feedback/FeedbackForm'

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
  const { loading, needsNurseryCode } = useTenant()

  if (loading) {
    return <div className="min-h-screen bg-gray-900" />
  }

  // Native first launch only: no nursery code stored yet.
  if (needsNurseryCode) return <NurseryCodeScreen />

  return children
}

// Native apps: keep the device registered for push while someone is signed in.
function NativePushRegistrar() {
  const { user } = useAuth()
  const userId = user?.id

  useEffect(() => {
    if (isNative && userId) registerNativePush(userId)
  }, [userId])

  return null
}

// A native build only mounts its own role's route. Someone who signs into the
// wrong store app (say, an admin in the Staff app) gets this screen rather
// than a redirect loop, and can sign out from here.
function WrongAppScreen() {
  const label = APP_ROLE === 'parent' ? 'parent' : 'staff'
  const signOut = async () => {
    await releaseNativePush()
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--tenant-bg, #EAE5DF)' }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-6 text-center space-y-4">
        <p className="text-gray-800">
          This app is for {label} accounts. Please sign in with the right app, or contact your nursery.
        </p>
        <button onClick={signOut} className="text-sm underline text-gray-600">Sign out</button>
      </div>
    </div>
  )
}

function NativeRootRedirect() {
  const { user, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading…</div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (role === APP_ROLE) return <Navigate to={`/${APP_ROLE}`} replace />
  return <WrongAppScreen />
}

// Route tree for the Finnly Staff / Finnly Parent store apps. Only the
// signed-in role's own screen is mounted; admin, superadmin, display and the
// public feedback form do not exist in these builds.
function NativeAppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<NativeRootRedirect />} />

      {APP_ROLE === 'parent' && (
        <Route
          path="/parent"
          element={
            <ProtectedRoute allowedRoles={['parent']}>
              <ParentApp />
            </ProtectedRoute>
          }
        />
      )}

      {APP_ROLE === 'staff' && (
        <Route
          path="/staff"
          element={
            <ProtectedRoute allowedRoles={['staff']}>
              <LicenseGate>
                <StaffApp />
              </LicenseGate>
            </ProtectedRoute>
          }
        />
      )}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
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
  if (APP_ROLE) return <NativeAppRoutes />

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/installing" element={<InstallGuide />} />
      <Route path="/dismissal-feedback" element={<FeedbackForm />} />
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
            <LicenseGate>
              <StaffApp />
            </LicenseGate>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <LicenseGate>
              <AdminDashboard />
            </LicenseGate>
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
            {/* An installed store app is already installed; the banner is web-only. */}
            {!isNative && <PWAInstallBanner />}
            <NativePushRegistrar />
          </AuthProvider>
        </TenantGate>
      </TenantProvider>
    </BrowserRouter>
  )
}

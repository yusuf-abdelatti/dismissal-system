import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const ROLE_REDIRECTS = {
  admin: '/admin',
  staff: '/staff',
  display: '/display',
  parent: '/parent',
  super_admin: '/super-admin',
}

const Spinner = () => (
  <div className="min-h-screen bg-gray-900 flex items-center justify-center">
    <div className="text-white text-lg">Loading…</div>
  </div>
)

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, role, loading } = useAuth()

  // Wait until the auth check is fully resolved
  if (loading) return <Spinner />

  // User has a session but role hasn't been confirmed yet (SIGNED_IN in flight)
  if (user && !role) return <Spinner />

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={ROLE_REDIRECTS[role] ?? '/login'} replace />
  }

  return children
}

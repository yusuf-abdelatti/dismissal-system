import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useTenant } from '../hooks/useTenant'
import { resolveRoleAndNursery } from '../hooks/resolveTenant'

const ROLE_REDIRECTS = {
  admin: '/admin',
  staff: '/staff',
  display: '/display',
  parent: '/parent',
  super_admin: '/super-admin',
}

export default function LoginPage() {
  const { tenant } = useTenant()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true)
    setError(null)

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    const info = await resolveRoleAndNursery(data.user.id)

    if (tenant?.id && info.nurseryId && info.nurseryId !== tenant.id) {
      await supabase.auth.signOut()
      setError(`This account isn't part of ${tenant.name}.`)
      setLoading(false)
      return
    }

    navigate(ROLE_REDIRECTS[info.role] ?? '/parent', { replace: true })
    setLoading(false)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: tenant.backgroundColor }}
    >
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-xl">
        <div className="flex justify-center mb-6">
          <img
            src={tenant.logoUrl}
            alt={tenant.name}
            className="w-32 h-auto mx-auto mb-2"
          />
        </div>

        <h1 className="text-2xl font-bold text-center mb-1" style={{ color: tenant.primaryColor }}>
          {tenant.name}
        </h1>
        <p className="text-center text-sm mb-6" style={{ color: '#5A5A5A' }}>
          Dismissal made simple
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1" style={{ color: '#2C2C2C' }}>
            Email
          </label>
          <input
            type="email"
            autoComplete="email"
            className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-1" style={{ color: '#2C2C2C' }}>
            Password
          </label>
          <input
            type="password"
            autoComplete="current-password"
            className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading || !email || !password}
          className="w-full text-white py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          style={{ backgroundColor: tenant.primaryColor }}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </div>
    </div>
  )
}

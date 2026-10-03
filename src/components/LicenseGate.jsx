import { useTenant } from '../hooks/useTenant'
import { supabase } from '../supabaseClient'

const SUPPORT_EMAIL = 'info@technothera.com'

// Blocks the Admin/Staff interfaces behind a friendly, reversible message
// when a nursery is paused (tenant.isActive === false). Deliberately not
// used anywhere in the Parent or Display routes — pausing is aimed at the
// nursery operator only; parents and the reception display keep working
// completely normally either way.
export default function LicenseGate({ children }) {
  const { tenant } = useTenant()

  if (tenant.isActive) return children

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: tenant.backgroundColor }}
    >
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-xl text-center">
        {tenant.logoUrl && (
          <img src={tenant.logoUrl} alt={tenant.name} className="w-28 h-auto mx-auto mb-6" />
        )}
        <h1 className="text-xl font-bold mb-3" style={{ color: tenant.primaryColor }}>
          Access Temporarily Paused
        </h1>
        <p className="text-sm mb-6" style={{ color: '#5A5A5A' }}>
          {tenant.name}'s access is temporarily paused. Please contact your Technothera
          representative at{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline font-medium">
            {SUPPORT_EMAIL}
          </a>{' '}
          to reactivate it.
        </p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-xs underline"
          style={{ color: '#9CA3AF' }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

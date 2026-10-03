import { useTenant } from '../hooks/useTenant'

const SUPPORT_EMAIL = 'info@technothera.com'

function daysUntil(dateStr) {
  const target = new Date(`${dateStr}T00:00:00`)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - startOfToday) / (1000 * 60 * 60 * 24))
}

// Shown inside the Admin and Staff interfaces only — never Parent or
// Display — when a Super Admin has set a license expiry date for this
// nursery. Hidden entirely when no date is set, which is effectively the
// "activate this warning" switch described in Super Admin.
export default function LicenseBanner() {
  const { tenant } = useTenant()
  if (!tenant.isActive || !tenant.licenseExpiresAt) return null

  const days = daysUntil(tenant.licenseExpiresAt)
  const contact = (
    <>
      Please contact your Technothera representative at{' '}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="underline font-medium">
        {SUPPORT_EMAIL}
      </a>
    </>
  )

  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl mb-4 text-sm">
      {days >= 0 ? (
        <>
          Your license expires in <strong>{days} {days === 1 ? 'day' : 'days'}</strong>. {contact} to
          renew and avoid any interruption to service.
        </>
      ) : (
        <>
          Your license expired <strong>{Math.abs(days)} {Math.abs(days) === 1 ? 'day' : 'days'} ago</strong>.{' '}
          {contact} to renew and avoid any interruption to service.
        </>
      )}
    </div>
  )
}

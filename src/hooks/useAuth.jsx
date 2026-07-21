import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useTenant } from './useTenant'
import { resolveRoleAndNursery } from './resolveTenant'

const AuthContext = createContext(null)
const CACHE_KEY = 'userRoleInfo'

// Keyed to the userId it was resolved for, since more than one account can
// sign in from the same browser/origin (e.g. testing on a shared apex domain
// before wildcard subdomains exist) — without this check a stale cache from
// a previous account would get reused for whoever logs in next.
function readCacheFor(userId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
    return parsed && parsed.userId === userId ? parsed : null
  } catch {
    return null
  }
}

function writeCache(userId, info) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, ...info }))
}

function clearCache() {
  localStorage.removeItem(CACHE_KEY)
}

export function AuthProvider({ children }) {
  const { tenant } = useTenant()
  const tenantRef = useRef(tenant)
  useEffect(() => {
    tenantRef.current = tenant
  }, [tenant])

  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [nurseryId, setNurseryId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tenantMismatch, setTenantMismatch] = useState(false)

  useEffect(() => {
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        try {
          if (session?.user) {
            setUser(session.user)

            const cached = readCacheFor(session.user.id)
            let info = cached ? { role: cached.role, nurseryId: cached.nurseryId } : null
            if (!info) {
              info = await resolveRoleAndNursery(session.user.id)
            }

            const currentTenantId = tenantRef.current?.id
            if (currentTenantId && info.nurseryId && info.nurseryId !== currentTenantId) {
              setTenantMismatch(true)
              await supabase.auth.signOut()
              setUser(null)
              setRole(null)
              setNurseryId(null)
              clearCache()
              return
            }

            setTenantMismatch(false)
            setRole(info.role)
            setNurseryId(info.nurseryId)
            writeCache(session.user.id, info)
          } else {
            setUser(null)
            setRole(null)
            setNurseryId(null)
            clearCache()
          }
        } finally {
          if (mounted) setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, role, nurseryId, loading, tenantMismatch }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

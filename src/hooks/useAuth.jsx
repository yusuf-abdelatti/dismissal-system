import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useTenant } from './useTenant'
import { resolveRoleAndNursery } from './resolveTenant'

const AuthContext = createContext(null)
const CACHE_KEY = 'userRoleInfo'

// localStorage is already origin-scoped, and each nursery subdomain is its
// own origin, so this cache can never leak across nurseries.
function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
  } catch {
    return null
  }
}

function writeCache(info) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(info))
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

  const cached = readCache()
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(cached?.role ?? null)
  const [nurseryId, setNurseryId] = useState(cached?.nurseryId ?? null)
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

            let info = readCache()
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
            writeCache(info)
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

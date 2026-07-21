import { createContext, useContext, useEffect, useState } from 'react'

// Falls back to today's Finnly look whenever /api/nursery can't resolve a
// tenant (plain `vite dev` without the API layer, an apex/no-subdomain visit,
// or a network hiccup) so the app never renders unstyled.
const DEFAULT_TENANT = {
  id: null,
  slug: null,
  name: 'Finnly',
  logoUrl: '/finnly-logo.png',
  primaryColor: '#6B9BAF',
  secondaryColor: '#C49A45',
  backgroundColor: '#EAE5DF',
  pickupCountdownSeconds: 600,
}

const TenantContext = createContext({ tenant: DEFAULT_TENANT, loading: true })

function setMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setLink(rel, href) {
  let el = document.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

// iOS reads apple-touch-icon/apple-mobile-web-app-title at the moment someone
// taps "Add to Home Screen" — setting these early at boot (rather than only
// baking a single set into index.html) is what lets each nursery subdomain
// get its own install icon/name.
function applyBranding(tenant) {
  document.title = tenant.name
  setMeta('theme-color', tenant.primaryColor)
  setMeta('apple-mobile-web-app-title', tenant.name)
  if (tenant.logoUrl) setLink('apple-touch-icon', tenant.logoUrl)
}

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(DEFAULT_TENANT)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    // ?slug= lets you test tenant resolution on the current Vercel domain
    // before wildcard DNS (*.technothera.com) is live — e.g. ?slug=finnly
    const slugOverride = new URLSearchParams(window.location.search).get('slug')
    const url = slugOverride ? `/api/nursery?slug=${encodeURIComponent(slugOverride)}` : '/api/nursery'

    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        const resolved = data ? { ...DEFAULT_TENANT, ...data } : DEFAULT_TENANT
        setTenant(resolved)
        applyBranding(resolved)
      })
      .catch(() => {
        if (!cancelled) applyBranding(DEFAULT_TENANT)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <TenantContext.Provider value={{ tenant, loading }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  return useContext(TenantContext)
}

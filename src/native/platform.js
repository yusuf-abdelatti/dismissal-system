import { Capacitor } from '@capacitor/core'

// True only inside the Capacitor shells (staff / parent store apps). The web
// build, admin, superadmin and display always see false.
export const isNative = Capacitor.isNativePlatform()

// Set at build time via .env.staff / .env.parent (VITE_APP_ROLE). Undefined
// for the normal web build, which keeps every route mounted as before.
export const APP_ROLE = import.meta.env.VITE_APP_ROLE || null

// A WebView's origin is capacitor://localhost (iOS) or https://localhost
// (Android), so relative /api calls would hit the wrong host. Native builds
// point at the production site instead; the web build keeps relative paths.
const API_BASE = isNative ? (import.meta.env.VITE_API_BASE_URL || '') : ''

export function apiUrl(path) {
  return `${API_BASE}${path}`
}

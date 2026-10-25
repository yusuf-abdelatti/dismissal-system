import { Capacitor } from '@capacitor/core'

// True only inside the Capacitor shell (the Technothera Dismissal store app).
// The web build always sees false.
export const isNative = Capacitor.isNativePlatform()

// A WebView's origin is capacitor://localhost (iOS) or https://localhost
// (Android), so relative /api calls would hit the wrong host. Native builds
// point at the production site instead; the web build keeps relative paths.
const API_BASE = isNative ? (import.meta.env.VITE_API_BASE_URL || '') : ''

export function apiUrl(path) {
  return `${API_BASE}${path}`
}

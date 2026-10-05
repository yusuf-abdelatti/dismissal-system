// Builds the web bundle for one Capacitor store app.
//
//   node scripts/build-native.mjs staff   -> dist-staff/
//   node scripts/build-native.mjs parent  -> dist-parent/
//
// Per-app values live here, not in .env files, because the root .gitignore
// excludes .env* and these values must be committed. Supabase keys still come
// from .env.local as usual. Vite merges process.env VITE_* values in, so they
// are baked into the bundle as import.meta.env.
import { build } from 'vite'

// Production site the native apps call for /api/nursery (it has no origin of
// its own inside the WebView).
const API_BASE_URL = 'https://technothera.com'

const APPS = {
  staff: {
    VITE_APP_ROLE: 'staff',
    VITE_NATIVE_APP_ID: 'com.technothera.finnlystaff',
  },
  parent: {
    VITE_APP_ROLE: 'parent',
    VITE_NATIVE_APP_ID: 'com.technothera.finnlyparent',
  },
}

const role = process.argv[2]
if (!APPS[role]) {
  console.error('usage: node scripts/build-native.mjs <staff|parent>')
  process.exit(1)
}

Object.assign(process.env, APPS[role], { VITE_API_BASE_URL: API_BASE_URL })

await build({
  // Native WebViews load files from disk, so asset URLs must be relative.
  base: './',
  build: {
    outDir: `dist-${role}`,
    emptyOutDir: true,
  },
})

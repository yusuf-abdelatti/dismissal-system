// Builds the web bundle for the Technothera Dismissal Capacitor app.
//
//   node scripts/build-native.mjs   -> dist-native/
//
// This value is committed (root .gitignore excludes .env*, and it has to be
// baked into the bundle). Supabase keys still come from .env.local as usual.
// Vite merges process.env VITE_* values in, so they end up as
// import.meta.env.
import { build } from 'vite'

// Production site the native app calls for /api/nursery (it has no origin of
// its own inside the WebView).
const API_BASE_URL = 'https://technothera.com'

Object.assign(process.env, {
  VITE_NATIVE_APP_ID: 'com.technothera.dismissal',
  VITE_API_BASE_URL: API_BASE_URL,
})

await build({
  // Native WebViews load files from disk, so asset URLs must be relative.
  base: './',
  build: {
    outDir: 'dist-native',
    emptyOutDir: true,
  },
})

import { Preferences } from '@capacitor/preferences'

// The nursery code the user typed on first launch. Stored on-device so the
// right branding loads on every later launch, including the login screen,
// before anyone has signed in.
const KEY = 'finnly_nursery_slug'

export async function getStoredNurseryCode() {
  try {
    const { value } = await Preferences.get({ key: KEY })
    return value || null
  } catch {
    return null
  }
}

export async function storeNurseryCode(code) {
  await Preferences.set({ key: KEY, value: code })
}

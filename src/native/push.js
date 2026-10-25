import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from '../supabaseClient'
import { isNative } from './platform'

// Must match the channel id the Edge Functions send to (notify-*/native-push.ts).
export const ANDROID_CHANNEL_ID = 'dismissal_alerts'
// Bundle ID / application ID of the native app. Stored with the token
// because APNs needs it as the topic.
const NATIVE_APP_ID = import.meta.env.VITE_NATIVE_APP_ID || 'com.technothera.dismissal'

let listenersAttached = false
let currentToken = null

async function ensureAndroidChannel() {
  if (Capacitor.getPlatform() !== 'android') return
  // Importance 5 (MAX) + sound + vibration is what makes this a heads-up,
  // audible notification instead of a silent tray entry. Android locks these
  // settings once a channel exists, so they are chosen here, not per message.
  await PushNotifications.createChannel({
    id: ANDROID_CHANNEL_ID,
    name: 'Dismissal alerts',
    description: 'Pickup requests and parent arrivals',
    importance: 5,
    visibility: 1,
    sound: 'dismissal_alert',
    vibration: true,
    lights: true,
  })
}

function attachListeners() {
  if (listenersAttached) return
  listenersAttached = true

  PushNotifications.addListener('registration', async ({ value }) => {
    currentToken = value
    const { error } = await supabase.rpc('claim_device_push_token', {
      p_token: value,
      p_platform: Capacitor.getPlatform(),
      p_app_id: NATIVE_APP_ID,
    })
    if (error) console.error('Could not save push token:', error.message)
  })

  PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration failed:', err?.error ?? err)
  })
}

// Called once a user is signed in. Asks for permission (the OS prompt is shown
// only once), registers with FCM/APNs, and saves the token against this user.
export async function registerNativePush(userId) {
  if (!isNative || !userId) return

  try {
    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions()
    }
    if (perm.receive !== 'granted') return

    await ensureAndroidChannel()
    attachListeners()
    await PushNotifications.register()
  } catch (err) {
    // Push is best-effort; a failure here must never block the app.
    console.error('Native push setup failed:', err)
  }
}

// Called on sign-out so this device stops receiving pushes meant for the
// previous account.
export async function releaseNativePush() {
  if (!isNative || !currentToken) return
  try {
    await supabase.rpc('release_device_push_token', { p_token: currentToken })
  } catch (err) {
    console.error('Could not release push token:', err)
  }
  currentToken = null
}

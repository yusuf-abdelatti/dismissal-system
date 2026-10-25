// Native push (FCM for Android, APNs for iOS) for the Technothera Dismissal
// store app. Called from notify-parent and notify-staff alongside the
// existing Web Push loop, which is left unchanged.
//
// Credentials come from env vars. If one is missing, the platform is skipped
// with a clear log line rather than failing the whole function, so Web Push
// recipients still get their notifications while the native side is not set up.
//
//   FCM_SERVICE_ACCOUNT_JSON  Firebase service account key, the full JSON
//   APNS_AUTH_KEY             Contents of the APNs .p8 key (PKCS#8 PEM)
//   APNS_KEY_ID               10-char key id shown with the .p8 key
//   APNS_TEAM_ID              10-char Apple Developer Team ID
//   APNS_USE_SANDBOX          "true" to send to the development APNs host
//                             (Xcode debug builds). Unset = production.
//
// Android notification channel id and sound name must match the app:
//   channel 'dismissal_alerts' (created client-side in src/native/push.js)
//   sound 'dismissal_alert'    (res/raw/dismissal_alert.wav in native/android)

export interface NativePayload {
  title: string
  body: string
}

interface DeviceTokenRow {
  token: string
  platform: 'ios' | 'android'
  app_id: string
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = any

const ANDROID_CHANNEL_ID = 'dismissal_alerts'
const ANDROID_SOUND = 'dismissal_alert'
const IOS_SOUND = 'dismissal_alert.wav'

const enc = new TextEncoder()

function base64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array
  if (typeof input === 'string') bytes = enc.encode(input)
  else if (input instanceof Uint8Array) bytes = input
  else bytes = new Uint8Array(input)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

// ---------- FCM (HTTP v1) ----------

interface FcmCreds {
  project_id: string
  client_email: string
  private_key: string
}

let fcmCreds: FcmCreds | null | undefined
let fcmAccessToken: { value: string; expiresAt: number } | null = null

function loadFcmCreds(): FcmCreds | null {
  if (fcmCreds !== undefined) return fcmCreds
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')
  if (!raw) {
    console.warn('native-push: FCM_SERVICE_ACCOUNT_JSON not set; Android pushes skipped')
    fcmCreds = null
    return null
  }
  try {
    fcmCreds = JSON.parse(raw) as FcmCreds
    return fcmCreds
  } catch {
    console.error('native-push: FCM_SERVICE_ACCOUNT_JSON is not valid JSON; Android pushes skipped')
    fcmCreds = null
    return null
  }
}

async function getFcmAccessToken(creds: FcmCreds): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (fcmAccessToken && fcmAccessToken.expiresAt > now + 60) return fcmAccessToken.value

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(creds.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${header}.${claims}`))
  const assertion = `${header}.${claims}.${base64url(sig)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status} ${await res.text()}`)
  const json = await res.json()
  fcmAccessToken = { value: json.access_token, expiresAt: now + Number(json.expires_in ?? 3600) }
  return fcmAccessToken.value
}

// Returns true when the token is dead and should be removed.
async function sendFcm(token: string, payload: NativePayload): Promise<boolean> {
  const creds = loadFcmCreds()
  if (!creds) return false

  const accessToken = await getFcmAccessToken(creds)
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${creds.project_id}/messages:send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        android: {
          priority: 'HIGH',
          notification: {
            channel_id: ANDROID_CHANNEL_ID,
            sound: ANDROID_SOUND,
            notification_priority: 'PRIORITY_MAX',
            default_vibrate_timings: false,
            vibrate_timings: ['0.4s', '0.2s', '0.4s', '0.2s', '0.4s'],
            visibility: 'PUBLIC',
          },
        },
      },
    }),
  })
  if (res.ok) return false

  const text = await res.text()
  console.error('native-push: FCM send failed', res.status, text.slice(0, 300))
  // UNREGISTERED: the app was uninstalled or the token rotated. Other errors
  // (INVALID_ARGUMENT can be a bad payload) must not delete the token.
  return text.includes('UNREGISTERED')
}

// ---------- APNs (HTTP/2, token auth) ----------

interface ApnsCreds {
  key: CryptoKey
  keyId: string
  teamId: string
  host: string
}

let apnsCreds: ApnsCreds | null | undefined
let apnsJwt: { value: string; issuedAt: number } | null = null

async function loadApnsCreds(): Promise<ApnsCreds | null> {
  if (apnsCreds !== undefined) return apnsCreds
  const pem = Deno.env.get('APNS_AUTH_KEY')
  const keyId = Deno.env.get('APNS_KEY_ID')
  const teamId = Deno.env.get('APNS_TEAM_ID')
  if (!pem || !keyId || !teamId) {
    console.warn('native-push: APNS_AUTH_KEY / APNS_KEY_ID / APNS_TEAM_ID not all set; iOS pushes skipped')
    apnsCreds = null
    return null
  }
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(pem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const sandbox = Deno.env.get('APNS_USE_SANDBOX') === 'true'
  apnsCreds = {
    key,
    keyId,
    teamId,
    host: sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com',
  }
  return apnsCreds
}

async function getApnsJwt(creds: ApnsCreds): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  // Apple rejects provider tokens older than an hour; refresh every 50 minutes.
  if (apnsJwt && now - apnsJwt.issuedAt < 50 * 60) return apnsJwt.value

  const header = base64url(JSON.stringify({ alg: 'ES256', kid: creds.keyId }))
  const claims = base64url(JSON.stringify({ iss: creds.teamId, iat: now }))
  // WebCrypto returns the raw r||s signature that JWT ES256 expects.
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    creds.key,
    enc.encode(`${header}.${claims}`),
  )
  const value = `${header}.${claims}.${base64url(sig)}`
  apnsJwt = { value, issuedAt: now }
  return value
}

// Returns true when the token is dead and should be removed.
async function sendApns(token: string, appId: string, payload: NativePayload): Promise<boolean> {
  const creds = await loadApnsCreds()
  if (!creds) return false

  const jwt = await getApnsJwt(creds)
  const res = await fetch(`${creds.host}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': appId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: { critical: 0, name: IOS_SOUND, volume: 1.0 },
      },
    }),
  })
  if (res.ok) return false

  const text = await res.text()
  console.error('native-push: APNs send failed', res.status, text.slice(0, 300))
  // 410 Unregistered and 400 BadDeviceToken both mean the token is no longer valid.
  return res.status === 410 || text.includes('BadDeviceToken') || text.includes('Unregistered')
}

// ---------- Entry point ----------

// Sends to every native device a user has registered. Never throws: a failure
// here is logged and the caller carries on with its Web Push work.
export async function sendNativePushToUser(
  supabase: SupabaseLike,
  userId: string,
  payload: NativePayload,
): Promise<void> {
  try {
    const { data: rows, error } = await supabase
      .from('device_push_tokens')
      .select('token, platform, app_id')
      .eq('user_id', userId)
    if (error) {
      console.error('native-push: could not load device tokens', error.message)
      return
    }
    if (!rows?.length) return

    for (const row of rows as DeviceTokenRow[]) {
      try {
        const dead = row.platform === 'android'
          ? await sendFcm(row.token, payload)
          : await sendApns(row.token, row.app_id, payload)
        if (dead) {
          await supabase.from('device_push_tokens').delete().eq('token', row.token)
          console.log('native-push: removed dead token for', row.platform)
        }
      } catch (e) {
        console.error('native-push: send error', row.platform, String(e))
      }
    }
  } catch (e) {
    console.error('native-push: unexpected error', String(e))
  }
}

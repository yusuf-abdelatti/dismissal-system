import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function base64urlToUint8Array(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

async function sendPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
) {
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!

  const url = new URL(subscription.endpoint)
  const audience = `${url.protocol}//${url.host}`
  const subject = 'mailto:admin@nursery.com'

  // Build JWK from raw VAPID key bytes so Web Crypto can import it
  const privateKeyBytes = base64urlToUint8Array(vapidPrivate)
  const publicKeyBytes = base64urlToUint8Array(vapidPublic)

  const privateJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: btoa(String.fromCharCode(...publicKeyBytes.slice(1, 33)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    y: btoa(String.fromCharCode(...publicKeyBytes.slice(33)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    d: vapidPrivate,
    key_ops: ['sign'],
    ext: true,
  }

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  // Build VAPID JWT
  const now = Math.floor(Date.now() / 1000)
  const header = { typ: 'JWT', alg: 'ES256' }
  const claims = { aud: audience, exp: now + 43200, sub: subject }

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const unsignedToken = `${encode(header)}.${encode(claims)}`
  const sigBytes = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  )
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const token = `${unsignedToken}.${sig}`
  const vapidAuth = `vapid t=${token},k=${vapidPublic}`

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': vapidAuth,
      'TTL': '60',
    },
    body: null,
  })

  if (!response.ok) {
    const text = await response.text()
    console.error('Push send failed:', response.status, text)
  } else {
    console.log('Push sent OK to:', subscription.endpoint.substring(0, 50))
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    console.log('Webhook received:', JSON.stringify(body.record))

    const record = body.record
    if (!record?.child_id) {
      console.log('No child_id in record')
      return new Response('ok')
    }

    // Step 1: get the child's class
    const { data: child, error: childError } = await supabase
      .from('children')
      .select('class_id, full_name')
      .eq('id', record.child_id)
      .single()

    console.log('Child:', child, 'Error:', childError)
    if (!child?.class_id) return new Response('ok')

    // Step 2: get staff IDs assigned to this class
    const { data: staffRows, error: staffError } = await supabase
      .from('staff_profiles')
      .select('id')
      .eq('class_id', child.class_id)

    console.log('Staff rows:', JSON.stringify(staffRows), 'Error:', staffError)
    if (!staffRows?.length) return new Response('ok')

    const staffIds = staffRows.map((s: { id: string }) => s.id)

    // Step 3: get push subscriptions for those staff members
    const { data: subs, error: subsError } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .in('user_id', staffIds)

    console.log('Subscriptions:', JSON.stringify(subs), 'Error:', subsError)
    if (!subs?.length) return new Response('ok')

    // Step 4: send push to each subscription (bodyless — FCM requires encrypted
    // payloads; we skip encryption and let the service worker show a fixed notification)
    for (const sub of subs) {
      try {
        const parsed = JSON.parse(sub.subscription)
        await sendPush(parsed)
      } catch (e) {
        console.error('Send error:', e)
      }
    }

    return new Response('ok')
  } catch (err) {
    console.error('Function error:', err)
    return new Response('error', { status: 500 })
  }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webPush from 'npm:web-push@3.6.7'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

webPush.setVapidDetails(
  'mailto:admin@nursery.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
)

async function sendToUser(userId: string, payload: object) {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('subscription, endpoint')
    .eq('user_id', userId)

  if (!subs?.length) return

  for (const sub of subs) {
    try {
      const parsed = JSON.parse(sub.subscription)
      await webPush.sendNotification(parsed, JSON.stringify(payload))
      console.log('Sent to:', sub.endpoint.substring(0, 50))
    } catch (e: any) {
      console.error('Failed:', e.statusCode, e.message)
      if (e.statusCode === 404 || e.statusCode === 410) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', sub.endpoint)
        console.log('Removed stale subscription')
      }
    }
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    const record = body.record
    const oldRecord = body.old_record

    const isNewRequest = body.type === 'INSERT' && record?.status === 'requested'
    const isArrived = body.type === 'UPDATE'
      && record?.status === 'arrived'
      && oldRecord?.status !== 'arrived'

    if (!isNewRequest && !isArrived) return new Response('ok')
    if (!record?.child_id) return new Response('ok')

    const { data: child } = await supabase
      .from('children')
      .select('class_id, full_name, nurseries(logo_url)')
      .eq('id', record.child_id)
      .single()

    if (!child?.class_id) return new Response('ok')

    const firstName = child.full_name.split(' ')[0]
    const icon = (child as any).nurseries?.logo_url || undefined

    const payload = isArrived
      ? { title: '⚡ Parent Has Arrived!', body: `${firstName}'s parent is at the door`, icon }
      : { title: '🔔 New Pickup Request', body: `${firstName} needs to be picked up`, icon }

    const { data: staffRows } = await supabase
      .from('staff_profiles')
      .select('id')
      .eq('class_id', child.class_id)

    if (!staffRows?.length) return new Response('ok')

    await Promise.all(staffRows.map((s: any) => sendToUser(s.id, payload)))

    return new Response('ok')
  } catch (err) {
    console.error('Error:', String(err))
    return new Response('error', { status: 500 })
  }
})

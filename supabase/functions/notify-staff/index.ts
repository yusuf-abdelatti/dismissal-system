import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webPush from 'npm:web-push@3.6.7'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!
const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!

webPush.setVapidDetails(
  'mailto:admin@nursery.com',
  vapidPublic,
  vapidPrivate
)

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    const record = body.record
    const oldRecord = body.old_record

    const isNewRequest = body.type === 'INSERT' && record?.status === 'requested'
    const isArrived = body.type === 'UPDATE' && record?.status === 'arrived' && oldRecord?.status !== 'arrived'

    if (!isNewRequest && !isArrived) return new Response('ok')
    if (!record?.child_id) return new Response('ok')

    const { data: child } = await supabase
      .from('children')
      .select('class_id, full_name')
      .eq('id', record.child_id)
      .single()

    if (!child?.class_id) return new Response('ok')

    const firstName = child.full_name.split(' ')[0]

    const notificationPayload = isArrived
      ? { title: '⚡ Parent Has Arrived!', body: `${firstName}'s parent is at the door` }
      : { title: '🔔 New Pickup Request', body: `${firstName} needs to be picked up` }

    const { data: staffRows } = await supabase
      .from('staff_profiles')
      .select('id')
      .eq('class_id', child.class_id)

    if (!staffRows?.length) return new Response('ok')

    const staffIds = staffRows.map((s: any) => s.id)

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .in('user_id', staffIds)

    if (!subs?.length) return new Response('ok')

    for (const sub of subs) {
      try {
        const parsed = JSON.parse(sub.subscription)
        await webPush.sendNotification(parsed, JSON.stringify(notificationPayload))
        console.log('Push sent OK')
      } catch (e: any) {
        console.error('Push failed:', e.statusCode, e.message)
        // Remove expired/invalid subscriptions (404 = not found, 410 = unsubscribed)
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', parsed.endpoint)
          console.log('Removed expired subscription:', parsed.endpoint.substring(0, 40))
        }
      }
    }

    return new Response('ok')
  } catch (err) {
    console.error('Function error:', String(err))
    return new Response('error', { status: 500 })
  }
})

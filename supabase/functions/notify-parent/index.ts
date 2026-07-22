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

Deno.serve(async (req) => {
  try {
    const body = await req.json()
    const record = body.record
    const oldRecord = body.old_record

    if (record?.status !== 'ready' || oldRecord?.status === 'ready') {
      return new Response('ok')
    }

    const { data: child } = await supabase
      .from('children')
      .select('full_name, parent_user_id, nurseries(logo_url)')
      .eq('id', record.child_id)
      .single()

    if (!child?.parent_user_id) return new Response('ok')

    const firstName = child.full_name.split(' ')[0]
    const icon = (child as any).nurseries?.logo_url || undefined

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription, endpoint')
      .eq('user_id', child.parent_user_id)

    if (!subs?.length) return new Response('ok')

    for (const sub of subs) {
      try {
        const parsed = JSON.parse(sub.subscription)
        await webPush.sendNotification(parsed, JSON.stringify({
          title: '🌟 Your child is ready!',
          body: `${firstName} is ready and waiting — come on over 💛`,
          icon,
        }))
        console.log('Parent notified')
      } catch (e: any) {
        console.error('Failed:', e.statusCode, e.message)
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint)
        }
      }
    }

    return new Response('ok')
  } catch (err) {
    console.error('Error:', String(err))
    return new Response('error', { status: 500 })
  }
})

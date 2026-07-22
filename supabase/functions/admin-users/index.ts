import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Client scoped to the caller's own JWT — used only to identify who is calling.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: userErr } = await callerClient.auth.getUser()
  if (userErr || !user) return json({ error: 'Invalid session' }, 401)

  const [{ data: profile }, { data: superAdminRow }] = await Promise.all([
    callerClient.from('staff_profiles').select('role, nursery_id').eq('id', user.id).maybeSingle(),
    callerClient.from('super_admins').select('id').eq('id', user.id).maybeSingle(),
  ])

  const isSuperAdmin = !!superAdminRow
  const isNurseryAdmin = profile?.role === 'admin'
  if (!isSuperAdmin && !isNurseryAdmin) return json({ error: 'Forbidden' }, 403)

  // Nursery admins only ever operate within their own nursery.
  const callerNurseryId = profile?.nursery_id ?? null

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Returns the set of user ids that belong to the given nursery (staff +
  // parents), used to scope list/delete for non-super-admin callers so one
  // nursery's admin can never see or touch another nursery's accounts.
  async function nurseryUserIds(nurseryId: string) {
    const [{ data: staffRows }, { data: childRows }] = await Promise.all([
      adminClient.from('staff_profiles').select('id').eq('nursery_id', nurseryId),
      adminClient.from('children').select('parent_user_id').eq('nursery_id', nurseryId),
    ])
    return new Set([
      ...(staffRows || []).map((s: any) => s.id),
      ...(childRows || []).map((c: any) => c.parent_user_id).filter(Boolean),
    ])
  }

  try {
    const { action, ...params } = await req.json()

    if (action === 'list') {
      const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      if (error) return json({ error: error.message }, 400)

      let users = data.users
      if (!isSuperAdmin) {
        const allowed = await nurseryUserIds(callerNurseryId!)
        users = users.filter((u) => allowed.has(u.id))
      }

      return json({ users: users.map((u) => ({ id: u.id, email: u.email })) })
    }

    if (action === 'create') {
      const { email, password } = params
      if (!email || !password) return json({ error: 'email and password are required' }, 400)

      if (!isSuperAdmin && callerNurseryId) {
        const { data: nursery } = await adminClient
          .from('nurseries')
          .select('email_domain')
          .eq('id', callerNurseryId)
          .maybeSingle()

        if (nursery?.email_domain && !email.toLowerCase().endsWith(`@${nursery.email_domain.toLowerCase()}`)) {
          return json({ error: `Email must end with @${nursery.email_domain}` }, 400)
        }
      }

      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error) return json({ error: error.message }, 400)
      return json({ user: { id: data.user.id, email: data.user.email } })
    }

    if (action === 'setPassword') {
      const { userId, password } = params
      if (!userId || !password) return json({ error: 'userId and password are required' }, 400)
      if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400)

      if (!isSuperAdmin) {
        const allowed = await nurseryUserIds(callerNurseryId!)
        if (!allowed.has(userId)) return json({ error: 'Forbidden' }, 403)
      }

      const { error } = await adminClient.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (action === 'delete') {
      const { userId } = params
      if (!userId) return json({ error: 'userId is required' }, 400)

      if (!isSuperAdmin) {
        const allowed = await nurseryUserIds(callerNurseryId!)
        if (!allowed.has(userId)) return json({ error: 'Forbidden' }, 403)
      }

      const { error } = await adminClient.auth.admin.deleteUser(userId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    if (action === 'deleteNursery') {
      const { nurseryId } = params
      if (!nurseryId) return json({ error: 'nurseryId is required' }, 400)
      if (!isSuperAdmin) return json({ error: 'Forbidden' }, 403)

      const [{ data: staffRows }, { data: childRows }] = await Promise.all([
        adminClient.from('staff_profiles').select('id').eq('nursery_id', nurseryId),
        adminClient.from('children').select('parent_user_id').eq('nursery_id', nurseryId),
      ])

      const userIds = new Set([
        ...(staffRows || []).map((s: any) => s.id),
        ...(childRows || []).map((c: any) => c.parent_user_id).filter(Boolean),
      ])

      // Deleting each auth user cascades away their staff_profiles/children row.
      for (const id of userIds) {
        await adminClient.auth.admin.deleteUser(id)
      }

      // Cascades any remaining classes/children/pickup_requests for this nursery.
      const { error } = await adminClient.from('nurseries').delete().eq('id', nurseryId)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

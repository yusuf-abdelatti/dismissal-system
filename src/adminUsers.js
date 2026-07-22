import { supabase } from './supabaseClient'

// Thin wrapper around the `admin-users` Edge Function, which is the only
// place the service-role key is used. The function re-checks that the
// caller is an admin server-side before doing anything.
async function callAdminUsers(body) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })

  if (error) {
    // On a non-2xx response, supabase-js's `error.message` is just a generic
    // "Edge Function returned a non-2xx status code" — the actual JSON body
    // our function returned (the real reason) is only on error.context.
    let message = error.message || 'Request failed'
    if (error.context && typeof error.context.json === 'function') {
      try {
        const errBody = await error.context.json()
        if (errBody?.error) message = errBody.error
      } catch {
        // context wasn't JSON — keep the generic message
      }
    }
    throw new Error(message)
  }

  if (data?.error) throw new Error(data.error)
  return data
}

export function listUsers() {
  return callAdminUsers({ action: 'list' }).then((data) => data.users)
}

export function createUser(email, password) {
  return callAdminUsers({ action: 'create', email, password }).then((data) => data.user)
}

export function deleteUser(userId) {
  return callAdminUsers({ action: 'delete', userId })
}

export function setPassword(userId, password) {
  return callAdminUsers({ action: 'setPassword', userId, password })
}

export function deleteNursery(nurseryId) {
  return callAdminUsers({ action: 'deleteNursery', nurseryId })
}

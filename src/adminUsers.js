import { supabase } from './supabaseClient'

// Thin wrapper around the `admin-users` Edge Function, which is the only
// place the service-role key is used. The function re-checks that the
// caller is an admin server-side before doing anything.
async function callAdminUsers(body) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) throw new Error(error.message || 'Request failed')
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

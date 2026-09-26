import { supabase } from '../supabaseClient'

// Shared by useAuth.jsx (session restore / auth-state changes) and
// LoginPage.jsx (fresh sign-in) so both paths enforce the same
// account-belongs-to-this-nursery check the same way.
//
// Every query below used to ignore its `error` entirely — a failed lookup
// (a permission error, a dropped connection, anything) was silently
// treated as "no match" and fell through the remaining checks, ending in
// the {role:'parent', nurseryId:null} default. That default has a real
// consequence: nurseryId being null skips the tenant-mismatch check
// entirely (LoginPage/useAuth both require it to be truthy), so a
// staff/admin account whose lookup failed for any reason would silently
// get routed to the parent app instead of seeing any error — exactly the
// "doesn't log in, no error shown" symptom, with no exception ever thrown
// for a caller's try/catch to surface. Now any real query error throws
// immediately instead of being absorbed into a misleadingly clean default.
export async function resolveRoleAndNursery(userId) {
  const { data: superAdminRow, error: superAdminError } = await supabase
    .from('super_admins')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (superAdminError) throw new Error(`Could not check admin status: ${superAdminError.message}`)

  if (superAdminRow) {
    return { role: 'super_admin', nurseryId: null }
  }

  const { data: staffProfile, error: staffError } = await supabase
    .from('staff_profiles')
    .select('role, nursery_id')
    .eq('id', userId)
    .maybeSingle()

  if (staffError) throw new Error(`Could not check staff profile: ${staffError.message}`)

  if (staffProfile) {
    return { role: staffProfile.role, nurseryId: staffProfile.nursery_id }
  }

  const { data: child, error: childError } = await supabase
    .from('children')
    .select('nursery_id')
    .eq('parent_user_id', userId)
    .limit(1)
    .maybeSingle()

  if (childError) throw new Error(`Could not check parent status: ${childError.message}`)

  return { role: 'parent', nurseryId: child?.nursery_id ?? null }
}

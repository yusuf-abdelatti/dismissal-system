import { supabase } from '../supabaseClient'

// Shared by useAuth.jsx (session restore / auth-state changes) and
// LoginPage.jsx (fresh sign-in) so both paths enforce the same
// account-belongs-to-this-nursery check the same way.
export async function resolveRoleAndNursery(userId) {
  const { data: staffProfile } = await supabase
    .from('staff_profiles')
    .select('role, nursery_id')
    .eq('id', userId)
    .maybeSingle()

  if (staffProfile) {
    return { role: staffProfile.role, nurseryId: staffProfile.nursery_id }
  }

  const { data: child } = await supabase
    .from('children')
    .select('nursery_id')
    .eq('parent_user_id', userId)
    .limit(1)
    .maybeSingle()

  return { role: 'parent', nurseryId: child?.nursery_id ?? null }
}

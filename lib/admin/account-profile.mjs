export const ADMIN_PROFILE_COLUMNS = 'id,first_name,middle_name,last_name,suffix,gender,date_of_birth,mobile_number,username,avatar_url,role';
export const EDITABLE_PROFILE_FIELDS = ['first_name','middle_name','last_name','suffix','gender','date_of_birth','mobile_number','avatar_url'];
export function profileName(profile) {
  return [profile?.first_name,profile?.middle_name,profile?.last_name,profile?.suffix].filter(Boolean).join(' ').trim();
}
export function profileChanges(current, original) {
  const changes = {};
  for (const field of EDITABLE_PROFILE_FIELDS) {
    const value = String(current[field] ?? '').trim() || null;
    if (value !== (String(original[field] ?? '').trim() || null)) changes[field] = value;
  }
  return changes;
}
export async function saveOwnProfile(client, current, original) {
  const {data, error} = await client.auth.getUser();
  if (error) throw error;
  if (!data.user || data.user.id !== original.id) throw new Error('Your signed-in account changed. Reload Settings before saving.');
  const patch = profileChanges(current, original);
  if (!Object.keys(patch).length) return original;
  const result = await client.from('profiles').update(patch).eq('id',data.user.id).select(ADMIN_PROFILE_COLUMNS).single();
  if (result.error) throw result.error;
  return result.data;
}

export const EXISTING_ACCOUNT_MESSAGE = "If you already have an account, log in or use Forgot password on the login page. Otherwise, try registering again later.";
const KEY = 'medwell.pending-registration';

// This is a resumable UI hint, never proof of identity or verification.
export function readPendingRegistration() {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY));
    return value && typeof value.email === 'string' && value.expiresAt > Date.now() ? value : null;
  } catch { return null; }
}

export function savePendingRegistration(email, resendAt = Date.now() + 60000) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ email, resendAt, expiresAt: Date.now() + 86400000 })); } catch {}
}

export function clearPendingRegistration() {
  try { sessionStorage.removeItem(KEY); } catch {}
}

export function signupNeedsConfirmation(data) {
  const user = data?.user;
  if (!user || user.email_confirmed_at || (Array.isArray(user.identities) && user.identities.length === 0)) return false;
  return !data.session;
}

export async function getVerifiedSessionUser(client) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) return null;
  const result = await client.auth.getUser();
  if (result.error) throw result.error;
  return result.data.user?.email_confirmed_at ? result.data.user : null;
}

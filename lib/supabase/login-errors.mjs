export function getLoginErrorMessage(error, operation = 'password') {
  const code = String(error?.code ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return 'Please confirm your email address before logging in. Check your inbox for the confirmation email.';
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) return 'Email or password is incorrect. Please try again.';
  if (error?.status === 429 || code.includes('rate_limit') || message.includes('rate limit')) return operation === 'password'
    ? 'Too many sign-in attempts. Please wait before trying again.'
    : 'Too many verification emails requested. Wait before requesting another code; the email service may also have an hourly limit.';
  if (message.includes('fetch') || message.includes('network') || error?.name === 'AuthRetryableFetchError') return 'We could not reach the authentication service. Check your connection and try again.';
  if (operation === 'send-code' && (error?.status >= 500 || /smtp|sending|email.*(send|deliver)/.test(message))) return 'The email service could not deliver your verification code. Please try again later or contact the hospital administrator.';
  if (error?.status >= 500) return 'The authentication service is temporarily unavailable. Please try again later.';
  return operation === 'send-code' ? 'The verification-code request failed. Please try again or contact the hospital administrator.' : 'We could not sign you in. Please try again.';
}

// Never log the error object, request body, credentials, session, or email address.
export function safeAuthDiagnostic(error, operation) {
  const message = String(error?.message ?? 'Unknown authentication error')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b\d{6,}\b/g, '[redacted]')
    .replace(/\b[A-Za-z0-9_+/=-]{24,}\b/g, '[redacted]')
    .slice(0, 250);
  return { operation, code: String(error?.code ?? 'unknown'), status: Number(error?.status) || null, message };
}

export function getLoginDestination(roleHome, requestedPath = '/') {
  if (roleHome === '/admin') return '/admin';
  // The existing patient portal starts at its profile page; there is no /patient/dashboard route.
  const home = roleHome === '/' ? '/patient/profile' : roleHome;
  if (!requestedPath.startsWith('/') || requestedPath.startsWith('//') || /[\\\r\n]/.test(requestedPath)) return home;
  if (requestedPath === '/' || /^\/(admin|login|register)(\/|\?|$)/.test(requestedPath)) return home;
  return requestedPath;
}

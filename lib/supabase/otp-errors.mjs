export function getOtpVerificationMessage(error) {
  const code = String(error?.code ?? "").toLowerCase();
  const message = String(error?.message ?? "").toLowerCase();

  if (["otp_already_used", "token_already_used"].includes(code) || /already (used|verified|consumed)/.test(message)) {
    return "This verification code has already been used. Request a new code to continue.";
  }
  if (["token_expired"].includes(code) || /code has expired|token has expired/.test(message)) {
    return "This verification code has expired. Request a new code to continue.";
  }
  if (["invalid_otp", "otp_invalid", "token_invalid"].includes(code) || /code is invalid|token is invalid/.test(message)) {
    return "That code does not match. Check the newest email and try again.";
  }
  // Supabase combines some invalid, expired, and consumed-token responses.
  return "Supabase could not accept that code. It may be incorrect, expired, or already used. Check the newest email or request a new code.";
}

export function normalizeAuthEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

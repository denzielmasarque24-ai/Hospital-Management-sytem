"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [complete, setComplete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setCheckingSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setHasRecoverySession(!error && Boolean(data.session));
      setCheckingSession(false);
    }).catch(() => {
      if (active) setCheckingSession(false);
    });
    return () => { active = false; };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    if (password.length < 8) {
      setErrorMessage("Use a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }
    if (!supabase || !hasRecoverySession) {
      setErrorMessage("This reset link is invalid or has expired. Request a new password reset link.");
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setComplete(true);
    } catch {
      setErrorMessage("We could not update your password. The reset link may have expired; request a new one and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="password-reset-page">
      <section className="password-reset-card">
        <span className="password-reset-brand">MedWell <small>MEDICAL HOSPITAL</small></span>
        <h1>Reset your password</h1>
        {checkingSession ? <p className="password-reset-note" role="status">Checking your reset link…</p> : complete ? (
          <div className="password-reset-result"><p role="status">Your password has been updated. You can now log in with your new password.</p><Link href="/login">Back to Log In</Link></div>
        ) : !hasRecoverySession ? (
          <div className="password-reset-result"><p role="alert">This reset link is invalid or has expired. Request a new password reset link.</p><Link href="/login">Back to Log In</Link></div>
        ) : (
          <form className="password-reset-form" onSubmit={submit}>
            <p className="password-reset-note">Choose a new password for your account.</p>
            <label htmlFor="reset-new-password">New Password</label>
            <input id="reset-new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
            <label htmlFor="reset-confirm-password">Confirm New Password</label>
            <input id="reset-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required />
            {errorMessage ? <p className="auth-error" role="alert">{errorMessage}</p> : null}
            <button type="submit" disabled={isSaving}>{isSaving ? "Updating…" : "Update Password"}</button>
            <Link href="/login">Back to Log In</Link>
          </form>
        )}
      </section>
    </main>
  );
}

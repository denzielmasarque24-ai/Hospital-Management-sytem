"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase/client";
import { getRoleHomePath } from "@/lib/supabase/auth";
import { getOtpVerificationMessage, normalizeAuthEmail } from "@/lib/supabase/otp-errors.mjs";
import { getLoginDestination, getLoginErrorMessage, safeAuthDiagnostic } from "@/lib/supabase/login-errors.mjs";
import { clearPendingRegistration, getVerifiedSessionUser } from "@/lib/supabase/registration-state.mjs";

export function LoginForm({ onClose, onSwitchToRegister }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams?.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);
  const [isSendingRecovery, setIsSendingRecovery] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [verificationNotice, setVerificationNotice] = useState("");
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const otpActionInFlight = useRef(false);
  const submitInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    if (supabase) void (async () => {
      try {
        const user = await getVerifiedSessionUser(supabase);
        if (!user || !active) return;
        const destination = await getRoleHomePath(user);
        if (!active) return;
        clearPendingRegistration();
        onClose?.("authenticated");
        router.replace(getLoginDestination(destination, redirectTo));
        router.refresh();
      } catch { if (active) setSubmitError("We could not check your existing session. Please try logging in."); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  const validate = () => {
    const nextErrors = {};

    if (!email.trim()) {
      nextErrors.email = "Please enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (!password) nextErrors.password = "Please enter your password.";

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getRoleError = (error) => {
    if (error?.code === "PGRST116" || error?.message === "PROFILE_NOT_FOUND") {
      return "Your account does not have an authorized MedWell Medical Hospital role yet. Contact an administrator.";
    }
    return "We signed you in, but could not verify your authorized role. Please try again or contact an administrator.";
  };

  const handleRecoverySubmit = async (event) => {
    event.preventDefault();
    setRecoveryError("");
    setRecoverySent(false);
    const normalizedEmail = normalizeAuthEmail(recoveryEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setRecoveryError("Enter a valid email address to continue.");
      return;
    }
    if (!supabase) {
      setRecoveryError("Password recovery is unavailable right now. Please try again later.");
      return;
    }
    setIsSendingRecovery(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setRecoverySent(true);
    } catch {
      setRecoveryError("We could not send a reset link right now. Please try again later.");
    } finally {
      setIsSendingRecovery(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    if (submitInFlight.current || !validate()) return;

    if (!supabase) {
      setSubmitError("Supabase is not configured. Add your project URL and public anon key.");
      return;
    }

    submitInFlight.current = true;
    setIsSubmitting(true);
    let operation = "password";
    try {
      const normalizedEmail = normalizeAuthEmail(email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        console.error("MedWell authentication failed", safeAuthDiagnostic(error, "password"));
        setSubmitError(getLoginErrorMessage(error));
        return;
      }
      if (!data.user || !data.session) {
        setSubmitError("Sign-in completed without a user session. Please try again.");
        return;
      }

      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) {
        console.error("MedWell authentication failed", safeAuthDiagnostic(signOutError, "prepare-verification"));
        setSubmitError("We could not prepare secure verification. Please try again.");
        return;
      }
      setPendingEmail(normalizedEmail);
      setVerificationNotice("");
      setResendSeconds(60);
      operation = "send-code";
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: false },
      });
      if (otpError) {
        console.error("MedWell authentication failed", safeAuthDiagnostic(otpError, "send-code"));
        setSubmitError(getLoginErrorMessage(otpError, "send-code"));
        return;
      }
      setPendingEmail(normalizedEmail);
      setVerificationNotice(`A verification code was sent to ${normalizedEmail}.`);
    } catch (error) {
      console.error("MedWell authentication failed", safeAuthDiagnostic(error, operation));
      setSubmitError(getLoginErrorMessage(error, operation));
    } finally {
      submitInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();
    if (!otp.trim() || otpActionInFlight.current) return;
    otpActionInFlight.current = true;
    setIsVerifying(true);
    setSubmitError("");
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: otp.trim(),
        type: "email",
      });
      if (error) {
        console.error("MedWell authentication failed", safeAuthDiagnostic(error, "verify-code"));
        setSubmitError(getOtpVerificationMessage(error));
        return;
      }
      const user = data?.user ?? (await supabase.auth.getUser()).data.user;
      if (!user) {
        setSubmitError("We could not verify your signed-in account. Please log in again.");
        await supabase.auth.signOut();
        return;
      }
      let destination;
      try {
        // Read the authoritative profile role before choosing a destination.
        destination = await getRoleHomePath(user);
      } catch (error) {
        await supabase.auth.signOut();
        setSubmitError(getRoleError(error));
        return;
      }
      const target = getLoginDestination(destination, redirectTo);
      onClose?.("authenticated");
      router.replace(target);
      router.refresh();
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      otpActionInFlight.current = false;
      setIsVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (!supabase || otpActionInFlight.current || resendSeconds > 0) return;
    otpActionInFlight.current = true;
    setIsResending(true);
    setSubmitError("");
    setResendSeconds(60);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: pendingEmail, options: { shouldCreateUser: false } });
      if (error) {
        console.error("MedWell authentication failed", safeAuthDiagnostic(error, "send-code"));
        setSubmitError(getLoginErrorMessage(error, "send-code"));
      }
      else { setOtp(""); setSubmitError(""); setVerificationNotice(`A new code was sent to ${pendingEmail}. Use this latest email; previously sent codes may no longer work.`); }
    } catch {
      setSubmitError("We could not reach the verification service. Check your connection and try again.");
    } finally {
      otpActionInFlight.current = false;
      setIsResending(false);
    }
  };

  if (pendingEmail) {
    return (
      <form className="auth-form" onSubmit={handleVerifyOtp} noValidate>
        <p className="auth-success" role="status">{verificationNotice || `Email verification is required for ${pendingEmail}. Request a code below if delivery failed.`}</p>
        <div className="form-row">
          <label htmlFor="auth-login-otp">Verification Code</label>
          <input
            id="auth-login-otp"
            type="text"
            inputMode="numeric"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="Enter the code from your email"
            autoComplete="one-time-code"
            autoFocus
          />
        </div>
        {submitError ? <p className="auth-error" role="alert">{submitError}</p> : null}
        <button type="submit" className="login-submit-button" disabled={isVerifying || isResending}>
          {isVerifying ? "Verifying..." : "Confirm & Continue"}
        </button>
        <button type="button" className="auth-switch-button" onClick={() => void handleResendOtp()} disabled={isVerifying || isResending || resendSeconds > 0}>
          {isResending ? "Sending a new code..." : resendSeconds > 0 ? `Resend available in ${resendSeconds}s` : "Resend verification code"}
        </button>
      </form>
    );
  }

  if (recoveryOpen) {
    return (
      <form className="auth-form recovery-form" onSubmit={handleRecoverySubmit} noValidate>
        <h3 className="recovery-heading">Forgot Password?</h3>
        <p className="recovery-description">Enter your email address and we’ll send instructions to reset your password if an account matches.</p>
        <div className="form-row">
          <label htmlFor="auth-recovery-email">Email Address</label>
          <input id="auth-recovery-email" name="email" type="email" autoComplete="email" autoFocus value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="you@example.com" aria-invalid={Boolean(recoveryError)} />
        </div>
        {recoveryError ? <p className="auth-error" role="alert">{recoveryError}</p> : null}
        {recoverySent ? <p className="auth-success" role="status">If an account exists for this email, you’ll receive a password reset link shortly.</p> : null}
        <button type="submit" className="login-submit-button" disabled={isSendingRecovery}>{isSendingRecovery ? "Sending…" : "Send Reset Link"}</button>
        <button type="button" className="auth-switch-button recovery-back" onClick={() => { setRecoveryOpen(false); setRecoveryError(""); setRecoverySent(false); }}>Back to Log In</button>
      </form>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="form-row">
        <label htmlFor="auth-login-email">Email Address</label>
        <input
          id="auth-login-email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "auth-login-email-error" : undefined}
          placeholder="you@example.com"
        />
        {errors.email ? <span id="auth-login-email-error" className="field-error">{errors.email}</span> : null}
      </div>

      <div className="form-row">
        <label htmlFor="auth-login-password">Password</label>
        <div className="password-field">
          <input
            id="auth-login-password"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "auth-login-password-error" : undefined}
            placeholder="Enter your password"
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {errors.password ? <span id="auth-login-password-error" className="field-error">{errors.password}</span> : null}
        <button type="button" className="forgot-password-link" onClick={() => { setRecoveryEmail(email); setRecoveryOpen(true); setRecoveryError(""); setRecoverySent(false); }}>Forgot Password?</button>
      </div>

      {submitError ? <p className="auth-error" role="alert">{submitError}</p> : null}

      <button type="submit" className="login-submit-button" disabled={isSubmitting}>
        {isSubmitting ? "Signing in..." : "Log In"}
      </button>

      <div className="auth-switch-row">
        <span>Don&apos;t have an account?</span>
        {onSwitchToRegister ? (
          <button type="button" className="auth-switch-button" onClick={onSwitchToRegister}>Register</button>
        ) : (
          <Link className="auth-switch-button" href="/register">Register</Link>
        )}
      </div>
    </form>
  );
}

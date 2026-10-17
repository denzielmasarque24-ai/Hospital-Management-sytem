"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { supabase } from "@/lib/supabase/client";
import { getRoleHomePath } from "@/lib/supabase/auth";
import { getOtpVerificationMessage, normalizeAuthEmail } from "@/lib/supabase/otp-errors.mjs";

export function LoginForm({ onClose, onSwitchToRegister }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams?.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [verificationNotice, setVerificationNotice] = useState("");
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const otpActionInFlight = useRef(false);
  const submitInFlight = useRef(false);

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

  const getSignInError = (error) => {
    const message = (error?.message || "").toLowerCase();
    const code = (error?.code || "").toLowerCase();

    if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
      return "Please confirm your email address before logging in. Check your inbox for the confirmation link.";
    }
    if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
      return "Email or password is incorrect. If you have not registered yet, create an account.";
    }
    if (error?.status === 429) return "Too many sign-in attempts. Wait a moment and try again.";
    if (message.includes("fetch") || message.includes("network")) {
      return "We could not reach the sign-in service. Check your connection and try again.";
    }
    return "We could not sign you in. Check your details and try again.";
  };

  const getRoleError = (error) => {
    if (error?.code === "PGRST116" || error?.message === "PROFILE_NOT_FOUND") {
      return "Your account does not have an authorized MediWell role yet. Contact an administrator.";
    }
    return "We signed you in, but could not verify your authorized role. Please try again or contact an administrator.";
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
    try {
      const normalizedEmail = normalizeAuthEmail(email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        setSubmitError(getSignInError(error));
        return;
      }
      if (!data.user) {
        setSubmitError("Sign-in completed without a user session. Please try again.");
        return;
      }

      await supabase.auth.signOut();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: false },
      });
      if (otpError) {
        setSubmitError("We could not send a verification code. Please try again.");
        return;
      }
      setPendingEmail(normalizedEmail);
      setVerificationNotice(`A verification code was sent to ${normalizedEmail}.`);
    } catch (error) {
      setSubmitError(getSignInError(error));
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
      onClose?.();
      // Respect an in-app return target only after role verification. Admins always
      // land on their dashboard, and patient accounts always return to the homepage.
      const target = destination === "/admin" || destination === "/"
        ? destination
        : redirectTo !== "/" ? redirectTo : destination;
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
    if (!supabase || otpActionInFlight.current) return;
    otpActionInFlight.current = true;
    setIsResending(true);
    setSubmitError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: pendingEmail, options: { shouldCreateUser: false } });
      if (error) setSubmitError(error.status === 429 ? "A code was sent recently. Wait a moment before requesting another." : "We could not send a new verification code. Try again shortly.");
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
        <p className="auth-success" role="status">{verificationNotice || `A verification code was sent to ${pendingEmail}. Enter it below to continue.`}</p>
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
        <button type="button" className="auth-switch-button" onClick={() => void handleResendOtp()} disabled={isVerifying || isResending}>
          {isResending ? "Sending a new code..." : "Resend verification code"}
        </button>
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

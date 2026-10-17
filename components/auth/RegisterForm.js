"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { getRoleHomePath } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";
import { getOtpVerificationMessage, normalizeAuthEmail } from "@/lib/supabase/otp-errors.mjs";

const initialForm = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export function RegisterForm({ onClose, onSwitchToLogin }) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const otpActionInFlight = useRef(false);
  const submitInFlight = useRef(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setSubmitError("");
    setSuccessMessage("");
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.fullName.trim()) nextErrors.fullName = "Please enter your full name.";
    if (!form.email.trim()) {
      nextErrors.email = "Please enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = "Please enter a valid email address.";
    }
    if (!form.password) {
      nextErrors.password = "Please enter a password.";
    } else if (form.password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    }
    if (!form.confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your password.";
    } else if (form.confirmPassword !== form.password) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const getRegistrationError = (error) => {
    const message = (error?.message || "").toLowerCase();
    const code = (error?.code || "").toLowerCase();

    if (message.includes("already registered") || message.includes("already exists")) {
      return "An account with this email already exists. Please log in instead.";
    }
    if (message.includes("invalid email") || code.includes("email_address_invalid")) {
      return "Please enter a valid email address.";
    }
    if (message.includes("weak password") || message.includes("password should be")) {
      return "Choose a stronger password that meets the account requirements.";
    }
    if (error?.status === 429) return "Too many registration attempts. Wait a moment and try again.";
    if (message.includes("fetch") || message.includes("network")) {
      return "We could not reach the registration service. Check your connection and try again.";
    }
    return "We could not create your account. Please review your details and try again.";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setSuccessMessage("");
    if (submitInFlight.current || !validate()) return;

    if (!supabase) {
      setSubmitError("Supabase is not configured. Add your project URL and public anon key.");
      return;
    }

    submitInFlight.current = true;
    setIsSubmitting(true);
    try {
      const email = normalizeAuthEmail(form.email);
      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          data: { full_name: form.fullName.trim() },
        },
      });

      if (error) {
        setSubmitError(getRegistrationError(error));
        return;
      }

      if (!data.session) {
        setPendingEmail(email);
        setSuccessMessage("A confirmation code was sent to your email. Enter it below to confirm your account.");
        setForm(initialForm);
        return;
      }

      if (!data.user) {
        setSubmitError("Your account was created, but Supabase did not return a user session. Please log in.");
        return;
      }

      try {
        const destination = await getRoleHomePath(data.user);
        onClose?.();
        router.replace(destination);
        router.refresh();
      } catch {
        setSubmitError("Your account was created, but its authorized role is not available yet. Contact an administrator.");
      }
    } catch (error) {
      setSubmitError(getRegistrationError(error));
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
      try {
        const destination = await getRoleHomePath(data.user);
        onClose?.();
        router.replace(destination);
        router.refresh();
      } catch {
        onClose?.();
        router.replace("/");
        router.refresh();
      }
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
      const { error } = await supabase.auth.resend({ type: "signup", email: pendingEmail });
      if (error) setSubmitError(error.status === 429 ? "A code was sent recently. Wait a moment before requesting another." : "We could not send a new confirmation code. Try again shortly.");
      else { setOtp(""); setSuccessMessage("A new code was sent. Use this latest email; previously sent codes may no longer work."); }
    } catch {
      setSubmitError("We could not reach the confirmation service. Check your connection and try again.");
    } finally {
      otpActionInFlight.current = false;
      setIsResending(false);
    }
  };

  if (pendingEmail) {
    return (
      <form className="auth-form" onSubmit={handleVerifyOtp} noValidate>
        {successMessage ? <p className="auth-success" role="status">{successMessage}</p> : null}
        <div className="form-row">
          <label htmlFor="auth-otp">Confirmation Code</label>
          <input
            id="auth-otp"
            type="text"
            inputMode="numeric"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="Enter the code from your email"
            autoComplete="one-time-code"
          />
        </div>
        {submitError ? <p className="auth-error" role="alert">{submitError}</p> : null}
        <button type="submit" className="auth-submit" disabled={isVerifying || isResending}>
          {isVerifying ? "Verifying..." : "Confirm Account"}
        </button>
        <button type="button" className="auth-switch-button" onClick={() => void handleResendOtp()} disabled={isVerifying || isResending}>
          {isResending ? "Sending a new code..." : "Resend confirmation code"}
        </button>
      </form>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="form-row">
        <label htmlFor="auth-register-name">Full Name</label>
        <input id="auth-register-name" name="fullName" value={form.fullName} onChange={(event) => updateField("fullName", event.target.value)} type="text" autoComplete="name" aria-invalid={Boolean(errors.fullName)} placeholder="Your full name" />
        {errors.fullName ? <span className="field-error">{errors.fullName}</span> : null}
      </div>

      <div className="form-row">
        <label htmlFor="auth-register-email">Email Address</label>
        <input id="auth-register-email" name="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} placeholder="you@example.com" />
        {errors.email ? <span className="field-error">{errors.email}</span> : null}
      </div>

      <div className="form-row">
        <label htmlFor="auth-register-password">Password</label>
        <div className="password-field">
          <input id="auth-register-password" name="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} type={showPassword ? "text" : "password"} autoComplete="new-password" aria-invalid={Boolean(errors.password)} placeholder="Minimum 8 characters" />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
        </div>
        {errors.password ? <span className="field-error">{errors.password}</span> : null}
      </div>

      <div className="form-row">
        <label htmlFor="auth-register-confirm">Confirm Password</label>
        <div className="password-field">
          <input id="auth-register-confirm" name="confirmPassword" value={form.confirmPassword} onChange={(event) => updateField("confirmPassword", event.target.value)} type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" aria-invalid={Boolean(errors.confirmPassword)} placeholder="Confirm your password" />
          <button type="button" className="password-toggle" onClick={() => setShowConfirmPassword((visible) => !visible)} aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}>{showConfirmPassword ? "Hide" : "Show"}</button>
        </div>
        {errors.confirmPassword ? <span className="field-error">{errors.confirmPassword}</span> : null}
      </div>

      {submitError ? <p className="auth-error" role="alert">{submitError}</p> : null}
      {successMessage ? <p className="auth-success" role="status">{successMessage}</p> : null}

      <button type="submit" className="auth-submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account..." : "Create Account"}
      </button>

      <div className="auth-switch-row">
        <span>Already have an account?</span>
        {onSwitchToLogin ? (
          <button type="button" className="auth-switch-button" onClick={onSwitchToLogin}>Log In</button>
        ) : (
          <Link className="auth-switch-button" href="/login">Log In</Link>
        )}
      </div>
    </form>
  );
}

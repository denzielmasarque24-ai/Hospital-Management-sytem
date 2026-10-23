"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Eye, EyeOff, HeartPulse } from "lucide-react";

import { buildSignupMetadata, getRegistrationError, isUsernameAvailable, validateRegistration } from "@/lib/supabase/registration.mjs";
import { getRoleHomePath } from "@/lib/supabase/auth";
import { supabase } from "@/lib/supabase/client";
import { getOtpVerificationMessage, normalizeAuthEmail } from "@/lib/supabase/otp-errors.mjs";
import { EXISTING_ACCOUNT_MESSAGE, readPendingRegistration, savePendingRegistration, clearPendingRegistration, signupNeedsConfirmation, getVerifiedSessionUser } from "@/lib/supabase/registration-state.mjs";

const initialForm = {
  firstName: "", middleName: "", lastName: "", suffix: "", gender: "", birthday: "",
  mobileNumber: "", username: "", email: "", password: "", confirmPassword: "", acceptedTerms: false,
};

export function RegisterForm({ variant = "page", onSwitchToLogin }) {
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
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [resendSeconds, setResendSeconds] = useState(0);
  const resendAt = useRef(0);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        if (!supabase) return;
        const user = await getVerifiedSessionUser(supabase);
        if (!active) return;
        if (user) { await finishSignUp(user); return; }
        const pending = readPendingRegistration();
        if (pending) {
          setPendingEmail(pending.email);
          resendAt.current = pending.resendAt;
          setResendSeconds(Math.max(0, Math.ceil((pending.resendAt - Date.now()) / 1000)));
          setSuccessMessage("Continue with the newest confirmation email. If you already confirmed your email, log in instead.");
        }
      } catch { if (active) setSubmitError("We could not check your session. Reload or log in before continuing."); }
      finally { if (active) setIsCheckingSession(false); }
    };
    void restore();
    // Run outside the Supabase auth callback to avoid holding its session lock.
    const { data } = supabase?.auth.onAuthStateChange(() => { setTimeout(() => { if (active) void restore(); }, 0); }) ?? {};
    const onFocus = () => void restore();
    window.addEventListener("focus", onFocus);
    return () => { active = false; data?.subscription.unsubscribe(); window.removeEventListener("focus", onFocus); };
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds(Math.max(0, Math.ceil((resendAt.current - Date.now()) / 1000))), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  const startCooldown = (email) => {
    resendAt.current = Date.now() + 60000;
    setResendSeconds(60);
    savePendingRegistration(email, resendAt.current);
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setSubmitError("");
    setSuccessMessage("");
  };

  const validate = () => {
    const next = validateRegistration(form);
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const finishSignUp = async (user) => {
    if (!user?.id) throw new Error("AUTHENTICATED_USER_REQUIRED");
    clearPendingRegistration();
    setPendingEmail("");
    setOtp("");
    const roleHome = await getRoleHomePath(user);
    const destination = roleHome === "/" ? "/patient/profile" : roleHome;
    router.replace(destination);
    router.refresh();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setSuccessMessage("");
    if (isCheckingSession || pendingEmail || submitInFlight.current || !validate()) return;
    if (!supabase) return setSubmitError("Supabase is not configured. Add your project URL and public anon key.");
    submitInFlight.current = true;
    setIsSubmitting(true);
    try {
      const currentUser = await getVerifiedSessionUser(supabase);
      if (currentUser) { await finishSignUp(currentUser); return; }
      const email = normalizeAuthEmail(form.email);
      if (!await isUsernameAvailable(supabase, form.username)) {
        setErrors((current) => ({ ...current, username: "That username is already in use. Please choose another." }));
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: { data: buildSignupMetadata(form) },
      });
      if (error) {
        setSubmitError(getRegistrationError(error));
      } else if (data.session && data.user?.email_confirmed_at) {
        try {
          await finishSignUp(data.user);
        } catch (profileError) {
          setSubmitError(`Your account was created, but we could not open your patient profile. Please log in or contact support. ${profileError?.code === "42501" ? "Profile access is not enabled for new patients." : ""}`.trim());
        }
      } else if (signupNeedsConfirmation(data)) {
        setPendingEmail(email);
        startCooldown(email);
        setForm(initialForm);
        setSuccessMessage("A confirmation code was sent to your email. Enter it below to confirm your account.");
      } else {
        clearPendingRegistration();
        setPendingEmail("");
        if (data.user?.email_confirmed_at) router.replace("/login");
        else setSubmitError(EXISTING_ACCOUNT_MESSAGE);
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
    if (!pendingEmail || !otp.trim() || otpActionInFlight.current || !supabase) return;
    otpActionInFlight.current = true;
    setIsVerifying(true);
    setSubmitError("");
    try {
      const currentUser = await getVerifiedSessionUser(supabase);
      if (currentUser) { await finishSignUp(currentUser); return; }
      const { data, error } = await supabase.auth.verifyOtp({ email: pendingEmail, token: otp.trim(), type: "email" });
      if (error) setSubmitError(getOtpVerificationMessage(error));
      else {
        try {
          clearPendingRegistration();
          setPendingEmail("");
          setOtp("");
          const user = await getVerifiedSessionUser(supabase);
          if (user) await finishSignUp(user);
          else { router.replace("/login"); router.refresh(); }
        }
        catch (profileError) { setSubmitError(`Your account was confirmed, but we could not open your patient profile. Please log in or contact support. ${profileError?.code === "42501" ? "Profile access is not enabled for new patients." : ""}`.trim()); }
      }
    } catch { setSubmitError("Something went wrong. Please try again."); }
    finally { otpActionInFlight.current = false; setIsVerifying(false); }
  };

  const handleResendOtp = async () => {
    if (!supabase || !pendingEmail || otpActionInFlight.current || Date.now() < resendAt.current) return;
    otpActionInFlight.current = true;
    setIsResending(true);
    startCooldown(pendingEmail);
    setSubmitError("");
    try {
      const user = await getVerifiedSessionUser(supabase);
      if (user) { await finishSignUp(user); return; }
      const { error } = await supabase.auth.resend({ type: "signup", email: pendingEmail });
      if (error) setSubmitError(error.status === 429 ? "A code was sent recently. Wait a moment before requesting another." : "We could not send a new confirmation code. Try again shortly.");
      else { setOtp(""); setSuccessMessage("A new code was sent. Use this latest email; previously sent codes may no longer work."); }
    } catch { setSubmitError("We could not reach the confirmation service. Check your connection and try again."); }
    finally { otpActionInFlight.current = false; setIsResending(false); }
  };

  const field = (key, label, props = {}) => (
    <div className="registration-field" key={key}>
      <label htmlFor={`register-${key}`}>{label}{props.required && <span aria-hidden="true"> *</span>}</label>
      <div className={props.select ? "registration-select-wrap" : undefined}>
        {props.select ? <><select id={`register-${key}`} value={form[key]} onChange={(event) => updateField(key, event.target.value)} aria-invalid={Boolean(errors[key])} required={props.required}><option value="" disabled>{props.placeholder}</option>{props.options.map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select><ChevronDown size={17} aria-hidden="true" /></> : <input id={`register-${key}`} name={key} type={props.type || "text"} value={form[key]} onChange={(event) => updateField(key, event.target.value)} autoComplete={props.autoComplete} placeholder={props.placeholder} maxLength={props.maxLength} aria-invalid={Boolean(errors[key])} required={props.required} />}
      </div>
      {errors[key] && <span className="registration-field-error">{errors[key]}</span>}
    </div>
  );

  const allRequired = ["firstName", "lastName", "gender", "birthday", "mobileNumber", "username", "email", "password", "confirmPassword"].every((key) => String(form[key]).trim()) && form.acceptedTerms;
  const validBasics = allRequired && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && form.password.length >= 8 && form.confirmPassword === form.password;

  if (isCheckingSession) return <p role="status">Checking your session...</p>;

  return (
    <div className={`registration-shell${variant === "modal" ? " registration-shell-modal" : ""}`}>
      {variant !== "modal" && <div className="registration-brand"><span className="registration-brand-icon"><HeartPulse size={19} strokeWidth={2.4} /></span><span><strong>MedWell</strong><small>MEDICAL HOSPITAL</small></span></div>}
      {variant !== "modal" && <header className="registration-heading"><span>YOUR HEALTH JOURNEY STARTS HERE</span><h1>Create Account</h1><p>Join MedWell for personalized healthcare services.</p></header>}
      <form className="registration-form" onSubmit={pendingEmail ? handleVerifyOtp : handleSubmit} noValidate>
        <section className="registration-section"><h2>Personal Information</h2><div className="registration-grid registration-grid-name">
          {field("firstName", "First Name", { required: true, placeholder: "e.g. Juan" })}
          {field("middleName", "Middle Name", { placeholder: "e.g. Santos" })}
          {field("lastName", "Last Name", { required: true, placeholder: "e.g. Dela Cruz" })}
          {field("suffix", "Suffix", { placeholder: "e.g. Jr., III" })}
          {field("gender", "Gender", { required: true, select: true, placeholder: "Select gender", options: [["Female", "Female"], ["Male", "Male"], ["Other", "Other"], ["Prefer not to say", "Prefer not to say"]] })}
          {field("birthday", "Date of Birth", { required: true, type: "date", autoComplete: "bday" })}
        </div></section>
        <section className="registration-section"><h2>Contact Information</h2><div className="registration-grid registration-grid-contact">
          {field("mobileNumber", "Mobile Number", { required: true, type: "tel", autoComplete: "tel", placeholder: "0917 123 4567 or +63 917 123 4567", maxLength: 40 })}
          {field("username", "Username", { required: true, autoComplete: "username", placeholder: "Choose a username", maxLength: 60 })}
          <div className="registration-field registration-field-full"><label htmlFor="register-email">Email Address <span aria-hidden="true">*</span></label><input id="register-email" name="email" type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} autoComplete="email" placeholder="you@example.com" maxLength={254} aria-invalid={Boolean(errors.email)} required />{errors.email && <span className="registration-field-error">{errors.email}</span>}</div>
        </div></section>
        <section className="registration-section"><h2>Security Information</h2><div className="registration-grid registration-grid-security">
          <div className="registration-field"><label htmlFor="register-password">Password <span aria-hidden="true">*</span></label><div className="registration-password-wrap"><input id="register-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={(event) => updateField("password", event.target.value)} placeholder="At least 8 characters" aria-invalid={Boolean(errors.password)} required /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><span className={`registration-password-rule${form.password.length >= 8 ? " is-met" : ""}`}><Check size={13} aria-hidden="true" />At least 8 characters</span>{errors.password && <span className="registration-field-error">{errors.password}</span>}</div>
          <div className="registration-field"><label htmlFor="register-confirmPassword">Confirm Password <span aria-hidden="true">*</span></label><div className="registration-password-wrap"><input id="register-confirmPassword" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" value={form.confirmPassword} onChange={(event) => updateField("confirmPassword", event.target.value)} placeholder="Re-enter your password" aria-invalid={Boolean(errors.confirmPassword)} required /><button type="button" aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"} onClick={() => setShowConfirmPassword((visible) => !visible)}>{showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{errors.confirmPassword && <span className="registration-field-error">{errors.confirmPassword}</span>}</div>
        </div></section>
        <div className="registration-terms"><label htmlFor="register-terms"><input id="register-terms" type="checkbox" required aria-invalid={Boolean(errors.acceptedTerms)} checked={form.acceptedTerms} onChange={(event) => updateField("acceptedTerms", event.target.checked)} /><span className="registration-check"><Check size={14} /></span><span>I agree to the <Link href="/terms" target="_blank">Terms and Conditions</Link> and <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span></label>{errors.acceptedTerms && <span className="registration-field-error">{errors.acceptedTerms}</span>}</div>
        {submitError && <p className="auth-error" role="alert">{submitError}</p>}
        {successMessage && <p className="auth-success" role="status">{successMessage}</p>}
        {pendingEmail && <div className="registration-otp"><label htmlFor="auth-otp">Confirm your email: {pendingEmail}</label><div><input id="auth-otp" inputMode="numeric" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter email code" autoComplete="one-time-code" /><button type="button" onClick={() => void handleResendOtp()} disabled={isResending || isVerifying || resendSeconds > 0}>{isResending ? "Sending..." : resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend"}</button></div><button type="button" className="registration-verify" onClick={(event) => void handleVerifyOtp(event)} disabled={!otp.trim() || isVerifying || isResending}>{isVerifying ? "Verifying..." : "Confirm Email"}</button></div>}
        <button type="submit" className="registration-submit" disabled={!validBasics || isSubmitting || Boolean(pendingEmail)}>{isSubmitting ? "Creating account..." : "Create Account"}</button>
        <p className="registration-login">Already have an account? {onSwitchToLogin ? <button type="button" className="registration-login-button" onClick={onSwitchToLogin}>Log in</button> : <Link href="/login">Log in</Link>}</p>
      </form>
    </div>
  );
}

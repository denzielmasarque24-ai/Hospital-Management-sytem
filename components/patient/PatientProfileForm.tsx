"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AtSign, CalendarDays, Camera, Clock3, IdCard, Mail, Pencil, Phone, ShieldCheck, UserRound, VenusAndMars, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

export type PatientProfile = {
  first_name: string; middle_name: string; last_name: string; suffix: string; gender: string;
  date_of_birth: string; mobile_number: string; username: string; avatar_url: string;
};

type Props = { userId: string; email: string; createdAt: string | null; updatedAt: string | null; initialProfile: PatientProfile };
const emptyValue = "Not recorded";
const displayDate = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : emptyValue;
const displayDateOnly = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : emptyValue;
};
const localDateInputValue = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const getName = (profile: PatientProfile) => [profile.first_name, profile.middle_name, profile.last_name, profile.suffix].filter(Boolean).join(" ") || "Patient";

export function PatientProfileForm({ userId, email, createdAt, updatedAt, initialProfile }: Props) {
  const router = useRouter();
  const [savedProfile, setSavedProfile] = useState(initialProfile);
  const [form, setForm] = useState(initialProfile);
  const [created] = useState(createdAt);
  const [lastUpdated, setLastUpdated] = useState(updatedAt);
  const [notice, setNotice] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof PatientProfile, string>>>({});
  const [saving, setSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestCloseRef = useRef<() => void>(() => {});
  const fileRef = useRef<HTMLInputElement>(null);
  const update = (key: keyof PatientProfile, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setNotice("");
  };
  const hasUnsavedChanges = Object.keys(savedProfile).some((key) => form[key as keyof PatientProfile] !== savedProfile[key as keyof PatientProfile]);
  const openEditor = () => { setForm(savedProfile); setNotice(""); setFieldErrors({}); setIsOpen(true); };
  const closeEditor = (confirmDiscard = true) => {
    if (saving) return;
    if (confirmDiscard && hasUnsavedChanges && !window.confirm("Discard your unsaved profile changes?")) return;
    setForm(savedProfile); setNotice(""); setFieldErrors({}); setIsOpen(false);
    if (fileRef.current) fileRef.current.value = "";
    window.requestAnimationFrame(() => openerRef.current?.focus());
  };
  requestCloseRef.current = () => closeEditor();
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); requestCloseRef.current(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter((item) => item.offsetParent !== null);
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { window.clearTimeout(focusTimer); document.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = previousOverflow; };
  }, [isOpen]);
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: Partial<Record<keyof PatientProfile, string>> = {};
    if (!form.first_name.trim()) errors.first_name = "First name is required.";
    if (!form.last_name.trim()) errors.last_name = "Last name is required.";
    if (form.date_of_birth && form.date_of_birth.slice(0, 10) > localDateInputValue()) errors.date_of_birth = "Date of birth cannot be in the future.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    if (!supabase) return setNotice("Profile saving is unavailable because Supabase is not configured.");
    setSaving(true);
    setNotice("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        if (authError) console.error("Profile user lookup failed:", { code: authError.status, message: authError.message });
        setNotice("Please log in again before saving your profile.");
        return;
      }

      const updates = {
        first_name: form.first_name.trim() || null,
        middle_name: form.middle_name.trim() || null,
        last_name: form.last_name.trim() || null,
        suffix: form.suffix.trim() || null,
        gender: form.gender || null,
        date_of_birth: form.date_of_birth || null,
        mobile_number: form.mobile_number.trim() || null,
        username: form.username.trim() || null,
      };
      const { data: updatedProfile, error } = await supabase.from("profiles")
        .update(updates)
        .eq("id", user.id)
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("Profile update failed:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        const databaseErrorText = [error.message, error.details, error.hint].filter(Boolean).join(" ");
        if (error.code === "23505" && /username/i.test(databaseErrorText)) {
          setFieldErrors((current) => ({ ...current, username: "This username is already in use. Choose another one." }));
          setNotice("");
        } else setNotice(`Profile could not be saved${error.code ? ` (${error.code})` : ""}: ${error.message}`);
        return;
      }
      if (!updatedProfile) {
        setNotice("No profile row was updated. Reload the page and try again.");
        return;
      }

      setSavedProfile(form);
      setLastUpdated(new Date().toISOString());
      setNotice("Your profile was updated.");
      router.refresh();
      setIsOpen(false);
      window.requestAnimationFrame(() => openerRef.current?.focus());
    } catch (error) {
      console.error("Profile update failed:", error);
      setNotice(error instanceof Error ? `Profile could not be saved: ${error.message}` : "Profile could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const changePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!supabase) { setNotice("Photo upload is unavailable because Supabase is not configured."); return; }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) { setNotice("Choose a JPG, PNG, or WebP image under 5 MB."); return; }
    setSaving(true); setNotice("");
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `${userId}/avatar.${extension}`;
    const { error: uploadError } = await supabase.storage.from("profile-images").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) { setNotice(`Profile picture could not be uploaded: ${uploadError.message}`); setSaving(false); return; }
    const { data } = supabase.storage.from("profile-images").getPublicUrl(path);
    const url = `${data.publicUrl}?updated=${Date.now()}`;
    const { error: profileError } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
    const { error: authError } = await supabase.auth.updateUser({ data: { avatar_url: url } });
    if (profileError) setNotice(`Picture uploaded, but the profile image could not be updated${profileError.code ? ` (${profileError.code})` : ""}: ${profileError.message}`);
    else {
      const next = { ...form, avatar_url: url };
      setForm(next); setSavedProfile((current) => ({ ...current, avatar_url: url }));
      if (authError) setNotice(`Profile picture was saved, but the account image could not be synchronized: ${authError.message}`);
      else setNotice("Profile picture updated.");
      router.refresh();
    }
    setSaving(false);
  };
  const fullName = getName(savedProfile);
  const firstInitial = savedProfile.first_name.trim().charAt(0).toUpperCase();
  const lastInitial = savedProfile.last_name.trim().charAt(0).toUpperCase();
  const initials = `${firstInitial}${lastInitial}` || "P";
  const dob = savedProfile.date_of_birth;
  const info = [
    { label: "Full name", value: fullName === "Patient" ? emptyValue : fullName, Icon: UserRound },
    { label: "Date of birth", value: dob ? displayDateOnly(dob) : emptyValue, Icon: CalendarDays },
    { label: "Gender", value: savedProfile.gender || emptyValue, Icon: VenusAndMars },
    { label: "Patient ID", value: userId, Icon: IdCard, code: true },
    { label: "Account created", value: displayDate(created), Icon: Clock3 },
  ];
  const contact = [
    { label: "Email", value: email || emptyValue, Icon: Mail },
    { label: "Mobile", value: savedProfile.mobile_number || emptyValue, Icon: Phone },
    { label: "Username", value: savedProfile.username || emptyValue, Icon: AtSign },
    { label: "Last updated", value: displayDate(lastUpdated), Icon: Clock3 },
  ];
  const currentGenderOption = form.gender && !["Male", "Female", "Other", "Prefer not to say"].includes(form.gender) ? form.gender : "";

  return <div className="patient-profile-page">
    <section className="patient-profile-hero" aria-label="Patient profile overview">
      <div className="patient-profile-hero-person">
        <div className="patient-profile-avatar">{savedProfile.avatar_url ? <img src={savedProfile.avatar_url} alt={`${fullName} profile`} /> : <span>{initials}</span>}</div>
        <div><h2>{fullName}</h2><span className="patient-profile-badge"><ShieldCheck size={15} aria-hidden="true"/>Patient</span><p>Your account information and contact details</p></div>
      </div>
      <button ref={openerRef} type="button" className="patient-primary-button patient-profile-edit-hero" onClick={openEditor}><Pencil size={16} aria-hidden="true"/>Edit Profile</button>
    </section>

    <div className="patient-profile-info-grid">
      <section className="patient-card patient-profile-info-card"><h2>Personal Information</h2><div className="patient-profile-info-list">{info.map(({ label, value, Icon, code }) => <div className="patient-profile-info-row" key={label}><span className="patient-profile-info-icon"><Icon size={17} aria-hidden="true"/></span><div><span>{label}</span><strong className={code ? "patient-profile-code" : ""}>{value}</strong></div></div>)}</div></section>
      <section className="patient-card patient-profile-info-card"><h2>Contact &amp; Account</h2><div className="patient-profile-info-list">{contact.map(({ label, value, Icon }) => <div className="patient-profile-info-row" key={label}><span className="patient-profile-info-icon"><Icon size={17} aria-hidden="true"/></span><div><span>{label}</span><strong>{value}</strong></div></div>)}<div className="patient-profile-info-row"><span className="patient-profile-info-icon"><ShieldCheck size={17} aria-hidden="true"/></span><div><span>Account role</span><strong><span className="patient-profile-badge">Patient</span></strong></div></div></div></section>
    </div>
    {!isOpen && notice === "Your profile was updated." && <p className="patient-form-success" role="status">{notice}</p>}

    {isOpen && typeof document !== "undefined" && createPortal(<div className="patient-profile-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
      <div ref={dialogRef} className="patient-profile-modal" role="dialog" aria-modal="true" aria-labelledby="patient-profile-modal-title" aria-describedby="patient-profile-modal-description" tabIndex={-1}>
        <header className="patient-profile-modal-header"><div><h2 id="patient-profile-modal-title">Edit Profile</h2><p id="patient-profile-modal-description">Update your personal and contact information.</p></div><button ref={closeRef} type="button" className="patient-profile-modal-close" aria-label="Close edit profile" onClick={() => closeEditor()} disabled={saving}><X size={20}/></button></header>
        <form className="patient-profile-form patient-profile-modal-form" onSubmit={save}>
          <div className="patient-profile-modal-content">
            <div className="patient-profile-form-top"><div className="patient-profile-photo"><span className="patient-profile-photo-preview">{form.avatar_url ? <img src={form.avatar_url} alt="Profile preview"/> : <span>{initials}</span>}<button type="button" className="patient-profile-camera" aria-label="Change profile photo" onClick={() => fileRef.current?.click()} disabled={saving}><Camera size={16}/></button></span><div><label className="patient-secondary-button" htmlFor="patient-profile-photo-input">Change Photo</label><input ref={fileRef} id="patient-profile-photo-input" tabIndex={-1} className="patient-profile-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void changePhoto(event)} disabled={saving}/><small>JPG, PNG, or WebP - maximum 5 MB</small></div></div></div>
            <p className="patient-profile-readonly-note"><ShieldCheck size={15} aria-hidden="true"/>Email, patient ID, and account role are read-only.</p>
            <div className="patient-profile-modal-fields">
              <label>First Name<input required aria-invalid={!!fieldErrors.first_name} aria-describedby={fieldErrors.first_name ? "profile-first-name-error" : undefined} value={form.first_name} onChange={(e) => update("first_name", e.target.value)} maxLength={100} autoComplete="given-name" placeholder="Enter first name"/>{fieldErrors.first_name && <span id="profile-first-name-error" className="patient-profile-field-error">{fieldErrors.first_name}</span>}</label>
              <label>Middle Name<input value={form.middle_name} onChange={(e) => update("middle_name", e.target.value)} maxLength={100} autoComplete="additional-name" placeholder="Enter middle name (optional)"/></label>
              <label>Last Name<input required aria-invalid={!!fieldErrors.last_name} aria-describedby={fieldErrors.last_name ? "profile-last-name-error" : undefined} value={form.last_name} onChange={(e) => update("last_name", e.target.value)} maxLength={100} autoComplete="family-name" placeholder="Enter last name"/>{fieldErrors.last_name && <span id="profile-last-name-error" className="patient-profile-field-error">{fieldErrors.last_name}</span>}</label>
              <label>Suffix<input value={form.suffix} onChange={(e) => update("suffix", e.target.value)} maxLength={20} placeholder="e.g. Jr., III"/></label>
              <label>Gender<select value={form.gender} onChange={(e) => update("gender", e.target.value)}><option value="">Select gender</option>{currentGenderOption && <option value={currentGenderOption}>{currentGenderOption}</option>}<option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option></select></label>
              <label>Date of Birth<input type="date" aria-invalid={!!fieldErrors.date_of_birth} aria-describedby={fieldErrors.date_of_birth ? "profile-dob-error" : undefined} value={form.date_of_birth.slice(0, 10)} max={localDateInputValue()} onChange={(e) => update("date_of_birth", e.target.value)}/>{fieldErrors.date_of_birth && <span id="profile-dob-error" className="patient-profile-field-error">{fieldErrors.date_of_birth}</span>}</label>
              <label>Email Address<input value={email} readOnly aria-readonly="true"/></label>
              <label>Mobile Number<input type="tel" value={form.mobile_number} onChange={(e) => update("mobile_number", e.target.value)} maxLength={40} autoComplete="tel" placeholder="Enter mobile number"/></label>
              <label>Username<input aria-invalid={!!fieldErrors.username} aria-describedby={fieldErrors.username ? "profile-username-error" : undefined} value={form.username} onChange={(e) => update("username", e.target.value)} maxLength={60} autoComplete="username" placeholder="Choose a username"/>{fieldErrors.username && <span id="profile-username-error" className="patient-profile-field-error">{fieldErrors.username}</span>}</label>
            </div>
            {notice && <p role="status" className={notice.includes("could not") || notice.includes("Choose") || notice.includes("unavailable") ? "patient-form-error" : "patient-form-success"}>{notice}</p>}
          </div>
          <footer className="patient-profile-modal-footer"><button className="patient-profile-cancel" type="button" onClick={() => closeEditor()} disabled={saving}>Cancel</button><button className="patient-primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button></footer>
        </form>
      </div>
    </div>, document.body)}
  </div>;
}

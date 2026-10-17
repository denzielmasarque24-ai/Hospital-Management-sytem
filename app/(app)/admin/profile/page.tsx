"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, KeyRound, LoaderCircle, Save, ShieldCheck, UserRound } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/lib/supabase/client";

type ProfileForm = { fullName: string; email: string; phone: string; department: string; bio: string; avatarUrl: string };
const emptyProfile: ProfileForm = { fullName: "", email: "", phone: "", department: "", bio: "", avatarUrl: "" };

export default function AdminProfilePage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("Administrator");
  const [joined, setJoined] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile);
  const [savedProfile, setSavedProfile] = useState<ProfileForm>(emptyProfile);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pendingImagePath, setPendingImagePath] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!supabase) { router.replace("/login"); return; }
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) { router.replace("/login"); return; }
      const user = data.user;
      const metadata = user.user_metadata ?? {};
      const { data: profileRow } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!active) return;
      const fields: ProfileForm = {
        fullName: typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : "",
        email: user.email ?? "",
        phone: typeof metadata.phone === "string" ? metadata.phone : "",
        department: typeof metadata.department === "string" ? metadata.department : "",
        bio: typeof metadata.bio === "string" ? metadata.bio : "",
        avatarUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : "",
      };
      setUserId(user.id);
      setRole(String(profileRow?.role ?? "Administrator").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()));
      setJoined(user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—");
      setEmailVerified(Boolean(user.email_confirmed_at));
      setProfile(fields);
      setSavedProfile(fields);
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [router]);

  const updateProfile = (key: keyof ProfileForm, value: string) => setProfile((current) => ({ ...current, [key]: value }));

  const uploadPhoto = async (file?: File) => {
    if (!file || !supabase || !userId) return;
    setError(""); setNotice("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPG, PNG, or WebP image."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Profile pictures must be 5 MB or smaller."); return; }
    setUploading(true);
    try {
      const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("profile-images").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("profile-images").getPublicUrl(path);
      setProfile((current) => ({ ...current, avatarUrl: data.publicUrl }));
      setPendingImagePath(path);
      setNotice("Photo uploaded. Save your profile to apply it.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload profile photo.");
    } finally { setUploading(false); }
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || saving) return;
    if (!profile.fullName.trim()) { setError("Enter your full name."); return; }
    if (!/^\S+@\S+\.\S+$/.test(profile.email.trim())) { setError("Enter a valid email address."); return; }
    setSaving(true); setError(""); setNotice("");
    const emailChanged = profile.email.trim().toLowerCase() !== savedProfile.email.toLowerCase();
    const { error: saveError } = await supabase.auth.updateUser({
      ...(emailChanged ? { email: profile.email.trim() } : {}),
      data: { full_name: profile.fullName.trim(), phone: profile.phone.trim(), department: profile.department.trim(), bio: profile.bio.trim(), avatar_url: profile.avatarUrl },
    });
    if (saveError) {
      if (pendingImagePath) await supabase.storage.from("profile-images").remove([pendingImagePath]);
      setError(saveError.message);
    } else {
      setSavedProfile(profile);
      setPendingImagePath("");
      setNotice(emailChanged ? "Profile saved. Confirm the email change using the message sent by Supabase." : "Profile updated successfully.");
    }
    setSaving(false);
  };

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || saving) return;
    if (passwords.next.length < 8) { setError("Use a password with at least 8 characters."); return; }
    if (passwords.next !== passwords.confirm) { setError("The new passwords do not match."); return; }
    setSaving(true); setError(""); setNotice("");
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email: savedProfile.email, password: passwords.current });
    if (reauthError) { setError("Current password could not be verified."); setSaving(false); return; }
    const { error: updateError } = await supabase.auth.updateUser({ password: passwords.next });
    if (updateError) setError(updateError.message);
    else { setPasswords({ current: "", next: "", confirm: "" }); setNotice("Password changed successfully."); }
    setSaving(false);
  };

  const initials = profile.fullName.trim().split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase() || "AD";

  return <AdminShell title="My Profile">
    <div className="ad-page-header"><div><h1>My Profile</h1><p>Manage your administrator profile and account security.</p></div></div>
    {error && <div className="ad-content-alert error" role="alert">{error}</div>}
    {notice && <div className="ad-content-alert success" role="status">{notice}</div>}
    {loading ? <div className="ad-card ad-profile-loading" role="status"><LoaderCircle className="ad-spin" size={20}/> Loading your profile…</div> : <div className="ad-profile-page">
      <section className="ad-card ad-profile-card">
        <div className="ad-card-header"><span className="ad-card-title"><UserRound size={17}/> Personal Information</span><span className="ad-badge ad-badge-blue">{role}</span></div>
        <div className="ad-card-body">
          <form onSubmit={(event) => void save(event)}>
            <div className="ad-profile-photo-row"><div className="ad-profile-photo">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="Profile"/> : <span>{initials}</span>}</div><div><strong>Profile Picture</strong><p>JPG, PNG, or WebP up to 5 MB.</p><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { void uploadPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}/><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={uploading} onClick={() => fileInput.current?.click()}><Camera size={15}/>{uploading ? "Uploading…" : "Upload Profile Picture"}</button></div></div>
            <div className="ad-form-grid"><Field label="Full Name"><input className="ad-input" value={profile.fullName} onChange={(event) => updateProfile("fullName", event.target.value)} required/></Field><Field label="Email Address"><input className="ad-input" type="email" value={profile.email} onChange={(event) => updateProfile("email", event.target.value)} required/><small className="ad-profile-help">{emailVerified ? "Verified email" : "Email verification pending"}</small></Field><Field label="Phone Number"><input className="ad-input" type="tel" value={profile.phone} onChange={(event) => updateProfile("phone", event.target.value)} placeholder="Add phone number"/></Field><Field label="Department"><input className="ad-input" value={profile.department} onChange={(event) => updateProfile("department", event.target.value)} placeholder="Add department"/></Field><Field label="Role"><input className="ad-input" value={role} readOnly/></Field><Field label="Date Joined"><input className="ad-input" value={joined} readOnly/></Field></div>
            <Field label="Bio"><textarea className="ad-textarea" rows={4} maxLength={500} value={profile.bio} onChange={(event) => updateProfile("bio", event.target.value)} placeholder="Add a short professional bio"/></Field>
            <div className="ad-profile-form-actions"><button className="ad-btn ad-btn-primary" disabled={saving || uploading}><Save size={15}/>{saving ? "Saving…" : "Save Profile"}</button></div>
          </form>
        </div>
      </section>
      <section className="ad-card" id="security">
        <div className="ad-card-header"><span className="ad-card-title"><KeyRound size={17}/> Account Security</span><span className={`ad-badge ${emailVerified ? "ad-badge-green" : "ad-badge-yellow"}`}>{emailVerified ? "Email verified" : "Verification pending"}</span></div>
        <div className="ad-card-body"><form onSubmit={(event) => void changePassword(event)}><div className="ad-form-grid"><Field label="Current Password"><input className="ad-input" type="password" autoComplete="current-password" value={passwords.current} onChange={(event) => setPasswords((current) => ({ ...current, current: event.target.value }))} required/></Field><Field label="New Password"><input className="ad-input" type="password" autoComplete="new-password" minLength={8} value={passwords.next} onChange={(event) => setPasswords((current) => ({ ...current, next: event.target.value }))} required/></Field><Field label="Confirm New Password"><input className="ad-input" type="password" autoComplete="new-password" minLength={8} value={passwords.confirm} onChange={(event) => setPasswords((current) => ({ ...current, confirm: event.target.value }))} required/></Field></div><div className="ad-profile-form-actions"><button className="ad-btn ad-btn-primary" disabled={saving}><ShieldCheck size={15}/>{saving ? "Updating…" : "Change Password"}</button></div></form></div>
      </section>
      <section className="ad-card" id="permissions"><div className="ad-card-header"><span className="ad-card-title"><ShieldCheck size={17}/> Administrator Profile</span></div><div className="ad-card-body"><div className="ad-profile-role-summary"><span className="ad-profile-role-icon"><ShieldCheck size={22}/></span><div><strong>{role}</strong><p>Your access is controlled by the role assigned to your account in the verified database profile.</p></div></div><p className="ad-profile-help">Role and permissions are read-only here. Contact a system administrator if they need to change.</p></div></section>
    </div>}
  </AdminShell>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="ad-form-row"><span className="ad-label">{label}</span>{children}</label>; }

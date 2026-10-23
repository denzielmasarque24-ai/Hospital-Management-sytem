import { supabase } from "@/lib/supabase/client";

export type Doctor = {
  id: string;
  display_name: string;
  specialty: string;
  license_number: string | null;
  email: string | null;
  phone: string | null;
  bio: string | null;
  experience_years: number | null;
  available: boolean | null;
  image_url: string | null;
  avatar_url: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};
export type DoctorInput = Omit<Doctor, "id" | "is_demo" | "created_at" | "updated_at">;
export const DOCTOR_COLUMNS = "id,display_name,specialty,license_number,email,phone,bio,experience_years,available,image_url,avatar_url,is_demo,created_at,updated_at";
function db() { if (!supabase) throw new Error("Supabase is not configured."); return supabase; }
function requestError(result: {error: {message: string; code?: string; details?: string | null; hint?: string | null} | null; status?: number}, action: string): never {
  const source = result.error;
  const error = Object.assign(new Error(source?.message || action + " failed."), {
    code: source?.code,
    status: result.status,
    details: source?.details ?? null,
    hint: source?.hint ?? null,
  });
  console.error("Supabase request failed", {
    action,
    code: source?.code,
    message: source?.message,
    details: source?.details ?? null,
    hint: source?.hint ?? null,
    status: result.status,
  });
  throw error;
}
export async function listDoctors(): Promise<Doctor[]> {
  const doctors: Doctor[] = [];
  for (let offset = 0; ; offset += 50) {
    const result = await db().from("doctors").select(DOCTOR_COLUMNS).order("display_name").order("id").range(offset, offset + 49);
    if (result.error) requestError(result, "Load doctors");
    doctors.push(...(result.data ?? []) as Doctor[]);
    if (!result.data || result.data.length < 50) return doctors;
  }
}
async function requireAdmin() {
  const client = db();
  const {data, error} = await client.auth.getUser();
  if (error || !data.user) throw new Error("Sign in as an administrator to manage doctors.");
  const profile = await client.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (profile.error) requestError(profile, "Verify administrator role");
  if (!["ADMIN", "SUPER_ADMIN"].includes(String(profile.data?.role ?? "").trim().toUpperCase())) throw new Error("Administrator permission is required to manage doctors.");
  return client;
}
export async function saveDoctor(values: DoctorInput, id?: string) {
  const client = await requireAdmin();
  if (!values.display_name.trim() || !values.specialty.trim()) throw new Error("Enter the doctor's name and specialty.");
  if (values.experience_years !== null && (!Number.isSafeInteger(values.experience_years) || values.experience_years < 0)) throw new Error("Experience must be a non-negative whole number of years, or left blank.");
  const optional = (value: string | null) => value?.trim() || null;
  // Explicit allowlist: never send joined data, profile IDs, demo flags, or legacy columns.
  const payload = {display_name: values.display_name.trim(), specialty: values.specialty.trim(), license_number: optional(values.license_number), email: optional(values.email), phone: optional(values.phone), bio: optional(values.bio), experience_years: values.experience_years, available: values.available, image_url: values.image_url, avatar_url: values.avatar_url};
  if (id) {
    const result = await client.from("doctors").update(payload).eq("id", id).select(DOCTOR_COLUMNS).maybeSingle();
    if (result.error) requestError(result, "Update doctor");
    if (!result.data) {
      throw Object.assign(
        new Error("Record not found. The doctor may have been removed, or the update is not permitted by the current database access rules."),
        { code: "RECORD_NOT_FOUND" },
      );
    }
    return result.data as Doctor;
  }
  const result = await client.from("doctors").insert(payload).select(DOCTOR_COLUMNS).single();
  if (result.error) requestError(result, "Add doctor");
  return result.data as Doctor;
}
export async function deleteDoctor(id: string) {
  if (!id) throw new Error("A doctor record ID is required.");
  const client = await requireAdmin();
  const result = await client.from("doctors").delete().eq("id", id).select("id").maybeSingle();
  if (result.error) requestError(result, "Delete doctor");
  if (!result.data) throw Object.assign(new Error("Record not found. The doctor may have already been removed or is not visible to this administrator."), { code: "RECORD_NOT_FOUND" });
}

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export function validateDoctorPhoto(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!TYPES[file.type] && !(file.type === "" && ["jpg", "jpeg", "png", "webp"].includes(ext ?? ""))) return "Choose a JPG, JPEG, PNG, or WebP profile photo.";
  if (file.size > 5 * 1024 * 1024) return "Photo must be 5 MB or smaller.";
  return null;
}
export async function uploadDoctorPhoto(file: File) {
  const validation = validateDoctorPhoto(file);
  if (validation) throw new Error(validation);
  const client = await requireAdmin();
  const extension = TYPES[file.type] ?? (file.name.split(".").pop()?.toLowerCase() === "jpeg" ? "jpg" : file.name.split(".").pop()?.toLowerCase());
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from("doctor-photos").upload(path, file, { cacheControl: "3600", contentType: file.type || `image/${extension}`, upsert: false });
  if (error) {
    const lower = error.message.toLowerCase();
    if (lower.includes("bucket not found")) throw new Error("The doctor-photos Storage bucket is missing. Run supabase/setup/doctor_photos_storage.sql.");
    if (lower.includes("row-level security") || lower.includes("permission denied") || lower.includes("unauthorized")) throw new Error("Photo upload was denied. Apply the doctor photo Storage policies and sign in as an admin.");
    throw new Error(`Photo upload failed: ${error.message}`);
  }
  return { path, publicUrl: client.storage.from("doctor-photos").getPublicUrl(path).data.publicUrl };
}
export async function removeDoctorPhoto(path: string) {
  if (!supabase) return;
  const { error } = await supabase.storage.from("doctor-photos").remove([path]);
  if (error) throw new Error(`Photo cleanup failed: ${error.message}`);
}

import { supabase } from "@/lib/supabase/client";

export type Doctor = {
  id: string;
  first_name: string;
  last_name: string;
  specialization: string;
  license_number: string;
  email: string;
  phone: string;
  address: string;
  availability_schedule: string;
  experience: string;
  status: "active" | "inactive";
  photo_url: string | null;
  created_at: string;
  updated_at: string;
};
export type DoctorInput = Omit<Doctor, "id" | "created_at" | "updated_at">;

function db() { if (!supabase) throw new Error("Supabase is not configured."); return supabase; }
export async function listDoctors() {
  const { data, error } = await db().from("doctors").select("*").order("last_name").order("first_name");
  if (error) throw error;
  return (data ?? []) as Doctor[];
}
export async function saveDoctor(values: DoctorInput, id?: string) {
  const result = id
    ? await db().from("doctors").update(values).eq("id", id).select("*").single()
    : await db().from("doctors").insert(values).select("*").single();
  if (result.error) throw result.error;
  return result.data as Doctor;
}
export async function deleteDoctor(id: string) {
  const { error } = await db().from("doctors").delete().eq("id", id);
  if (error) throw error;
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
  const client = db();
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

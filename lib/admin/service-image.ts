import { supabase } from "@/lib/supabase/client";

const BUCKET = "service-images";
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function validateServiceImage(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!TYPES[file.type] && !(file.type === "" && ["jpg", "jpeg", "png", "webp"].includes(extension ?? ""))) return "Choose a JPG, JPEG, PNG, or WebP image.";
  if (file.size > MAX_BYTES) return "Image must be 5 MB or smaller.";
  return null;
}

export async function uploadServiceImage(file: File) {
  const validation = validateServiceImage(file);
  if (validation) throw new Error(validation);
  if (!supabase) throw new Error("Supabase is not configured, so the service image cannot be uploaded.");
  const extension = TYPES[file.type] ?? (file.name.split(".").pop()?.toLowerCase() === "jpeg" ? "jpg" : file.name.split(".").pop()?.toLowerCase());
  const path = `${crypto.randomUUID()}.${extension}`;
  const contentType = file.type || (extension === "jpg" ? "image/jpeg" : `image/${extension}`);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: "3600", contentType, upsert: false });
  if (error) {
    const reason = error.message.toLowerCase();
    if (reason.includes("bucket not found")) throw new Error("The service-images bucket is missing. Run supabase/setup/service_images_storage.sql.");
    if (reason.includes("row-level security") || reason.includes("permission denied") || reason.includes("unauthorized")) throw new Error("Image upload was denied. Apply the service image Storage policies and sign in as an admin.");
    throw new Error(`Image upload failed: ${error.message}`);
  }
  return { path, publicUrl: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

export async function removeUploadedServiceImage(path: string) {
  if (!supabase) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Uploaded image cleanup failed: ${error.message}`);
}

export function serviceImagePathFromUrl(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  try {
    const pathname = new URL(publicUrl).pathname;
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const index = pathname.indexOf(marker);
    if (index < 0) return null;
    return decodeURIComponent(pathname.slice(index + marker.length)) || null;
  } catch {
    return null;
  }
}

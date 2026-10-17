import { supabase } from "@/lib/supabase/client";

export const PRODUCT_IMAGE_BUCKET = "product-images";
export const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const EXTENSION_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

function imageExtension(file: File): string | null {
  if (IMAGE_TYPES[file.type]) return IMAGE_TYPES[file.type];
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!file.type && EXTENSION_TYPES[extension]) return extension === "jpeg" ? "jpg" : extension;
  return null;
}

export type UploadedProductImage = { path: string; publicUrl: string };

export function validateProductImage(file: File): string | null {
  if (!imageExtension(file)) return "Choose a JPG, JPEG, PNG, or WebP image.";
  if (file.size > MAX_PRODUCT_IMAGE_SIZE) return "Image must be 5 MB or smaller.";
  return null;
}

export async function uploadProductImage(file: File): Promise<UploadedProductImage> {
  const validationError = validateProductImage(file);
  if (validationError) throw new Error(validationError);
  if (!supabase) throw new Error("Supabase is not configured, so the product image cannot be uploaded.");

  const extension = imageExtension(file)!;
  const contentType = file.type || EXTENSION_TYPES[extension];
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, file, { cacheControl: "3600", contentType, upsert: false });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("bucket not found")) {
      throw new Error("Image upload failed: the product-images bucket is missing. Run supabase/setup/product_images_storage.sql.");
    }
    if (message.includes("row-level security") || message.includes("permission denied") || message.includes("unauthorized")) {
      throw new Error("Image upload was denied. Run the product image Storage setup and sign in with an authorized admin role.");
    }
    throw new Error(`Image upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export async function removeUploadedProductImage(path: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
  if (error) throw new Error(`Uploaded image cleanup failed: ${error.message}`);
}

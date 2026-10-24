import { supabase } from "@/lib/supabase/client";
import { type Product } from "@/lib/admin/mockData";

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  price: number | string;
  stock: number;
  image_url: string | null;
  prescription_required: boolean;
  available: boolean;
};

const fromRow = (row: ProductRow): Product => ({
  id: String(row.id),
  name: row.name,
  slug: row.slug,
  sku: "",
  category: row.category ?? "Uncategorized",
  price: Number(row.price),
  stock: Number(row.stock ?? 0),
  minStock: 0,
  status: row.available ? "active" : "inactive",
  description: row.description ?? "",
  available: row.available,
  prescriptionRequired: row.prescription_required,
  // Keep the stored value separate from display fallbacks so an unrelated edit
  // never writes a local fallback path back into image_url.
  image: row.image_url?.trim() || undefined,
});

export function slugifyProduct(value: string) {
  return value.trim().toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const toRow = (product: Omit<Product, "id">, slug: string) => ({
  name: product.name.trim(),
  slug,
  description: product.description.trim() || null,
  category: product.category.trim() || null,
  price: Number(product.price),
  stock: Number(product.stock),
  image_url: product.image?.trim() || null,
  prescription_required: Boolean(product.prescriptionRequired),
  available: typeof product.available === "boolean" ? product.available : product.status === "active",
});

function logProductError(error: { code?: string; message?: string; details?: string | null; hint?: string | null }, operation: string) {
  console.error("Product save failed:", {
    operation,
    code: error.code,
    message: error.message,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

async function collisionSafeSlug(requestedSlug: string, exceptId?: string) {
  const client = supabase;
  if (!client) throw new Error("Supabase is not configured. Changes are not saved to a database.");
  const base = slugifyProduct(requestedSlug) || "product";
  for (let suffix = 1; suffix <= 1000; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const { data, error } = await client.from("products").select("id").eq("slug", candidate);
    if (error) {
      logProductError(error, "Check product slug");
      throw error;
    }
    if (!(data ?? []).some((record) => record.id !== exceptId)) return candidate;
  }
  throw new Error("A unique product slug could not be generated. Enter a different slug and retry.");
}

async function writeProduct(product: Omit<Product, "id">, id?: string, originalSlug?: string) {
  const client = supabase;
  if (!client) throw new Error("Supabase is not configured. Changes are not saved to a database.");
  if (!product.name.trim()) throw new Error("Product name is required.");
  if (!Number.isFinite(Number(product.price)) || Number(product.price) < 0) throw new Error("Enter a valid non-negative price.");
  if (!Number.isSafeInteger(Number(product.stock)) || Number(product.stock) < 0) throw new Error("Enter a valid non-negative stock quantity.");
  if (typeof product.prescriptionRequired !== "boolean") throw new Error("Prescription requirement must be selected.");
  const available = typeof product.available === "boolean" ? product.available : product.status === "active";
  if (typeof available !== "boolean") throw new Error("Product availability must be selected.");

  const enteredSlug = product.slug?.trim() || slugifyProduct(product.name);
  const normalizedSlug = slugifyProduct(enteredSlug);
  if (!normalizedSlug) throw new Error("Product slug is required.");
  // Keep the existing slug unchanged unless the administrator deliberately edits it.
  const slug = id && Boolean(originalSlug) && normalizedSlug === slugifyProduct(originalSlug!) ? originalSlug! : await collisionSafeSlug(normalizedSlug, id);
  if (!slug) throw new Error("Product slug is required.");
  const row = toRow({ ...product, available }, slug);

  if (id) {
    const { data, error } = await client.from("products").update(row).eq("id", id).select("*").maybeSingle();
    if (error) {
      logProductError(error, "UPDATE");
      throw error;
    }
    if (!data) throw Object.assign(new Error("Product record not found. It may have been removed or you may not have permission to update it."), { code: "PRODUCT_NOT_FOUND" });
    return fromRow(data as ProductRow);
  }

  const { data, error } = await client.from("products").insert(row).select("*").single();
  if (error) {
    logProductError(error, "INSERT");
    throw error;
  }
  return fromRow(data as ProductRow);
}

export async function loadProducts(): Promise<{ products: Product[]; source: "database" | "sample"; error?: string }> {
  if (!supabase) return { products: [], source: "database", error: "Supabase is not configured." };
  const products: Product[] = [];
  for (let offset = 0; ; offset += 50) {
    const { data, error } = await supabase.from("products").select("*").order("name").order("id").range(offset, offset + 49);
    if (error) return { products: [], source: "database", error: error.message };
    products.push(...(data as ProductRow[]).map(fromRow));
    if (data.length < 50) break;
  }
  return { products, source: "database" };
}

export async function saveProduct(product: Omit<Product, "id">, id?: string, originalSlug?: string): Promise<Product> {
  return writeProduct(product, id, originalSlug);
}

export async function removeProduct(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured. Changes are not saved to a database.");
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

export async function adjustProductStock(product: Product, quantity: number, note: string): Promise<Product> {
  if (!supabase) throw new Error("Supabase is not configured. Changes are not saved to a database.");
  const stock = product.stock + quantity;
  if (!Number.isSafeInteger(quantity) || !Number.isSafeInteger(stock) || stock < 0) throw new Error("Enter a valid stock adjustment.");
  const { data, error } = await supabase.from("products").update({ stock }).eq("id", product.id).eq("stock", product.stock).select("*").maybeSingle();
  if (error) {
    logProductError(error, "Adjust stock");
    throw error;
  }
  if (!data) throw Object.assign(new Error("Product stock was not updated. The product may have changed; refresh the list and try again."), { code: "PRODUCT_NOT_UPDATED" });
  const { error: adjustmentError } = await supabase.from("inventory_adjustments").insert({ product_id: product.id, quantity, note });
  if (adjustmentError) {
    logProductError(adjustmentError, "Record inventory adjustment");
    throw adjustmentError;
  }
  return fromRow(data as ProductRow);
}

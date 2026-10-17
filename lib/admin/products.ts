import { supabase } from "@/lib/supabase/client";
import { SAMPLE_PRODUCTS, type Product } from "@/lib/admin/mockData";

type ProductRow = Omit<Product, "minStock" | "image" | "sku" | "status" | "stock" | "category" | "description"> & {
  sku?: string | null;
  status?: Product["status"] | null;
  category?: string | null;
  description?: string | null;
  stock?: number | null;
  stock_quantity?: number | null;
  min_stock?: number | null;
  image?: string | null;
  image_url?: string | null;
  expiry_date?: string | null;
};
const fromRow = (row: ProductRow): Product => ({
  id: String(row.id),
  name: row.name,
  slug: row.slug ?? slugify(row.name),
  sku: row.sku ?? "",
  category: row.category ?? "Uncategorized",
  price: Number(row.price),
  stock: Number(row.stock ?? row.stock_quantity ?? 0),
  minStock: Number(row.min_stock ?? 0),
  status: row.status ?? "active",
  description: row.description ?? "",
  image: row.image ?? row.image_url ?? undefined,
  expirationDate: row.expiry_date ?? undefined,
});
function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const toRow = ({ minStock, image, expirationDate, ...product }: Omit<Product, "id">) => ({ ...product, slug: product.slug?.trim() || slugify(product.name), stock_quantity: product.stock, min_stock: minStock, image_url: image || null, expiry_date: expirationDate || null });

async function writeProduct(product: Omit<Product, "id">, id?: string) {
  const client = supabase;
  if (!client) throw new Error("Supabase is not configured. Changes are not saved to a database.");
  const row = toRow(product);
  const write = (row: Record<string, unknown>) => id
    ? client.from("products").update(row).eq("id", id).select("*").single()
    : client.from("products").insert(row).select("*").single();
  const result = await write(row);
  if (result.error) throw result.error;
  return fromRow(result.data as ProductRow);
}

export async function loadProducts(): Promise<{ products: Product[]; source: "database" | "sample"; error?: string }> {
  if (!supabase) return { products: SAMPLE_PRODUCTS, source: "sample" };
  const { data, error } = await supabase.from("products").select("*").order("name");
  if (error) return { products: [], source: "database", error: error.message };
  return { products: (data as ProductRow[]).map(fromRow), source: "database" };
}

export async function saveProduct(product: Omit<Product, "id">, id?: string): Promise<Product> {
  return writeProduct(product, id);
}

export async function removeProduct(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured. Changes are not saved to a database.");
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

export async function adjustProductStock(product: Product, quantity: number, note: string): Promise<Product> {
  if (!supabase) throw new Error("Supabase is not configured. Changes are not saved to a database.");
  const stock = Math.max(0, product.stock + quantity);
  const { data, error } = await supabase.from("products").update({ stock }).eq("id", product.id).select("*").single();
  if (error) throw error;
  const { error: adjustmentError } = await supabase.from("inventory_adjustments").insert({ product_id: product.id, quantity, note });
  if (adjustmentError) throw adjustmentError;
  return fromRow(data as ProductRow);
}

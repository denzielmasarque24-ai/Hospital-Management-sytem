import { supabase } from "@/lib/supabase/client";
import { SAMPLE_ORDERS, type Order } from "@/lib/admin/mockData";

type OrderRow = { id: string; order_number: string; customer_name: string; customer_email: string; order_date: string; item_count: number; total: number; payment_status: Order["payment"]; status: Order["status"] };
const fromRow = (row: OrderRow): Order => ({ id: row.order_number, customer: row.customer_name, email: row.customer_email, date: row.order_date, items: row.item_count, total: Number(row.total), payment: row.payment_status, status: row.status });

export async function loadOrders(): Promise<{ orders: Order[]; source: "database" | "sample"; error?: string }> {
  if (!supabase) return { orders: SAMPLE_ORDERS, source: "sample" };
  const { data, error } = await supabase.from("orders").select("*").order("order_date", { ascending: false });
  if (error) return { orders: [], source: "database", error: error.message };
  return { orders: (data as OrderRow[]).map(fromRow), source: "database" };
}

export async function persistOrderStatus(order: Order, status: Order["status"]): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured. Changes are session-only.");
  const { error } = await supabase.from("orders").update({ status }).eq("order_number", order.id);
  if (error) throw error;
}

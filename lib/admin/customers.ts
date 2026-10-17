import { supabase } from "@/lib/supabase/client";
import { SAMPLE_CUSTOMERS, type Customer } from "@/lib/admin/mockData";

type CustomerRow = { id: string; name: string; email: string; phone: string; status: Customer["status"]; joined_at: string };
type OrderRow = { customer_email: string; total: number; payment_status: string };

export async function loadCustomers(): Promise<{ customers: Customer[]; source: "database" | "sample"; error?: string }> {
  if (!supabase) return { customers: SAMPLE_CUSTOMERS, source: "sample" };
  const [{ data: people, error }, { data: orders, error: orderError }] = await Promise.all([
    supabase.from("customers").select("id,name,email,phone,status,joined_at").order("joined_at", { ascending: false }),
    supabase.from("orders").select("customer_email,total,payment_status"),
  ]);
  if (error || orderError) return { customers: [], source: "database", error: (error ?? orderError)?.message };
  const allOrders = (orders ?? []) as OrderRow[];
  return {
    source: "database",
    customers: ((people ?? []) as CustomerRow[]).map((person) => {
      const customerOrders = allOrders.filter((order) => order.customer_email.toLowerCase() === person.email.toLowerCase() && order.payment_status === "paid");
      return { id: person.id, name: person.name, email: person.email, phone: person.phone, orders: allOrders.filter((order) => order.customer_email.toLowerCase() === person.email.toLowerCase()).length, spent: customerOrders.reduce((sum, order) => sum + Number(order.total), 0), status: person.status, joined: person.joined_at };
    }),
  };
}

export async function updateCustomerStatus(id: string, status: Customer["status"]): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("customers").update({ status }).eq("id", id);
  if (error) throw error;
}

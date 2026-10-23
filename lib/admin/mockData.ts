// ── SAMPLE DATA — NOT REAL BUSINESS DATA ──────────────────────
// Replace with real Supabase queries when tables are ready.

export type Product = {
  id: string;
  name: string;
  slug?: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  minStock: number;
  status: "active" | "inactive" | "draft";
  description: string;
  image?: string;
  expirationDate?: string;
  available?: boolean;
  prescriptionRequired?: boolean;
};

export type Order = {
  id: string;
  customer: string;
  email: string;
  date: string;
  items: number;
  total: number;
  payment: "paid" | "pending" | "failed";
  status: "pending" | "processing" | "shipped" | "completed" | "cancelled";
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  orders: number;
  spent: number;
  status: "active" | "inactive";
  joined: string;
};

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "inventory_manager" | "sales_staff";
  status: "active" | "inactive";
  joined: string;
};

export const SAMPLE_PRODUCTS: Product[] = [
  { id: "P001", name: "ApexRelief Plus", sku: "ARP-024", category: "Prescription Medicines", price: 24, stock: 86, minStock: 20, status: "active", description: "Targeted pain relief with long-lasting support.", image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=80" },
  { id: "P002", name: "PureVital Multivitamin", sku: "PVM-018", category: "Vitamins & Supplements", price: 18.5, stock: 142, minStock: 30, status: "active", description: "Essential vitamins to boost daily wellness.", image: "https://images.unsplash.com/photo-1550572017-edd951b55104?auto=format&fit=crop&w=800&q=80" },
  { id: "P003", name: "FlexGuard Support", sku: "FGS-039", category: "Medical Devices", price: 39, stock: 34, minStock: 10, status: "active", description: "Comfort support for mobility and recovery.", image: "https://images.unsplash.com/photo-1580281658628-67d5a1e8a194?auto=format&fit=crop&w=800&q=80" },
  { id: "P004", name: "GentleCare Hand Wash", sku: "GCH-012", category: "Personal Care", price: 12, stock: 61, minStock: 15, status: "active", description: "Skin-friendly hygiene care for everyday use.", image: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=800&q=80" },
  { id: "P005", name: "HeartCare Capsules", sku: "HCC-029", category: "Prescription Medicines", price: 29, stock: 48, minStock: 20, status: "active", description: "Comprehensive support for heart wellness.", image: "https://images.unsplash.com/photo-1577401239170-897942555fb3?auto=format&fit=crop&w=800&q=80" },
  { id: "P006", name: "Daily Balance Gummies", sku: "DBG-022", category: "Wellness Products", price: 22, stock: 73, minStock: 20, status: "active", description: "Natural wellness support for daily energy.", image: "https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?auto=format&fit=crop&w=800&q=80" },
  { id: "P007", name: "CalmCare Syrup", sku: "CCS-016", category: "Over-the-Counter", price: 16, stock: 29, minStock: 12, status: "active", description: "Trusted relief for seasonal discomfort.", image: "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?auto=format&fit=crop&w=800&q=80" },
  { id: "P008", name: "CareSense Monitor", sku: "CSM-059", category: "Medical Devices", price: 59, stock: 17, minStock: 8, status: "active", description: "Accurate monitoring for at-home health routines.", image: "https://images.unsplash.com/photo-1559757175-0eb30cd8c063?auto=format&fit=crop&w=800&q=80" },
];

export const SAMPLE_ORDERS: Order[] = [
  { id: "ORD-1001", customer: "Juan dela Cruz", email: "juan@email.com", date: "2026-10-14", items: 3, total: 45.70, payment: "paid", status: "completed" },
  { id: "ORD-1002", customer: "Maria Santos", email: "maria@email.com", date: "2026-10-15", items: 1, total: 12.99, payment: "paid", status: "shipped" },
  { id: "ORD-1003", customer: "Pedro Reyes", email: "pedro@email.com", date: "2026-10-15", items: 5, total: 88.25, payment: "pending", status: "pending" },
  { id: "ORD-1004", customer: "Ana Garcia", email: "ana@email.com", date: "2026-10-16", items: 2, total: 23.50, payment: "paid", status: "processing" },
  { id: "ORD-1005", customer: "Carlos Lopez", email: "carlos@email.com", date: "2026-10-16", items: 4, total: 67.80, payment: "failed", status: "cancelled" },
  { id: "ORD-1006", customer: "Rosa Mendoza", email: "rosa@email.com", date: "2026-10-16", items: 2, total: 31.00, payment: "paid", status: "processing" },
];

export const SAMPLE_CUSTOMERS: Customer[] = [
  { id: "C001", name: "Juan dela Cruz", email: "juan@email.com", phone: "+63 912 345 6789", orders: 8, spent: 342.50, status: "active", joined: "2025-03-12" },
  { id: "C002", name: "Maria Santos", email: "maria@email.com", phone: "+63 917 234 5678", orders: 3, spent: 89.70, status: "active", joined: "2025-06-20" },
  { id: "C003", name: "Pedro Reyes", email: "pedro@email.com", phone: "+63 918 345 6789", orders: 12, spent: 520.00, status: "active", joined: "2024-11-05" },
  { id: "C004", name: "Ana Garcia", email: "ana@email.com", phone: "+63 919 456 7890", orders: 1, spent: 23.50, status: "active", joined: "2026-10-16" },
  { id: "C005", name: "Carlos Lopez", email: "carlos@email.com", phone: "+63 920 567 8901", orders: 5, spent: 198.30, status: "inactive", joined: "2025-01-08" },
];

export const SAMPLE_STAFF: StaffMember[] = [
  { id: "S001", name: "Admin User", email: "admin@mediwell.com", role: "super_admin", status: "active", joined: "2024-01-01" },
  { id: "S002", name: "Inventory Manager", email: "inventory@mediwell.com", role: "inventory_manager", status: "active", joined: "2024-03-15" },
  { id: "S003", name: "Sales Staff", email: "sales@mediwell.com", role: "sales_staff", status: "active", joined: "2024-06-01" },
];

export const MONTHLY_SALES = [
  { month: "May", revenue: 4200 },
  { month: "Jun", revenue: 5800 },
  { month: "Jul", revenue: 4900 },
  { month: "Aug", revenue: 6700 },
  { month: "Sep", revenue: 5200 },
  { month: "Oct", revenue: 7100 },
];

export const ROLE_LABELS: Record<StaffMember["role"], string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  inventory_manager: "Inventory Manager",
  sales_staff: "Sales Staff",
};

export function stockLevel(stock: number, min: number): "high" | "medium" | "low" {
  if (stock === 0) return "low";
  if (stock < min) return "medium";
  return "high";
}

export function stockBadge(stock: number, min: number) {
  if (stock === 0) return { label: "Out of Stock", cls: "ad-badge-red" };
  if (stock < min) return { label: "Low Stock", cls: "ad-badge-yellow" };
  return { label: "In Stock", cls: "ad-badge-green" };
}

export function orderStatusBadge(status: Order["status"]) {
  const map: Record<Order["status"], string> = {
    pending: "ad-badge-yellow",
    processing: "ad-badge-blue",
    shipped: "ad-badge-purple",
    completed: "ad-badge-green",
    cancelled: "ad-badge-red",
  };
  return map[status];
}

export function paymentBadge(payment: Order["payment"]) {
  const map: Record<Order["payment"], string> = {
    paid: "ad-badge-green",
    pending: "ad-badge-yellow",
    failed: "ad-badge-red",
  };
  return map[payment];
}

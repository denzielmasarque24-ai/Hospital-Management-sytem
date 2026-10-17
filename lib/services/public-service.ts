import type { Service } from "@/lib/admin/managed-content";

export type PublicServiceDetail = Service & {
  benefits: string[];
  treatments: string[];
  related_specializations: string[];
  faqs: { question: string; answer: string }[];
};
export type PublicDoctor = {
  id: string;
  first_name: string;
  last_name: string;
  specialization: string;
  photo_url: string | null;
  availability_schedule: string | null;
  experience: string | null;
};
export type PublicContact = {
  phone: string;
  email: string;
  address: string | null;
  operating_hours: string | null;
};

function publicApiUrl(table: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) throw new Error("Supabase is not configured.");
  return { url: new URL(`${baseUrl.replace(/\/$/, "")}/rest/v1/${table}`), anonKey };
}

async function publicGet<T>(url: URL, anonKey: string): Promise<T> {
  const response = await fetch(url, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Could not load ${url.pathname.split("/").at(-1)}.`);
  return response.json() as Promise<T>;
}

export async function getPublicServiceBySlug(slug: string): Promise<PublicServiceDetail | null> {
  const { url, anonKey } = publicApiUrl("services");
  url.searchParams.set("slug", `eq.${slug}`);
  url.searchParams.set("available", "eq.true");
  url.searchParams.set("limit", "1");
  let rows: Partial<PublicServiceDetail>[] = [];
  let lastError: unknown;
  const projections = [
    "id,name,slug,short_description,description,image_url,icon,price,available,created_at,updated_at,benefits,treatments,related_specializations,faqs",
    "id,name,slug,short_description,description,image_url,icon,price,available,created_at,updated_at,benefits,treatments,related_specializations",
    "id,name,slug,short_description,description,image_url,icon,price,available,created_at,updated_at",
  ];
  for (const projection of projections) {
    url.searchParams.set("select", projection);
    try { rows = await publicGet(url, anonKey); lastError = undefined; break; }
    catch (error) { lastError = error; }
  }
  if (lastError) throw lastError;
  const row = rows[0];
  return row ? {
    ...row,
    benefits: row.benefits ?? [],
    treatments: row.treatments ?? [],
    related_specializations: row.related_specializations ?? [],
    faqs: row.faqs ?? [],
  } as PublicServiceDetail : null;
}

export async function getRelatedDoctors(serviceName: string): Promise<PublicDoctor[]> {
  const { url, anonKey } = publicApiUrl("public_doctors");
  url.searchParams.set("select", "id,first_name,last_name,specialization,photo_url,availability_schedule,experience");
  url.searchParams.set("specialization", `eq.${serviceName}`);
  url.searchParams.set("order", "last_name,first_name");
  return publicGet(url, anonKey);
}

export async function getPublicContact(): Promise<PublicContact> {
  const { url, anonKey } = publicApiUrl("public_site_contact");
  url.searchParams.set("select", "phone,email,address,operating_hours");
  url.searchParams.set("limit", "1");
  const rows = await publicGet<PublicContact[]>(url, anonKey);
  return rows[0] ?? { phone: "+1 234 567 8900", email: "info@mediwell.com", address: null, operating_hours: null };
}

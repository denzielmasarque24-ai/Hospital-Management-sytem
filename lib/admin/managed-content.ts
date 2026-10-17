import { supabase } from "@/lib/supabase/client";

export type Career = {
  id: string;
  title: string;
  department: string;
  location: string;
  employment_type: string;
  description: string;
  salary_range?: string | null;
  qualifications?: string;
  application_instructions?: string;
  is_published?: boolean;
  status?: string;
  created_at?: string;
  updated_at?: string;
};

export type Service = {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  image_url: string | null;
  icon: string | null;
  price: number;
  available: boolean;
  benefits: string[];
  treatments: string[];
  related_specializations: string[];
  faqs: { question: string; answer: string }[];
  created_at: string;
  updated_at: string;
};

export type CareerInput = Pick<Career, "title" | "department" | "location" | "employment_type" | "description">;
export type ServiceInput = Pick<Service, "name" | "slug" | "short_description" | "description" | "image_url" | "available">;

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function listCareers(publishedOnly = false) {
  const { data, error } = await client().from("careers").select("*").order("title");
  if (error) {
    console.error("Careers fetch failed:", error);
    throw error;
  }
  const rows = (data ?? []).map((record) => {
    const row = record as Record<string, unknown>;
    return {
      ...row,
      id: String(row.id ?? ""),
      title: String(row.title ?? ""),
      department: String(row.department ?? ""),
      location: String(row.location ?? ""),
      employment_type: String(row.employment_type ?? ""),
      description: String(row.description ?? ""),
      salary_range: typeof row.salary_range === "string" ? row.salary_range : null,
      qualifications: String(row.qualifications ?? ""),
      application_instructions: String(row.application_instructions ?? ""),
      is_published: typeof row.is_published === "boolean" ? row.is_published : true,
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
    } as Career;
  });
  return publishedOnly ? rows.filter((career) => career.is_published) : rows;
}

export async function saveCareer(input: CareerInput, id?: string) {
  const db = client();
  const payload = {
    title: input.title.trim(),
    department: input.department.trim(),
    location: input.location.trim(),
    employment_type: input.employment_type.trim(),
    description: input.description.trim(),
  };
  const result = id
    ? await db.from("careers").update(payload).eq("id", id).select("*").single()
    : await db.from("careers").insert({ id: createUuid(), ...payload }).select("*").single();
  if (result.error) {
    console.error("Career save failed:", result.error);
    throw result.error;
  }
  return result.data as Career;
}

function createUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export async function deleteCareer(id: string) {
  const { error } = await client().from("careers").delete().eq("id", id);
  if (error) throw error;
}

export async function listServices(publishedOnly = false) {
  const { data, error } = await client().from("services").select("*").order("name");
  if (error) {
    console.error("Services fetch failed:", error);
    throw error;
  }
  const services = (data ?? []).map((record) => {
    const row = record as Record<string, unknown>;
    return {
      ...row,
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      slug: String(row.slug ?? ""),
      description: String(row.description ?? ""),
      short_description: String(row.short_description ?? row.description ?? ""),
      image_url: typeof row.image_url === "string" ? row.image_url : null,
      icon: typeof row.icon === "string" ? row.icon : null,
      price: Number(row.price ?? 0),
      available: Boolean(row.available ?? row.is_published ?? true),
      benefits: Array.isArray(row.benefits) ? row.benefits as string[] : [],
      treatments: Array.isArray(row.treatments) ? row.treatments as string[] : [],
      related_specializations: Array.isArray(row.related_specializations) ? row.related_specializations as string[] : [],
      faqs: Array.isArray(row.faqs) ? row.faqs as { question: string; answer: string }[] : [],
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
    } as Service;
  });
  return publishedOnly ? services.filter((service) => service.available) : services;
}

export async function saveService(input: ServiceInput, id?: string) {
  const db = client();
  const saveWithStatus = (statusKey: "available" | "is_published") => {
    const payload = { ...input, [statusKey]: input.available };
    delete (payload as Partial<typeof payload>).available;
    return id
      ? db.from("services").update(payload).eq("id", id).select("*").single()
      : db.from("services").insert(payload).select("*").single();
  };
  let result = await saveWithStatus("available");
  if (result.error?.code === "42703" && /available/i.test(result.error.message)) {
    result = await saveWithStatus("is_published");
  }
  if (result.error) throw result.error;
  const row = result.data as Record<string, unknown>;
  return {
    ...row,
    available: Boolean(row.available ?? row.is_published ?? input.available),
    short_description: String(row.short_description ?? row.description ?? input.short_description),
    image_url: typeof row.image_url === "string" ? row.image_url : input.image_url,
    benefits: Array.isArray(row.benefits) ? row.benefits : [],
    treatments: Array.isArray(row.treatments) ? row.treatments : [],
    related_specializations: Array.isArray(row.related_specializations) ? row.related_specializations : [],
    faqs: Array.isArray(row.faqs) ? row.faqs : [],
  } as Service;
}

export async function deleteService(id: string) {
  const { error } = await client().from("services").delete().eq("id", id);
  if (error) throw error;
}

export function slugifyContent(value: string) {
  return value.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

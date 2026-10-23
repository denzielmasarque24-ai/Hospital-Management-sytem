import type { Service } from "@/lib/admin/managed-content";

import { getDoctorPhotoFallback } from "@/lib/doctors/public-doctor-images.mjs";

export type PublicServiceDetail = Service & {
  benefits: string[];
  treatments: string[];
  related_specializations: string[];
  faqs: { question: string; answer: string }[];
};
export type PublicDoctor = {
  id: string;
  display_name: string | null;
  specialty: string | null;
  avatar_url: string | null;
  image_url: string | null;
  bio: string | null;
  experience_years: number | string | null;
  available: boolean | string | null;
  is_demo: boolean;
  department?: string | null;
  professional_title?: string | null;
  biography?: string | null;
  experience?: string | null;
  availability_schedule?: string | null;
  sub_specialization?: string | null;
  education?: string | string[] | null;
  consultation_fee?: number | string | null;
};
export type PublicContact = {
  phone: string | null;
  email: string | null;
  address: string | null;
  operating_hours: string | null;
};

export type PublicServiceOption = { id: string; name: string; slug: string };
export type PublicRelatedService = {
  section: "clinical_departments" | "services_facilities";
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
};

function publicApiUrl(table: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) throw new Error("Supabase is not configured.");
  return { url: new URL(`${baseUrl.replace(/\/$/, "")}/rest/v1/${table}`), anonKey };
}

async function publicGet<T>(url: URL, anonKey: string, includeApiError = false): Promise<T> {
  const response = await fetch(url, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    cache: "no-store",
  });
  if (!response.ok && !includeApiError) {
    throw new Error(`Could not load ${url.pathname.split("/").at(-1)}.`);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
      hint?: unknown;
    } | null;
    const message = typeof payload?.message === "string" ? payload.message : response.statusText || "Request failed";
    const error = new Error(`Could not load ${url.pathname.split("/").at(-1)}: ${message}`);
    Object.assign(error, {
      status: response.status,
      code: typeof payload?.code === "string" ? payload.code : undefined,
      details: typeof payload?.details === "string" ? payload.details : undefined,
      hint: typeof payload?.hint === "string" ? payload.hint : undefined,
    });
    throw error;
  }
  return response.json() as Promise<T>;
}

export async function getPublicServiceBySlug(
  slug: string,
  section: "clinical_departments" | "services_facilities",
): Promise<PublicServiceDetail | null> {
  const { url, anonKey } = publicApiUrl("services");
  url.searchParams.set("slug", `eq.${slug}`);
  url.searchParams.set("section", `eq.${section}`);
  url.searchParams.set("select", "id,name,slug,short_description,description,image_url,section");
  url.searchParams.set("limit", "1");
  const rows = await publicGet<Partial<PublicServiceDetail>[]>(url, anonKey);
  const row = rows[0];
  if (!row) return null;
  const serviceSection = row.section ?? section;
  if (serviceSection !== "clinical_departments" && serviceSection !== "services_facilities") {
    throw new Error(`Service ${slug} has an unsupported or missing section value.`);
  }
  return {
    ...row,
    section: serviceSection,
    benefits: row.benefits ?? [],
    treatments: row.treatments ?? [],
    related_specializations: row.related_specializations ?? [],
    faqs: row.faqs ?? [],
  } as PublicServiceDetail;
}

export async function getRelatedDoctors(serviceName: string): Promise<PublicDoctor[]> {
  const { url, anonKey } = publicApiUrl("doctors");
  url.searchParams.set("select", "id,display_name,specialty,avatar_url,image_url,bio,experience_years,available,is_demo");
  url.searchParams.set("specialty", `eq.${serviceName}`);
  url.searchParams.set("is_demo", "eq.true");
  url.searchParams.set("order", "display_name");
  return publicGet(url, anonKey);
}

export async function getPublicDoctors(): Promise<PublicDoctor[]> {
  const { url, anonKey } = publicApiUrl("doctors");
  // Explicit public projection: private contact and license fields are never requested.
  // Existing Supabase grants and RLS decide which profiles are public.
  // Read classifications directly from the saved doctor record.
  url.searchParams.set("select", "id,display_name,department,specialty,sub_specialization,avatar_url,image_url,bio,experience_years,available,is_demo,education,consultation_fee");
  url.searchParams.set("order", "display_name,id");
  url.searchParams.set("limit", "50");
  const doctors: PublicDoctor[] = [];
  for (let offset = 0; ; offset += 50) {
    url.searchParams.set("offset", String(offset));
    const rows = await publicGet<PublicDoctor[]>(url, anonKey, true);
    doctors.push(...rows.map((doctor) => ({
      ...doctor,
      image_url: doctor.image_url || getDoctorPhotoFallback(doctor.display_name),
      id: String(doctor.id),
      department: doctor.department ?? null,
      sub_specialization: doctor.sub_specialization ?? null,
      professional_title: null,
      biography: doctor.bio,
      experience: doctor.experience_years == null ? null : String(doctor.experience_years) + " years experience",
      availability_schedule: null,
    })));
    if (rows.length < 50) break;
  }
  return doctors;
}

export async function getPublicDoctorById(id: string): Promise<PublicDoctor | null> {
  const doctors = await getPublicDoctors();
  return doctors.find((doctor) => doctor.id === id) ?? null;
}

export async function getPublicServices(): Promise<PublicServiceOption[]> {
  const { url, anonKey } = publicApiUrl("services");
  url.searchParams.set("select", "id,name,slug");
  url.searchParams.set("available", "eq.true");
  url.searchParams.set("order", "name");
  return publicGet(url, anonKey);
}

export async function getRelatedPublicServices(
  excludeSlug: string,
  section: "clinical_departments" | "services_facilities",
  limit = 4,
): Promise<PublicRelatedService[]> {
  const { url, anonKey } = publicApiUrl("services");
  url.searchParams.set("select", "name,slug,short_description,description,image_url,section");
  url.searchParams.set("section", `eq.${section}`);
  url.searchParams.set("slug", `neq.${excludeSlug}`);
  url.searchParams.set("order", "name");
  url.searchParams.set("limit", String(limit));
  return publicGet(url, anonKey);
}

export async function getPublicContact(): Promise<PublicContact | null> {
  const { url, anonKey } = publicApiUrl("public_site_contact");
  url.searchParams.set("select", "phone,email,address,operating_hours");
  url.searchParams.set("limit", "1");
  const rows = await publicGet<PublicContact[]>(url, anonKey);
  return rows[0] ?? null;
}

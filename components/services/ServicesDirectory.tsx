"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, Stethoscope } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { ServiceImage } from "@/components/services/ServiceImage";
import { filterServicesBySection } from "@/lib/services/service-section-filter.mjs";

type DirectoryService = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  image_url: string | null;
  section: "clinical_departments" | "services_facilities";
};

// Keep the established clinical department sequence while membership comes from public.services.section.
const departmentOrder = new Map([
  "specialist-consultation", "preventive-healthcare", "diagnostics", "general-medicine",
  "emergency-care", "pediatrics", "pathology-lab", "neurology", "pharmacy", "cardiology",
].map((slug, index) => [slug, index]));


export function ServicesDirectory({ section }: { section: DirectoryService["section"] }) {
  const [services, setServices] = useState<DirectoryService[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedSection, setLoadedSection] = useState<DirectoryService["section"] | null>(null);

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setError("Supabase is not configured. Services could not be loaded.");
      setLoadedSection(section);
      setLoading(false);
      return () => { active = false; };
    }
    const db = supabase;

    const loadServices = async (initial = false) => {
      if (initial && active) setLoading(true);
      try {
        const serviceQuery = db
          .from("services")
          .select("id,name,slug,description,short_description,image_url,section")
          .eq("section", section)
          .order("name");
        const { data, error: queryError } = await serviceQuery;
        if (!active) return;
        if (queryError) {
          console.error("Public services query failed:", {
            code: queryError.code,
            message: queryError.message,
            details: queryError.details,
            hint: queryError.hint,
          });
          setError(`Services could not be loaded: ${queryError.message}`);
          setLoadedSection(section);
        } else {
          // The database predicate is authoritative; reject unexpected rows
          // before storing them so stale or misrouted data cannot cross sections.
          setServices(filterServicesBySection((data ?? []) as DirectoryService[], section) as DirectoryService[]);
          setError("");
          setLoadedSection(section);
        }
      } catch (reason) {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : "Unknown request error.";
        console.error("Public services request failed:", message);
        setError(`Services could not be loaded: ${message}`);
        setLoadedSection(section);
      } finally {
        if (active && initial) setLoading(false);
      }
    };

    void loadServices(true);
    const channel = db
      .channel(`public-services-directory-${section}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "services" }, () => {
        void loadServices();
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Public services Realtime subscription unavailable:", status);
        }
      });
    const refreshWhenFocused = () => { void loadServices(); };
    window.addEventListener("focus", refreshWhenFocused);

    return () => {
      active = false;
      window.removeEventListener("focus", refreshWhenFocused);
      void db.removeChannel(channel);
    };
  }, [section]);

  const scopedServices = useMemo(() => {
    if (loadedSection !== section) return [];
    if (section === "clinical_departments") return [...services].sort((a, b) => {
      const aOrder = departmentOrder.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = departmentOrder.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder || a.name.localeCompare(b.name);
    });
    return services;
  }, [loadedSection, section, services]);

  const filteredServices = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return scopedServices;
    return scopedServices.filter((service) => service.name.toLowerCase().includes(normalized));
  }, [query, scopedServices]);

  return <>
    <div className={`services-directory-controls${section === "services_facilities" ? " services-facilities-controls" : ""}`}>
      <label className="services-directory-search">
        <Search size={19} aria-hidden="true" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={section === "clinical_departments" ? "Search Clinical Departments" : "Search Services"} aria-label={section === "clinical_departments" ? "Search clinical departments" : "Search services"} />
      </label>
    </div>

    {loading || loadedSection !== section ? <p className="services-directory-state" role="status">Loading services…</p>
      : error ? <p className="services-directory-state services-directory-error" role="alert">{error}</p>
        : filteredServices.length ? <div className={`services-directory-grid${section === "services_facilities" ? " services-facilities-grid" : ""}`}>
          {filteredServices.map((service) => <article className={`services-directory-card${section === "services_facilities" ? " services-facilities-card" : ""}`} key={service.id}>
            <div className="services-directory-image">
              <ServiceImage src={service.image_url} alt={service.name} loading="lazy" />
            </div>
            <div className="services-directory-card-body">
              <h2>{section === "services_facilities" ? <Stethoscope size={17} aria-hidden="true" /> : <span className="clinical-department-card-icon"><Stethoscope size={16} aria-hidden="true" /></span>}{service.name}</h2>
              <p>{service.short_description || service.description || "Service information is available on the details page."}</p>
              <Link className="services-directory-details" href={`/services/${encodeURIComponent(service.slug)}?section=${service.section}`}>
                View Details <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </article>)}
        </div> : <div className="services-directory-state" role="status">
          <Stethoscope size={25} aria-hidden="true" />
          <span>{scopedServices.length ? "No listings match your search. Try another term." : section === "clinical_departments" ? "No Clinical Departments are currently listed." : "No Services & Facilities listings are currently listed."}</span>
        </div>}
  </>;
}

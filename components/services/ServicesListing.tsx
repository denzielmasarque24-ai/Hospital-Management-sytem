"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

type PublicService = {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  available: boolean;
};

export function ServicesListing() {
  const [services, setServices] = useState<PublicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    if (!supabase) {
      setError(true);
      setLoading(false);
      return () => { active = false; };
    }
    void (async () => {
      try {
        const { data, error: queryError } = await supabase.from("services")
          .select("id,name,slug,short_description,description,image_url,available")
          .eq("available", true)
          .order("name");
        if (!active) return;
        if (queryError) setError(true);
        else setServices((data ?? []) as PublicService[]);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) return <p className="public-content-state" role="status">Loading services...</p>;
  if (error) return <p className="public-content-state" role="alert">Services could not be loaded right now. Please try again later.</p>;
  if (!services.length) return <p className="public-content-state">Our service listings are being updated. Please check back soon.</p>;

  return <div className="service-grid">{services.map((service) => <Link key={service.id} href={`/services/${encodeURIComponent(service.slug)}`} className="service-card" aria-label={`Learn more about ${service.name}`}>
    <div className="service-image"><div className="service-image-placeholder" aria-label={service.image_url ? undefined : "No service image"}><Stethoscope size={42} strokeWidth={1.6} aria-hidden="true" /></div><img src={service.image_url || "/images/services/medical-placeholder.svg"} alt={service.name} onError={(event) => { event.currentTarget.style.display = "none"; }} /></div>
    <div className="service-body"><h3>{service.name}</h3><p>{service.short_description || service.description || "Learn more about this healthcare service."}</p><span className="arrow-button" aria-hidden="true">→</span></div>
  </Link>)}</div>;
}

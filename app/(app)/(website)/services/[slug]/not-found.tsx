import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function ServiceNotFound() {
  return <section className="service-not-found"><div className="service-not-found-card"><span><SearchX size={30} /></span><p className="service-detail-eyebrow">Service unavailable</p><h1>We couldn’t find that service</h1><p>The service may have been removed or is not currently available. Browse our current healthcare services instead.</p><div><Link href="/services" className="btn-primary"><ArrowLeft size={17} /> Browse services</Link><Link href="/contact" className="btn-outline">Contact us</Link></div></div></section>;
}

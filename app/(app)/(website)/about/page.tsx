import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  HeartHandshake,
  HeartPulse,
  Lightbulb,
  MessageCircleHeart,
  ShieldCheck,
  Stethoscope,
  Target,
  UsersRound,
  UserRound,
} from "lucide-react";
import { draftLeadershipProfiles, isPublishedLeader, leadershipProfiles } from "@/lib/about/leadership";
import "./about.css";

export const metadata: Metadata = {
  title: "About MedWell Medical Hospital",
  description: "Learn about MedWell Medical Hospital, our values, patient information, and configured care services.",
};

const values = [
  { title: "Patient First", text: "Every treatment plan is designed around the needs, comfort, and long-term wellbeing of each patient.", icon: UsersRound, tone: "blue" },
  { title: "Integrity", text: "We uphold ethical medical practices, transparency, and the highest standards of accountability.", icon: ShieldCheck, tone: "teal" },
  { title: "Compassion", text: "Our team delivers care with empathy, respect, and a deep understanding of each patient journey.", icon: HeartHandshake, tone: "blue" },
  { title: "Innovation", text: "We invest in modern care pathways, safe medicines, and clinical technologies that improve outcomes.", icon: Lightbulb, tone: "teal" },
];

const aboutHighlights = [
  { title: "Dedicated Professionals", text: "Browse doctor profiles published by MedWell Medical Hospital.", icon: UsersRound, tone: "blue" },
  { title: "Patient Care Services", text: "Explore current hospital service listings and patient information.", icon: HeartPulse, tone: "teal" },
  { title: "Modern Facilities", text: "Contact the hospital for current facility and accessibility details.", icon: Building2, tone: "blue" },
  { title: "Quality Care", text: "Review published care information and contact the hospital for details.", icon: BadgeCheck, tone: "teal" },
];

const chooseReasons = [
  "Hospital services are listed in the configured service directory",
  "Doctor profiles are shown when published by an administrator",
  "Appointments are requests and require hospital confirmation",
  "Contact the hospital for facility, safety, and accessibility information",
];

const facilities = [
  "Facility and accessibility details: please contact the hospital.",
  "Imaging and diagnostic availability is listed under configured services.",
  "Patient support information: please contact the hospital.",
  "Emergency contact and operating hours: please contact the hospital.",
];

export default function AboutPage() {
  const publishedLeaders = leadershipProfiles.filter(isPublishedLeader);
  const isDraftPreview = process.env.NODE_ENV === "development";
  const displayedLeaders = isDraftPreview
    ? [...publishedLeaders, ...draftLeadershipProfiles.filter((draft) => !publishedLeaders.some((leader) => leader.id === draft.id))]
    : publishedLeaders;
  return (
    <div className="about-page">
      <section className="about-hero">
        <div className="container about-hero-inner">
          <div className="about-hero-copy">
            <span className="about-eyebrow"><span /> ABOUT US</span>
            <h1><span>MEDWELL</span><span>MEDICAL HOSPITAL</span></h1>
            <p className="about-hero-tagline">Care that starts with <span>you.</span></p>
            <p>MedWell Medical Hospital is dedicated to providing compassionate, safe, and patient-centered healthcare. Our hospital brings together medical professionals, modern facilities, and essential healthcare services to support the health and well-being of every patient and family we serve.</p>
          </div>
        </div>
      </section>

      <section className="about-highlights-section" aria-label="Hospital information">
        <div className="container about-highlights-grid">
          {aboutHighlights.map(({ title, text, icon: Icon, tone }) => (
            <article className="about-highlight-card" key={title}>
              <span className={`about-highlight-icon ${tone}`}><Icon size={22} strokeWidth={1.8} /></span>
              <div><h2>{title}</h2><p>{text}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="about-purpose-section container" aria-label="Our purpose">
        <div className="about-purpose-card mission-card">
          <div className="about-card-icon mission-icon"><HeartPulse size={22} /></div>
          <span className="about-card-kicker">OUR MISSION</span>
          <h2>Care with clarity and purpose.</h2>
          <p>To support accessible, patient-centered care through clear information and coordinated healthcare services.</p>
        </div>
        <div className="about-purpose-card vision-card">
          <div className="about-card-icon vision-icon"><Target size={22} /></div>
          <span className="about-card-kicker">OUR VISION</span>
          <h2>Empowering informed choices.</h2>
          <p>To help patients and families make informed decisions about their care and wellbeing.</p>
        </div>
      </section>

      <section className="about-values-section">
        <div className="container">
          <header className="about-section-heading">
            <span className="about-eyebrow"><span /> OUR VALUES</span>
            <h2>Our values, in every interaction.</h2>
            <p>The principles that guide how we support patients, families, and one another.</p>
          </header>
          <div className="about-values-grid">
            {values.map(({ title, text, icon: Icon, tone }, index) => (
              <article className="about-value-card" key={title}>
                <span className={`about-value-icon ${tone}`}><Icon size={23} strokeWidth={1.8} /></span>
                <span className="about-value-number">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="about-leadership-section" aria-labelledby="about-leadership-title">
        <div className="container">
          <header className="about-section-heading">
            <span className="about-eyebrow"><span /> OUR MEDICAL LEADERSHIP</span>
            <h2 id="about-leadership-title">Our Hospital Owners &amp; Leadership</h2>
            <p>{isDraftPreview ? "Local design preview: the following leadership assignments are samples awaiting hospital confirmation." : publishedLeaders.length ? "Meet the doctors who lead MedWell Medical Hospital with a shared vision for quality, compassionate, and patient-centered care." : "Leadership profiles will be shared here after verification by the hospital administration."}</p>
          </header>
          <div className="about-leadership-grid">
            {displayedLeaders.map((leader) => <article className="about-leadership-card" key={leader.id}>
              <div className="about-leadership-portrait">{leader.image ? <img src={leader.image} alt={isPublishedLeader(leader) ? leader.name : `Illustrative portrait for the sample profile of ${leader.name}`} loading="lazy" /> : <UserRound size={44} strokeWidth={1.3} aria-label="Portrait not available" />}</div>
              <div className="about-leadership-content">
                {!isPublishedLeader(leader) && <span className="about-leadership-status about-leadership-sample">Sample Profile &mdash; Pending Confirmation</span>}
                <h3>{leader.name}</h3>
                <span className="about-leadership-role">{leader.role}</span>
                <span className="about-leadership-owner-title">{leader.ownerTitle}</span>
                <span className="about-leadership-divider" aria-hidden="true" />
                <ul><li><Stethoscope size={14} aria-hidden="true" />{leader.specialty}</li><li><Building2 size={14} aria-hidden="true" />{leader.department}</li></ul>
                <p>{leader.description}</p>
              </div>
            </article>)}
            {Array.from({ length: Math.max(0, 3 - displayedLeaders.length) }, (_, index) => <article className="about-leadership-card about-leadership-pending" key={`pending-${index}`}>
              <div className="about-leadership-portrait" aria-hidden="true"><UserRound size={44} strokeWidth={1.3} /></div>
              <div className="about-leadership-content">
                <span className="about-leadership-status">PENDING VERIFICATION</span>
                <h3>Leadership profile</h3>
                <span className="about-leadership-role">Details awaiting confirmation</span>
                <span className="about-leadership-owner-title is-pending">Ownership awaiting verification</span>
                <span className="about-leadership-divider" aria-hidden="true" />
                <p>Names, leadership roles, specialties, and portraits will be published after hospital approval.</p>
              </div>
            </article>)}
          </div>
        </div>
      </section>

      <section className="about-why-section">
        <div className="container about-why-grid">
          <div className="about-why-visual">
            <img src="/images/carousel/hospital.png" alt="MedWell Medical Hospital exterior" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
            <div className="about-image-caption"><span><MessageCircleHeart size={20} /></span><div><strong>Patient-centered support</strong><small>Information for every step</small></div></div>
          </div>
          <div className="about-why-copy">
            <span className="about-eyebrow"><span /> WHY CHOOSE US</span>
            <h2>Care information you can <em>count on.</em></h2>
            <p>Find current information about the hospital’s services, published care team, and patient support options.</p>
            <ul>{chooseReasons.map((reason) => <li key={reason}><span><BadgeCheck size={17} /></span>{reason}</li>)}</ul>
            <Link href="/contact" className="about-text-link">Get in touch <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <section className="about-facilities-section">
        <div className="container">
          <header className="about-section-heading facilities-heading">
            <span className="about-eyebrow"><span /> HERE TO HELP</span>
            <h2>Healthcare <em>information.</em></h2>
            <p>Explore the information currently available and contact us for details specific to your needs.</p>
          </header>
          <div className="about-facilities-grid">
            <article className="about-facility-card care-environment-card">
              <span className="about-facility-icon"><HeartHandshake size={24} /></span>
              <span className="about-card-kicker">YOUR CARE EXPERIENCE</span>
              <h3>Care Environment</h3>
              <p>Our facilities are built to support efficient diagnosis, treatment, and follow-up across every stage of care.</p>
              <Link href="/contact">Ask us about our facilities <ArrowRight size={15} /></Link>
            </article>
            <article className="about-facility-card offer-card">
              <div className="about-offer-heading"><span className="about-facility-icon"><Stethoscope size={23} /></span><div><span className="about-card-kicker">PATIENT RESOURCES</span><h3>What We Offer</h3></div></div>
              <ul>{facilities.map((item) => <li key={item}><span><BadgeCheck size={16} /></span>{item}</li>)}</ul>
            </article>
          </div>
        </div>
      </section>

      <section className="container about-cta-wrap">
        <div className="about-cta">
          <div><span className="about-cta-kicker">LET’S CONNECT</span><h2>We’re here to help you find your way.</h2><p>Our team can help with questions about patient information and current services.</p></div>
          <Link href="/contact" className="about-cta-button">Send us a message <ArrowRight size={17} /></Link>
        </div>
      </section>
    </div>
  );
}

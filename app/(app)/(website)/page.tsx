import Link from "next/link";

import { AppointmentCTA } from "@/components/appointments/AppointmentCTA";
import { ProductCatalog } from "@/components/products/ProductCatalog";
import { DoctorCarousel } from "@/components/doctors/DoctorCarousel";
import { Hero } from "@/components/home/Hero";
import { NewsCard } from "@/components/news/NewsCard";
import { SectionTitle } from "@/components/common/SectionTitle";
import { ServicesListing } from "@/components/services/ServicesListing";
import { StatCard } from "@/components/common/StatCard";

const helpItems = [
  { title: "Find a Doctor", text: "Connect with our specialist doctors.", href: "/doctors", icon: "✚" },
  { title: "Book Appointment", text: "Schedule an appointment easily.", href: "/appointment", icon: "▣" },
  { title: "Pharmacy", text: "Wide range of medicines at your fingertips.", href: "/pharmacy", icon: "◈" },
  { title: "Lab Tests", text: "Accurate & reliable diagnostic tests.", href: "/lab-tests", icon: "♧" },
  { title: "Health Packages", text: "Preventive health checkup packages.", href: "/health-packages", icon: "♡" },
];

const stats = [
  { value: "25+", label: "Years of Excellence" },
  { value: "150+", label: "Expert Doctors" },
  { value: "500+", label: "Medical Services" },
  { value: "100K+", label: "Happy Patients" },
  { value: "50+", label: "Healthcare Centers" },
];

const articles = [
  {
    category: "Health Tips",
    title: "Importance of Regular Health Checkups",
    date: "May 02, 2024",
    image: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=600&q=80",
  },
  {
    category: "Nutrition",
    title: "Boost Your Immunity Naturally",
    date: "May 01, 2024",
    image: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=600&q=80",
  },
  {
    category: "Pharma News",
    title: "Advances in Modern Medicine",
    date: "Apr 30, 2024",
    image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80",
  },
];

export default function HomePage() {
  return (
    <>
      <Hero
        eyebrow="YOUR HEALTH, OUR PRIORITY"
        title="Better Science.<br />Better <span>Health.</span>"
        description="We are committed to improving and extending lives through innovative medicines and trusted healthcare solutions."
        primaryCtaLabel="Explore Services"
        primaryCtaHref="/services"
        secondaryCtaLabel="Find a Doctor"
        secondaryCtaHref="/doctors"
        image="https://images.unsplash.com/photo-1584982751601-97dcc096659c?auto=format&fit=crop&w=1000&q=85"
        imageAlt="Doctor in clinic"
        floatingCards={[
          { title: "24/7", description: "Emergency Support" },
          { title: "Certified", description: "Quality Medicines" },
          { title: "Trusted by", description: "100K+ Happy Patients" },
        ]}
      />

      <section className="help-section">
        <div className="container">
          <SectionTitle eyebrow="How can we help" title="How Can We Help You?" centered />

          <div className="help-grid">
            {helpItems.map((item) => (
              <Link key={item.title} href={item.href} className="help-card">
                <div className="help-icon">{item.icon}</div>
                <div className="help-text">
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                  <span className="arrow">→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="services-section">
        <div className="container">
          <SectionTitle
            eyebrow="Healthcare Services"
            title="Our <span>Healthcare</span> Services"
            description="Comprehensive healthcare solutions for you and your family."
            centered
          />

          <ServicesListing />
        </div>
      </section>

      <section className="doctors-home-section">
        <div className="container">
          <SectionTitle
            eyebrow="Meet Our Doctors"
            title="Meet Our Doctors"
            description="Experienced healthcare professionals dedicated to providing compassionate and quality medical care."
            centered
          />
          <DoctorCarousel />
        </div>
      </section>

      <section className="stats-band">
        <div className="container stats-grid">
          {stats.map((stat) => (
            <StatCard key={stat.label} value={stat.value} label={stat.label} />
          ))}
        </div>
      </section>

      <section className="services-section">
        <div className="container">
          <SectionTitle
            eyebrow="Featured Products"
            title="Trusted Healthcare Products"
            description="Explore quality medicines, wellness essentials, and medical devices."
            centered
          />
          <ProductCatalog />
        </div>
      </section>

      <section className="why-section">
        <div className="container why-grid">
          <div className="why-copy">
            <SectionTitle
              eyebrow="Why choose us"
              title="Why Choose MediWell Pharma?"
              description="We combine innovation, expertise, and care to deliver the best healthcare experience."
            />

            <ul className="feature-list">
              <li>WHO-GMP Certified</li>
              <li>High Quality &amp; Safe Medicines</li>
              <li>Affordable &amp; Accessible Healthcare</li>
              <li>Experienced &amp; Caring Professionals</li>
              <li>Advanced Technology &amp; Facilities</li>
            </ul>

            <Link href="/about" className="btn-primary">
              Learn More About Us
            </Link>
          </div>

          <div className="why-visual">
            <img
              src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=900&q=80"
              alt="Healthcare facility"
            />
          </div>
        </div>
      </section>

      <section className="emergency-section">
        <div className="container emergency-card">
          <div className="emergency-copy">
            <span className="section-eyebrow light">Emergency help</span>
            <h2>Need Emergency Help?</h2>
            <p>We are available 24/7 for emergencies. Your health is our priority.</p>
            <div className="emergency-phone">+1 234 567 8900</div>
          </div>

          <div className="emergency-visual">
            <img
              src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=900&q=80"
              alt="Ambulance and emergency care"
            />
          </div>
        </div>
      </section>

      <section className="news-section">
        <div className="container">
          <div className="news-header-row">
            <SectionTitle eyebrow="Health Tips & News" title="Health Tips &amp; News" />
            <Link href="/news" className="text-link">
              View All Articles
            </Link>
          </div>

          <div className="news-grid">
            {articles.map((article) => (
              <NewsCard
                key={article.title}
                category={article.category}
                title={article.title}
                date={article.date}
                image={article.image}
                href="/news"
              />
            ))}
          </div>
        </div>
      </section>

      <AppointmentCTA />
    </>
  );
}

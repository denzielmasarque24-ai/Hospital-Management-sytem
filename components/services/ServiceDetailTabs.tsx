"use client";

import { useRef, useState } from "react";
import { Activity, BookOpen, CheckCircle2, CircleHelp, Stethoscope, UsersRound } from "lucide-react";

type ServiceFaq = { question: string; answer: string };
type ServiceDetailTabsProps = {
  overview: string;
  treatments: string[];
  benefits: string[];
  faqs: ServiceFaq[];
};

function RichDescription({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return <div className="service-rich-text">{lines.map((line, index) => {
    const isList = /^[-*]\s+/.test(line);
    const content = isList ? line.replace(/^[-*]\s+/, "") : line;
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((part, partIndex) => part.startsWith("**") && part.endsWith("**")
      ? <strong key={partIndex}>{part.slice(2, -2)}</strong>
      : part);
    return isList
      ? <p className="service-rich-bullet" key={index}><CheckCircle2 size={17} />{rendered}</p>
      : <p key={index}>{rendered}</p>;
  })}</div>;
}

export default function ServiceDetailTabs({ overview, treatments, benefits, faqs }: ServiceDetailTabsProps) {
  const availableTabs = [
    { id: "overview", label: "Overview", Icon: BookOpen },
    ...(treatments.length ? [{ id: "services", label: "Services Offered", Icon: Stethoscope }] : []),
    ...(benefits.length ? [{ id: "benefits", label: "Key Features", Icon: UsersRound }] : []),
    ...(faqs.length ? [{ id: "faqs", label: "FAQs", Icon: CircleHelp }] : []),
  ];
  const [activeTab, setActiveTab] = useState("overview");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const currentTab = availableTabs.some((tab) => tab.id === activeTab) ? activeTab : "overview";

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % availableTabs.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + availableTabs.length) % availableTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = availableTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = availableTabs[nextIndex];
    setActiveTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  }

  return <div className="service-detail-tabs">
    {availableTabs.length > 1 ? <div className="service-detail-tab-list" role="tablist" aria-label="Service information">
      {availableTabs.map(({ id, label, Icon }, index) => <button
        key={id}
        ref={(element) => { tabRefs.current[index] = element; }}
        id={`service-tab-${id}`}
        className={`service-detail-tab${currentTab === id ? " is-active" : ""}`}
        type="button"
        role="tab"
        aria-selected={currentTab === id}
        aria-controls="service-tab-panel"
        tabIndex={currentTab === id ? 0 : -1}
        onClick={() => setActiveTab(id)}
        onKeyDown={(event) => handleTabKeyDown(event, index)}
      ><Icon size={17} aria-hidden="true" /><span>{label}</span></button>) }
    </div> : null}

    <section id="service-tab-panel" className="service-detail-tab-panel" role="tabpanel" aria-labelledby={`service-tab-${currentTab}`} tabIndex={0} key={currentTab}>
      {currentTab === "overview" ? <article className="service-detail-panel">
        <div className="service-panel-heading"><span><Stethoscope size={19} /></span><div><small>CARE OVERVIEW</small><h2>About This Service</h2></div></div>
        <RichDescription text={overview} />
      </article> : null}

      {currentTab === "services" ? <article className="service-detail-panel service-offerings-panel">
        <div className="service-panel-heading"><span><Activity size={19} /></span><div><small>STORED SERVICE INFORMATION</small><h2>What We Offer</h2></div></div>
        <ul className="service-offerings-list">{treatments.map((item) => <li key={item}><CheckCircle2 size={18} /><span>{item}</span></li>)}</ul>
      </article> : null}

      {currentTab === "benefits" ? <article className="service-detail-panel">
        <div className="service-panel-heading"><span><UsersRound size={19} /></span><div><small>STORED SERVICE INFORMATION</small><h2>Who Can Benefit</h2></div></div>
        <ul className="service-benefit-grid">{benefits.map((item) => <li key={item}><CheckCircle2 size={18} /><span>{item}</span></li>)}</ul>
      </article> : null}

      {currentTab === "faqs" ? <article className="service-detail-panel">
        <div className="service-panel-heading"><span><CircleHelp size={19} /></span><div><small>HELPFUL INFORMATION</small><h2>Frequently Asked Questions</h2></div></div>
        <div className="service-faq-list">{faqs.map((faq) => <details className="service-faq-item" key={faq.question}><summary>{faq.question}<span>+</span></summary><p>{faq.answer}</p></details>)}</div>
      </article> : null}
    </section>
  </div>;
}

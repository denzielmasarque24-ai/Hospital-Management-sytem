"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, BedDouble, CalendarDays, CircleCheck, ClipboardCheck, ContactRound, FilePlus, FileText, FolderOpen, HandHeart, Headset, HeartPulse, IdCard, Info, LockKeyhole, LogOut, MessageCircle, Pill, Receipt, ShieldCheck, ShieldPlus, Stethoscope, Users, type LucideIcon } from "lucide-react";

type Card = [title: string, description: string, icon: LucideIcon];
type Guideline = { title: string; subtitle: string; icon: LucideIcon; notice: string; cards: Card[]; responsibilities?: Card[] };
const guidelines: Guideline[] = [
  { title: "Admission Procedure", subtitle: "Information to help you prepare for hospital admission.", icon: FilePlus,
    notice: "These are general guidelines. Specific requirements may vary depending on your condition and the hospital's current policies. Please contact the hospital to confirm the latest information before your admission.",
    cards: [
      ["Registration", "Proceed to the Admissions Office to register. Provide your personal details and reason for admission.", ContactRound],
      ["Required Documents", "Bring valid identification and relevant medical documents, referral letters, or insurance information when applicable.", IdCard],
      ["Information Verification", "Hospital staff will verify your information and review relevant medical history.", ClipboardCheck],
      ["Doctor's Instructions", "Your attending doctor will assess your condition and determine whether hospital admission is appropriate.", Stethoscope],
      ["Room and Bed Assignment", "Room and bed assignments depend on medical needs, availability, and applicable hospital procedures.", BedDouble],
      ["Initial Medical Assessment", "The healthcare team may perform an initial assessment, including vital signs and other necessary checks.", Activity],
      ["Admission Confirmation", "After completing the admission process, hospital staff will explain the next steps and provide relevant instructions.", CircleCheck],
    ] },
  { title: "Visitation Guidelines", subtitle: "Information for family members, companions, and hospital visitors.", icon: Users,
    notice: "Visiting arrangements may vary depending on the department and patient condition. Contact the hospital to confirm current visiting hours, access requirements, and companion arrangements before your visit.",
    cards: [
      ["Visiting Hours", "Confirm visiting times with the care team. Arrangements may vary by department, patient condition, and care needs.", CalendarDays],
      ["Visitor Registration", "Check in at the designated reception or security desk and follow staff instructions before entering care areas.", ContactRound],
      ["Identification Requirements", "Bring valid identification and ask staff whether a visitor pass or other verification is needed.", IdCard],
      ["Patient Privacy", "Respect each patient's privacy, keep conversations considerate, and ask permission before taking photographs or recordings.", LockKeyhole],
      ["Infection Prevention", "Clean your hands when entering and leaving care areas. Follow posted precautions and ask staff about protective equipment needed.", ShieldCheck],
      ["Visitor Restrictions", "Access may be limited for patient rest, treatment, or infection prevention. If you feel unwell, contact the care team before visiting.", Users],
      ["Children and Companions", "Ask the department about children and bedside companions before arriving. Supervise children and follow the care team's guidance.", HandHeart],
    ] },
  { title: "Advance Directives", subtitle: "Understanding and communicating your healthcare preferences.", icon: HeartPulse,
    notice: "Discuss your preferences with the healthcare team. Documentation and recognition of advance directives depend on applicable requirements and hospital policy; staff can explain the options available to you.",
    cards: [
      ["Understanding Advance Directives", "Advance directives communicate preferences for future healthcare, particularly if you become unable to express your wishes. Ask your care team how these may apply.", FileText],
      ["Healthcare Preferences", "Share your care goals, values, and treatment preferences with your doctor and the people you trust.", HeartPulse],
      ["Authorized Representatives", "Tell staff whom you would like involved in care discussions. Ask how a representative's identity and authority are confirmed.", Users],
      ["Informed Decision-Making", "Ask about the benefits, risks, and alternatives of proposed care so you can make decisions that reflect your preferences.", MessageCircle],
      ["Documentation", "Bring any existing documents about your healthcare wishes. Ask staff how to record or update your preferences in your care records.", ClipboardCheck],
      ["Consultation With Healthcare Staff", "Speak with your attending doctor or care team if you need help understanding or communicating your wishes.", Stethoscope],
    ] },
  { title: "Discharge Procedure", subtitle: "Guidance for preparing to leave the hospital safely.", icon: LogOut,
    notice: "Your discharge plan is tailored to your condition. Before leaving, ask the care team to explain any instructions you do not understand and confirm whom to contact with concerns.",
    cards: [
      ["Doctor's Discharge Authorization", "Your attending doctor will assess whether you are ready to leave and confirm the discharge plan with the care team.", Stethoscope],
      ["Discharge Instructions", "Review your home care instructions, activity guidance, and warning signs. Ask what to do if symptoms worsen or urgent help is needed.", ClipboardCheck],
      ["Medication Guidance", "Confirm each medicine's name, dose, timing, and duration. Ask which previous medicines to continue or stop and clarify any side effects.", Pill],
      ["Follow-Up Appointments", "Confirm any follow-up visits, tests, or referrals and ask how to arrange appointments before leaving.", CalendarDays],
      ["Final Billing Review", "Review your bill and discuss insurance processing, payment arrangements, or questions with the billing team.", Receipt],
      ["Discharge Documents", "Collect the discharge summary, prescriptions, and any other documents provided. Keep them available for follow-up care.", FileText],
      ["Patient Departure", "Coordinate transport and any assistance you need with your companion and hospital staff. Follow the team's departure instructions.", LogOut],
    ] },
  { title: "Patient Medical Records", subtitle: "Information about accessing and protecting your medical information.", icon: FolderOpen,
    notice: "Medical information is confidential. Contact the hospital through its official channels for record requests; do not post medical records or identifying information in public messages.",
    cards: [
      ["Medical Record Confidentiality", "Your medical information should be handled confidentially and accessed only by authorized people for appropriate purposes.", LockKeyhole],
      ["Requesting Medical Records", "Contact the medical records team to ask about the request process, available documents, processing times, and any applicable fees.", FolderOpen],
      ["Identification Verification", "Be prepared to verify your identity through the hospital's approved process before records can be released.", IdCard],
      ["Authorized Representatives", "If another person requests records on your behalf, ask staff what authorization and identity documents are needed.", Users],
      ["Release of Information", "Clarify which records you need and who should receive them. Staff will explain any consent or authorization required for release.", FileText],
      ["Data Privacy and Security", "Keep copies of your records secure and share them only through trusted channels. Ask the hospital how to report privacy concerns.", ShieldCheck],
    ] },
  { title: "Rights & Responsibilities", subtitle: "Understanding patient rights and responsibilities during hospital care.", icon: ShieldPlus,
    notice: "These general principles support respectful, safe care. Ask the hospital for its current patient rights and responsibilities policy and assistance with any concerns.",
    cards: [
      ["Respectful Treatment", "Receive considerate care that respects your dignity, individual needs, beliefs, and background.", HandHeart],
      ["Privacy and Confidentiality", "Expect privacy during care and confidential handling of your medical and personal information.", LockKeyhole],
      ["Information About Medical Care", "Ask for clear explanations of your condition, proposed treatment, and care plan in language you can understand.", Stethoscope],
      ["Informed Consent", "Receive an explanation of proposed procedures, benefits, risks, and alternatives, and ask questions before making a decision.", ClipboardCheck],
      ["Participation in Care Decisions", "Discuss your preferences, ask about available options, and involve a trusted person where appropriate.", HeartPulse],
      ["Feedback and Complaints", "Share feedback or concerns with hospital staff and ask how to use the hospital's formal complaints process.", MessageCircle],
    ], responsibilities: [
      ["Provide Accurate Information", "Share complete and accurate health history, medicines, allergies, and changes in your condition with the care team.", ContactRound],
      ["Follow Agreed Treatment Instructions", "Follow the care plan you agree on with your team. Tell staff if you have concerns or cannot follow an instruction.", ClipboardCheck],
      ["Respect Hospital Staff and Patients", "Treat staff, other patients, and visitors with courtesy. Respect privacy, rest, and shared spaces.", Users],
      ["Follow Hospital Safety Policies", "Follow posted safety, infection prevention, and visitor guidance. Ask staff if you need help understanding a policy.", ShieldCheck],
      ["Attend Scheduled Appointments", "Attend planned follow-up visits and tests. Notify the hospital if you need to reschedule.", CalendarDays],
      ["Fulfill Applicable Financial Obligations", "Review applicable charges, provide accurate insurance details, and discuss payment questions or difficulties with the billing team.", Receipt],
    ] },
];

function InformationCards({ cards }: { cards: Card[] }) {
  return <div className="mw-guide-cards">{cards.map(([title, description, Icon], index) => <article className="mw-guide-card" key={title}>
    <span className={`mw-guide-card-icon mw-guide-tone-${index % 4}`}><Icon size={23} aria-hidden="true" /></span><div><h3>{title}</h3><p>{description}</p></div>
  </article>)}</div>;
}

export default function PatientGuidelines() {
  const [selected, setSelected] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const guideline = guidelines[selected];
  const Icon = guideline.icon;
  function selectGuideline(index: number) {
    setSelected(index);
    if (window.matchMedia("(max-width: 760px)").matches) requestAnimationFrame(() => {
      panel.current?.focus({ preventScroll: true });
      panel.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    });
  }
  return <div className="mw-guide-layout">
    <aside className="mw-guide-sidebar">
      <nav className="mw-guide-menu" aria-label="Patient Guidelines"><h2>Patient Guidelines</h2><div className="mw-guide-menu-items">
        {guidelines.map(({ title, icon: MenuIcon }, index) => <button key={title} type="button" onClick={() => selectGuideline(index)} aria-pressed={selected === index} aria-controls="mw-guide-details" className={selected === index ? "is-active" : ""}><MenuIcon size={19} aria-hidden="true" /><span>{title}</span><ArrowRight size={15} aria-hidden="true" /></button>)}
      </div></nav>
      <section className="mw-guide-help"><span className="mw-guide-help-icon"><Headset size={27} aria-hidden="true" /></span><h2>Need current hospital information?</h2><p>Contact our team to confirm visit details and hospital-specific guidelines.</p><Link href="/contact">Contact the Hospital <ArrowRight size={16} aria-hidden="true" /></Link></section>
    </aside>
    <section className="mw-guide-panel" id="mw-guide-details" ref={panel} tabIndex={-1} aria-labelledby="mw-guide-title">
      <header className="mw-guide-panel-heading"><span className="mw-guide-section-icon"><Icon size={30} aria-hidden="true" /></span><div aria-live="polite" aria-atomic="true"><h2 id="mw-guide-title">{selected + 1}. {guideline.title}</h2><p>{guideline.subtitle}</p></div></header>
      <div className="mw-guide-notice" role="note"><Info size={20} aria-hidden="true" /><p>{guideline.notice}</p></div>
      {guideline.responsibilities && <h3 className="mw-guide-group-title">Patient Rights</h3>}
      <InformationCards cards={guideline.cards} />
      {guideline.responsibilities && <><h3 className="mw-guide-group-title mw-guide-responsibilities">Patient Responsibilities</h3><InformationCards cards={guideline.responsibilities} /></>}
    </section>
  </div>;
}

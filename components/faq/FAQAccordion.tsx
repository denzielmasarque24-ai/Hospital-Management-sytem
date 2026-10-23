"use client";

import { useState } from "react";

const faqItems = [
  {
    question: "How do I book an appointment?",
    answer:
      "Sign in and submit a request through the Book Appointment page. The request is not confirmed until the hospital contacts you.",
  },
  {
    question: "How can I find a doctor?",
    answer:
      "Visit the Find a Doctor page to browse profiles currently published by the hospital. Contact the hospital to confirm availability.",
  },
  {
    question: "How can I find medical products?",
    answer:
      "Browse items currently listed in the Medical Products & Supplies catalog. Contact the hospital to confirm availability and suitability; online ordering is not currently provided.",
  },
  {
    question: "How can I book a lab test?",
    answer:
      "Review the services listed by the hospital, then submit an appointment request. The hospital will contact you to confirm the details.",
  },
  {
    question: "What are your emergency hours?",
    answer:
      "Emergency contact details and operating hours have not yet been provided. For an immediate emergency, call your local emergency services.",
  },
  {
    question: "How can I message MedWell Medical Hospital?",
    answer:
      "Log in and use the Message page to send a private message to our care team.",
  },
];

export function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="faq-list">
      {faqItems.map((item, index) => {
        const isOpen = index === openIndex;

        return (
          <div key={item.question} className={isOpen ? "faq-item open" : "faq-item"}>
            <button type="button" className="faq-question" onClick={() => setOpenIndex(isOpen ? null : index)}>
              <span>{item.question}</span>
              <span className="faq-icon">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen ? <div className="faq-answer">{item.answer}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useState } from "react";

const faqItems = [
  {
    question: "How do I book an appointment?",
    answer:
      "You can book an appointment through the Book Appointment page, by phone, or at our front desk during business hours.",
  },
  {
    question: "How can I find a doctor?",
    answer:
      "Visit the Find a Doctor page to search by specialty, view professional profiles, and book consultations online.",
  },
  {
    question: "How can I order medicines?",
    answer:
      "Use the Pharmacy section to browse products and place a prescription or over-the-counter order through our online pharmacy services.",
  },
  {
    question: "How can I book a lab test?",
    answer:
      "Go to the Lab Tests section, select the diagnostic service you need, and choose a convenient time slot.",
  },
  {
    question: "What are your emergency hours?",
    answer:
      "Our emergency services are available 24/7, including weekends and public holidays.",
  },
  {
    question: "How can I message MediWell Hospital?",
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

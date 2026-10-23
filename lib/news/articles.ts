export type HealthArticle = {
  slug: string;
  category: string;
  title: string;
  date: string;
  image: string;
  imageAlt: string;
  summary: string;
  callout: string;
  keywords: string[];
  content: { heading: string; paragraphs: string[] }[];
};

export const healthArticles: HealthArticle[] = [
  {
    slug: "importance-of-regular-health-checkups",
    category: "Medical Research",
    title: "Importance of Regular Health Checkups",
    date: "May 02, 2024",
    image: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Doctor discussing preventive care with a patient",
    summary: "Learn how routine visits help you review your health, discuss concerns, and plan screening with a clinician.",
    callout: "Screening schedules are individual. Ask a qualified clinician which checks fit your history and needs.",
    keywords: ["screening", "prevention", "doctor", "checkup"],
    content: [{ heading: "A practical part of preventive care", paragraphs: ["Regular checkups give you and your healthcare professional time to review your health, discuss concerns, and consider age- and risk-appropriate screening. The right schedule depends on your medical history, family history, age, and individual needs.", "A visit may include reviewing medicines, vaccinations, lifestyle factors, and recommended tests. Screening is not the same for everyone, so discuss benefits, limits, and timing with a qualified clinician."] }],
  },
  {
    slug: "boost-your-immunity-naturally",
    category: "Nutrition",
    title: "Boost Your Immunity Naturally",
    date: "May 01, 2024",
    image: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=85",
    imageAlt: "A colorful selection of fresh vegetables and nutritious foods",
    summary: "Everyday habits such as balanced meals, rest, and recommended vaccination can support general health.",
    callout: "No food or supplement can guarantee protection from illness. Check with a clinician before taking supplements.",
    keywords: ["nutrition", "food", "sleep", "wellness"],
    content: [{ heading: "Support your overall health", paragraphs: ["No food or supplement can guarantee that you will avoid illness. A balanced eating pattern, adequate rest, regular activity, recommended vaccinations, and good hand hygiene support general health.", "If you have a medical condition or are considering supplements, ask a healthcare professional about safe options and possible interactions. Get medical advice for persistent or concerning symptoms."] }],
  },
  {
    slug: "advances-in-modern-medicine",
    category: "Hospital Updates",
    title: "Advances in Modern Medicine",
    date: "Apr 30, 2024",
    image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Medical equipment used in modern clinical care",
    summary: "Medical advances are most useful when evidence, clinical judgment, and each patient’s needs guide care.",
    callout: "Ask your care team about the benefits, risks, and alternatives for tests or treatments.",
    keywords: ["hospital", "technology", "medicine", "care"],
    content: [{ heading: "Evidence guides better care", paragraphs: ["Medical practice changes as researchers study ways to prevent, diagnose, and treat illness. New tools can help clinicians make decisions, but they work best alongside a careful examination and a patient’s history and preferences.", "Ask your care team how a proposed test or treatment applies to you, what its benefits and risks are, and whether established alternatives are available."] }],
  },
  {
    slug: "managing-stress-for-better-long-term-health",
    category: "Wellness",
    title: "Managing Stress for Better Long-Term Health",
    date: "Apr 28, 2024",
    image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=85",
    imageAlt: "A person taking a quiet moment outdoors",
    summary: "Realistic routines and support from others can help people respond to everyday stress.",
    callout: "If stress affects daily life or feels overwhelming, a healthcare professional can discuss support options.",
    keywords: ["stress", "mental health", "wellbeing", "support"],
    content: [{ heading: "Small steps and support can help", paragraphs: ["Stress is a common response to difficult situations. Regular sleep, movement, time with supportive people, and brief relaxation practices may help some people manage day-to-day stress.", "When stress persists, affects daily life, or feels overwhelming, a healthcare professional can help identify support options. Seek urgent help if you or someone else may be in immediate danger."] }],
  },
  {
    slug: "understanding-preventive-screening-benefits",
    category: "Medical Research",
    title: "Understanding Preventive Screening Benefits",
    date: "Apr 16, 2024",
    image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Healthcare professional reviewing diagnostic information",
    summary: "Screening can identify some conditions before symptoms, but the right tests depend on individual risk and needs.",
    callout: "Discuss the potential benefits, limits, and follow-up of screening with a clinician.",
    keywords: ["screening", "prevention", "testing", "research"],
    content: [{ heading: "Choose screening with informed guidance", paragraphs: ["Screening tests look for certain conditions before symptoms appear. Their usefulness depends on the condition, the person’s age and risk factors, and how accurate the test is.", "Screening can have benefits and limitations, including false results or follow-up procedures. Talk with a clinician about which tests are appropriate for you and when to have them."] }],
  },
  {
    slug: "healthy-daily-habits-that-truly-last",
    category: "Wellness",
    title: "Healthy Daily Habits That Truly Last",
    date: "Apr 10, 2024",
    image: "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?auto=format&fit=crop&w=900&q=85",
    imageAlt: "A peaceful morning scene suggesting a healthy daily routine",
    summary: "Small, realistic routines around sleep, movement, or meals can be easier to sustain over time.",
    callout: "Choose changes that suit your health needs and ask a professional when you need individual advice.",
    keywords: ["habits", "wellness", "sleep", "movement", "routine"],
    content: [{ heading: "Build routines that fit your life", paragraphs: ["Lasting habits are often easier to maintain when they are realistic and connected to daily routines. You might start with a short walk, a regular bedtime, or adding a nourishing food you enjoy.", "Progress does not need to be perfect. Choose changes that fit your health needs and circumstances, and ask a healthcare professional for advice if you have questions about activity, diet, or sleep."] }],
  },
  {
    slug: "understanding-hiv-awareness",
    category: "Health Awareness",
    title: "Understanding HIV: Awareness, Prevention, and Testing",
    date: "Oct 19, 2026",
    image: "https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Healthcare professional offering supportive guidance to a patient",
    summary: "Understand how HIV affects the immune system, how it is and is not transmitted, and why testing and treatment matter.",
    callout: "HIV cannot be diagnosed from symptoms alone. Testing is necessary; confidential guidance is available from qualified services.",
    keywords: ["HIV", "AIDS", "testing", "prevention", "PrEP", "PEP", "antiretroviral", "sexual health"],
    content: [
      { heading: "Understanding HIV", paragraphs: ["HIV (human immunodeficiency virus) affects the immune system, especially CD4 cells that help the body respond to infections. Without treatment, HIV can weaken immune defenses over time. Effective treatment can control the virus and help people live long, healthy lives."] },
      { heading: "How HIV is transmitted", paragraphs: ["HIV can be transmitted through specific body fluids, including blood, semen, vaginal and rectal fluids, and breast milk, when they enter another person’s bloodstream or contact certain tissues. Common routes include sex without effective prevention, sharing injection equipment, and transmission during pregnancy, birth, or breastfeeding without appropriate care."] },
      { heading: "Common misconceptions about transmission", paragraphs: ["HIV is not transmitted by hugging, handshakes, sharing food or utensils, using the same toilet, or ordinary social contact. It is not spread by mosquitoes. People living with HIV deserve the same respectful everyday contact as anyone else."] },
      { heading: "HIV prevention methods", paragraphs: ["Condoms help reduce the risk of HIV and other sexually transmitted infections when used correctly. PrEP (pre-exposure prophylaxis) is medicine for people who may be exposed to HIV; a qualified clinician can explain whether it is suitable and arrange follow-up testing.", "PEP (post-exposure prophylaxis) is emergency medicine after a possible exposure. It should be started as soon as possible, within 72 hours, so contact an emergency department or healthcare professional promptly. Do not wait for symptoms."] },
      { heading: "Testing and early diagnosis", paragraphs: ["HIV cannot be diagnosed from symptoms alone. Some people have no symptoms, and symptoms can resemble other illnesses, so an HIV test is necessary. A clinician or testing service can explain which test to use and whether follow-up testing is needed. Earlier diagnosis helps people connect with care and prevention support."] },
      { heading: "Treatment and ongoing care", paragraphs: ["Antiretroviral therapy (ART) is prescribed treatment that suppresses HIV. Taking it as directed and attending follow-up care protects health. With sustained viral suppression, HIV is not sexually transmitted (U=U); discuss test results and care with your clinician. Never start, stop, or change prescribed treatment without medical guidance."] },
      { heading: "Reducing stigma and finding support", paragraphs: ["People living with HIV deserve respectful, confidential care without stigma. A healthcare professional, sexual health clinic, or local public health service can provide testing, prevention, and treatment guidance. Ask the service about its privacy practices and available support."] },
    ],
  },
  {
    slug: "teenage-pregnancy-prevention",
    category: "Health Awareness",
    title: "Teenage Pregnancy: Prevention, Education, and Support",
    date: "Oct 19, 2026",
    image: "https://images.unsplash.com/photo-1559757175-0eb30cd8c063?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Supportive healthcare professional speaking with a young patient",
    summary: "Age-appropriate education, respectful relationships, and access to compassionate healthcare can help teenagers make informed choices.",
    callout: "A qualified professional can provide confidential, appropriate guidance and early prenatal care when needed.",
    keywords: ["teen", "adolescent", "pregnancy", "reproductive health", "contraception", "prenatal", "consent"],
    content: [
      { heading: "Information without judgment", paragraphs: ["Teenage pregnancy means a pregnancy occurring during adolescence. Young people deserve accurate information and compassionate healthcare. Each person’s circumstances are different; support should be respectful and free from blame."] },
      { heading: "Education, prevention, and healthy relationships", paragraphs: ["Comprehensive, age-appropriate reproductive health education helps young people understand their bodies, pregnancy, sexually transmitted infections, and how to seek care. A qualified healthcare professional can explain pregnancy prevention options, including how different methods work and their benefits and limits.", "Consent must be freely given, informed, and can be withdrawn. Healthy relationships respect boundaries and personal safety. If someone feels pressured, unsafe, or harmed, a trusted adult or qualified professional can help connect them with support."] },
      { heading: "Care for a teenager who may be pregnant", paragraphs: ["A teenager who thinks they may be pregnant should be able to speak with a qualified healthcare professional promptly. A clinician can confirm pregnancy, explain available care and options in a private, supportive setting, and clarify confidentiality and its limits under local rules.", "For someone continuing a pregnancy, early prenatal care supports health and gives the care team time to discuss nutrition, medicines, emotional well-being, and needed services. Do not stop prescribed medicines without medical advice. Urgent pain, heavy bleeding, fainting, or other severe symptoms need immediate medical attention."] },
      { heading: "Emotional, family, and education support", paragraphs: ["Emotional support matters. A trusted family member, school counselor, social worker, or clinician may help a young person plan next steps while respecting their safety and choices. Practical support can help teenagers stay connected to education and access appropriate healthcare.", "For reliable guidance, contact a licensed healthcare professional, adolescent health clinic, or recognized public health service. Ask about confidentiality, costs, and local services when making an appointment."] },
    ],
  },
];

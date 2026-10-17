alter table public.services
  add column if not exists faqs jsonb not null default '[]'::jsonb;

alter table public.doctors
  add column if not exists experience text not null default '';

create or replace view public.public_doctors as
select id, first_name, last_name, specialization, photo_url, availability_schedule, experience
from public.doctors
where status = 'active';
grant select on public.public_doctors to anon, authenticated;

-- Seed detailed public copy for service records. Existing non-seed descriptions are preserved.
update public.services set
  description = $body$The Diagnostics Department at MediWell Healthcare provides comprehensive diagnostic and imaging services to support medical evaluation, disease detection, treatment monitoring, and preventive healthcare. Laboratory and imaging findings help a patient's physician make informed clinical decisions and plan appropriate follow-up.

Diagnostic testing can identify health concerns before symptoms become severe and can help clinicians understand how a condition changes over time. Our diagnostic team works with physicians across specialties to coordinate testing and communicate results through the patient's care team.

Patients may need routine screening, laboratory investigation, imaging, or monitoring for an existing condition. The specific test, preparation, and expected turnaround depend on the order and the patient's clinical needs. Our team explains the process and helps patients prepare for their appointment.$body$,
  benefits = array['Early detection of diseases and medical conditions', 'Accurate diagnosis using modern technology', 'Faster treatment planning and intervention', 'Improved outcomes through evidence-based care', 'Comprehensive health screening services', 'Access to qualified diagnostic professionals', 'Preventive testing to help identify risks', 'Monitoring of chronic conditions and treatment effectiveness', 'High-quality imaging and laboratory reporting', 'Timely communication of critical results'],
  treatments = array['Complete Blood Count (CBC)', 'Blood Chemistry', 'Blood Glucose Testing', 'Lipid Profile', 'Liver Function Tests', 'Kidney Function Tests', 'Thyroid Function Tests', 'Urinalysis', 'Stool Examination', 'Electrolyte Testing', 'Digital X-Ray', 'Ultrasound', 'Doppler Ultrasound', 'CT Scan', 'MRI Scan', 'Mammography', 'Bone Density Scan', 'Electrocardiogram (ECG)', 'Echocardiogram', 'Holter Monitoring', 'Stress Testing', 'Cancer Screening', 'Allergy Testing', 'Infectious Disease Testing', 'Hormonal Testing', 'Prenatal Screening'],
  faqs = '[{"question":"Do I need a doctor’s referral?","answer":"Some diagnostic procedures require a physician referral, while others may be scheduled directly. Please contact us to confirm the requirements for your test."},{"question":"How long does it take to receive results?","answer":"Turnaround times depend on the test and may range from a few hours to several days. The care team will explain the expected timing when your appointment is arranged."},{"question":"Is preparation required before testing?","answer":"Some tests require fasting or other preparation. Follow the instructions provided for your specific test, and contact the care team if anything is unclear."}]'::jsonb,
  updated_at = now()
where slug = 'diagnostics' and (description = short_description or length(description) < 450);

update public.services set
  description = $body$The Cardiology Department at MediWell Healthcare focuses on the prevention, evaluation, and management of conditions affecting the heart and cardiovascular system. Our care team supports patients with clinical assessment, appropriate diagnostic testing, risk review, and follow-up planning.

Cardiovascular health needs can vary over time. Cardiology visits may help patients understand symptoms, review blood pressure and cholesterol risks, and discuss an individualized care plan with a qualified clinician. Cardiac tests are selected according to the patient's history and clinical assessment.

Our team works with patients and their referring clinicians to support continuity of care. Appointment preparation, test availability, and follow-up timing are explained during scheduling so patients know what to expect.$body$,
  benefits = array['Heart health monitoring', 'Cardiovascular risk assessment', 'Early evaluation of heart disease', 'Personalized treatment and monitoring plans', 'Support with blood pressure management', 'Preventive cardiovascular screening', 'Access to cardiac diagnostic services', 'Ongoing follow-up for chronic heart conditions'],
  treatments = array['Electrocardiogram (ECG)', 'Echocardiography', 'Holter Monitoring', 'Cardiac Stress Test', 'Blood Pressure Monitoring', 'Cardiac Risk Assessment', 'Cholesterol Evaluation', 'Heart Disease Prevention Programs', 'Congestive Heart Failure Management', 'Arrhythmia Assessment'],
  faqs = '[{"question":"When should I arrange a cardiology visit?","answer":"Arrange an appointment when your physician recommends cardiac review or when you have concerns about your heart health. For sudden or severe symptoms, seek emergency medical care."},{"question":"What should I bring to my appointment?","answer":"Bring your current medication list, relevant medical records, and any recent test results or referral notes that are available."},{"question":"Will I need a heart test?","answer":"A clinician will decide whether testing is appropriate after reviewing your history and symptoms. Available tests and preparation will be discussed before they are scheduled."}]'::jsonb,
  updated_at = now()
where slug = 'cardiology' and (description = short_description or length(description) < 450);

update public.services set
  description = $body$The Neurology service at MediWell Healthcare evaluates conditions affecting the brain, spinal cord, nerves, and related functions. Neurological assessment combines a careful review of symptoms and medical history with examination and, when appropriate, diagnostic testing.

Neurological concerns may be acute or long term and can affect movement, sensation, memory, balance, sleep, or communication. A specialist can help clarify possible causes, explain testing options, and coordinate a care plan that reflects each patient's needs.

The team also works with other clinicians when follow-up or additional expertise is needed. The appropriate tests and treatment options are determined by the clinician after an individual assessment.$body$,
  benefits = array['Support for early evaluation of neurological symptoms', 'Assessment focused on the nervous system', 'Care planning tailored to the patient', 'Help coordinating appropriate diagnostic testing', 'Ongoing support for chronic neurological conditions', 'Coordination with other specialties when needed'],
  treatments = array['Neurological Consultation', 'EEG Testing', 'EMG Testing', 'Nerve Conduction Studies', 'Brain Imaging Evaluation', 'Migraine Management', 'Epilepsy Assessment', 'Stroke Evaluation', 'Parkinson’s Disease Management', 'Memory Disorder Assessment'],
  faqs = '[{"question":"What concerns can a neurologist assess?","answer":"Neurologists evaluate a range of brain, spinal cord, and nerve concerns. A clinician can advise whether your symptoms are appropriate for a neurology appointment."},{"question":"Should I bring previous scans or test results?","answer":"Yes. Bring relevant imaging reports, test results, medication details, and referral notes so the specialist can review your history."},{"question":"Will every visit include a procedure?","answer":"No. The clinician first evaluates your concerns and history. Any tests or procedures are recommended only when clinically appropriate and will be explained beforehand."}]'::jsonb,
  updated_at = now()
where slug = 'neurology' and (description = short_description or length(description) < 450);

-- Every remaining service gets meaningful, service-specific copy and FAQs when its current copy is only the short seed text.
update public.services set description = case slug
  when 'specialist-consultation' then 'MediWell specialist consultations connect patients with clinicians for focused assessment and care planning. During a visit, the specialist reviews your concerns, relevant medical history, and available test results, then discusses suitable next steps. Bring referral notes and current medications when available. Follow-up and coordination with your primary care team can be arranged according to your needs.'
  when 'preventive-healthcare' then 'Preventive Healthcare supports patients who want to understand and maintain their health through appropriate screening, wellness discussions, and risk assessment. The care team considers age, health history, and individual risk factors when discussing screening options. Recommendations are personalized and may include follow-up with a physician when results need further review.'
  when 'general-medicine' then 'General Medicine provides primary care assessment for common health concerns and ongoing health needs. Clinicians review symptoms, medical history, and current medications to help determine appropriate evaluation and follow-up. When a concern needs specialized care, the team can coordinate referral and continuity with other services.'
  when 'emergency-care' then 'Emergency Care provides assessment and initial medical assistance for urgent health concerns. The care team evaluates the situation, prioritizes immediate needs, and coordinates next steps or referral where appropriate. For life-threatening symptoms, contact local emergency services or go to the nearest emergency department immediately.'
  when 'pediatrics' then 'Pediatrics provides age-appropriate healthcare for infants, children, and adolescents. Visits may address common illness, general wellness, growth, and development. The team works with parents and caregivers to explain findings, discuss care options, and arrange follow-up suited to the child’s needs.'
  when 'pathology-lab' then 'The Pathology Lab supports clinical care through laboratory analysis of collected specimens. Testing may help clinicians investigate symptoms, monitor health conditions, or review treatment response. The care team provides instructions for specimen collection and preparation, and explains how results will be shared with the ordering clinician.'
  when 'pharmacy' then 'MediWell Pharmacy supports patients with access to prescription medicines and practical medication guidance. Pharmacy staff can help explain directions provided by the prescriber, discuss safe storage, and identify when a question should be referred back to a clinician. Bring an up-to-date medication list when discussing ongoing therapy.'
  else description end,
  benefits = case slug
    when 'specialist-consultation' then array['Focused assessment by a relevant specialist', 'Review of medical history and test results', 'Clear discussion of care options', 'Coordination of follow-up when needed']
    when 'preventive-healthcare' then array['Screening options tailored to individual needs', 'Support identifying health risks early', 'Practical wellness guidance', 'Follow-up recommendations based on results']
    when 'general-medicine' then array['Accessible primary care assessment', 'Support for common health concerns', 'Ongoing review of health needs', 'Coordination with specialist services']
    when 'emergency-care' then array['Prompt assessment of urgent concerns', 'Prioritization of immediate care needs', 'Coordination of next steps and referrals', 'Clear guidance for follow-up']
    when 'pediatrics' then array['Care tailored to a child’s age and needs', 'Support for parents and caregivers', 'Wellness and development discussions', 'Guidance on follow-up care']
    when 'pathology-lab' then array['Laboratory results that support clinical decisions', 'Testing for investigation and monitoring', 'Clear specimen preparation instructions', 'Result coordination with the ordering clinician']
    when 'pharmacy' then array['Support accessing prescribed medicines', 'Guidance on medication directions and storage', 'Help identifying medication questions', 'Coordination with the prescribing clinician']
    else benefits end,
  treatments = case slug
    when 'specialist-consultation' then array['Specialist Assessment', 'Medical History Review', 'Test Result Review', 'Follow-up Consultation']
    when 'preventive-healthcare' then array['Preventive Health Screening', 'Wellness Consultation', 'Risk Assessment', 'Screening Follow-up']
    when 'general-medicine' then array['Primary Care Consultation', 'Common Illness Assessment', 'Medication Review', 'Chronic Condition Follow-up']
    when 'emergency-care' then array['Urgent Medical Assessment', 'Initial Stabilization', 'Emergency Referral Coordination', 'Follow-up Planning']
    when 'pediatrics' then array['Pediatric Consultation', 'Growth and Development Review', 'Child Wellness Assessment', 'Common Childhood Illness Care']
    when 'pathology-lab' then array['Specimen Collection', 'Clinical Laboratory Testing', 'Pathology Analysis', 'Result Reporting']
    when 'pharmacy' then array['Prescription Dispensing', 'Medication Counseling', 'Medication Review', 'Prescription Coordination']
    else treatments end,
  faqs = case slug
    when 'specialist-consultation' then '[{"question":"Do I need a referral?","answer":"Referral requirements depend on the specialist and your care needs. Contact us before booking if you are unsure."},{"question":"What should I bring?","answer":"Bring referral notes, relevant records, recent test results, and a current medication list when available."}]'::jsonb
    when 'preventive-healthcare' then '[{"question":"Which screenings should I have?","answer":"Screening recommendations depend on factors such as age, health history, and individual risk. A clinician can discuss suitable options with you."},{"question":"Do I need to prepare?","answer":"Preparation varies by screening. The team will provide instructions when your appointment is scheduled."}]'::jsonb
    when 'general-medicine' then '[{"question":"What can I discuss at a general medicine visit?","answer":"You can discuss new symptoms, routine health concerns, and ongoing conditions. The clinician will advise if another service is appropriate."},{"question":"Should I bring my medicines?","answer":"Bring a current list of medicines and relevant test results to support your consultation."}]'::jsonb
    when 'emergency-care' then '[{"question":"Is this service for life-threatening emergencies?","answer":"For life-threatening symptoms, contact local emergency services or go to the nearest emergency department immediately."},{"question":"What happens during assessment?","answer":"The team assesses urgency and immediate needs, then coordinates appropriate care or referral."}]'::jsonb
    when 'pediatrics' then '[{"question":"Should a parent or guardian attend?","answer":"A parent or legal guardian should accompany children and bring relevant medical records and medication details."},{"question":"What can I bring to the visit?","answer":"Bring the child’s health records, vaccination information if relevant, and a list of current medicines."}]'::jsonb
    when 'pathology-lab' then '[{"question":"Do all tests require fasting?","answer":"No. Preparation depends on the specific test. Follow the instructions provided when booking or contact the lab if you need clarification."},{"question":"How are results delivered?","answer":"Results are coordinated according to the test and ordering clinician. The team can explain the expected turnaround when your sample is collected."}]'::jsonb
    when 'pharmacy' then '[{"question":"What should I bring to collect a prescription?","answer":"Bring your prescription and any identification or documentation requested by the pharmacy."},{"question":"Can the pharmacy review my medicines?","answer":"Pharmacy staff can discuss medication directions and help identify questions that should be referred to your prescriber."}]'::jsonb
    else faqs end,
  updated_at = now()
where slug in ('specialist-consultation','preventive-healthcare','general-medicine','emergency-care','pediatrics','pathology-lab','pharmacy')
  and (description = short_description or length(description) < 180);

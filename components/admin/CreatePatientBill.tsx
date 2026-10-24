"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Plus, Search, Trash2, UserRound, BedDouble, FileText, LoaderCircle, ArrowRightLeft, RefreshCw, Stethoscope } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { BillingAuthorizations, type BillingAuthorization } from "@/components/admin/BillingAuthorizations";
import { lineFromAuthorization, validateBillingLines, validDecimal } from "@/lib/admin/billing-validation.mjs";
import { RoomBedAssignmentDrawer } from "@/components/admin/RoomBedAssignmentDrawer";
import { createPatientRequestScope, isValidUuid, normalizeBillingPatient } from "@/lib/admin/billing-patient.mjs";

type Patient = { patient_id: string; full_name: string | null; email?: string | null; phone?: string | null; department?: string | null; admission_number?: string | null; admission_id?: string | null; admission_status?: string | null; admitted_at?: string | null; discharged_at?: string | null; doctor_id?: string | null; doctor_name?: string | null; doctor_photo_url?: string | null; doctor_department?: string | null; doctor_assignment_active?: boolean | null; doctor_consultation_fee?: number | null; doctor_is_demo?: boolean; specialty?: string | null; doctor_sub_specialization?: string | null; room_id?: string | null; room_number?: string | null; room_type?: string | null; bed_number?: string | null; room_status?: string | null; room_daily_rate?: number | null; room_is_demo?: boolean; is_demo?: boolean; admissions?: Array<Record<string, any>> };
type Product = { id: string; name: string; category: string | null; price: number; stock: number; image_url: string | null; available: boolean };
type Doctor = { id: string; display_name: string; specialty?: string | null; department?: string | null; is_demo?: boolean };
type Consultation = { record_id: string; doctor_id: string; occurred_at: string; record_type: string; reason: string; doctor_name: string; specialty: string; fee?: number; bill_id?: string | null; alreadyCharged?: boolean };
type Service = { id: string; name: string; short_description?: string | null };
type Line = { authorizationId?: string; key: string; category: string; description: string; quantity: string; unitPrice: string; productId?: string; serviceId?: string; doctorId?: string; consultationRecordId?: string; date?: string; periodStart?: string; periodEnd?: string; reason?: string };
type Bill = { id: string; bill_number: string; status: string; issued_at: string; description: string; total_amount: number; payment_approved_at: string | null; is_demo?: boolean };
type BillCharge = { id: string; item_name: string; category: string; quantity: number; unit_price: number; bill_id?:string|null };
const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
const BIG_ZERO = BigInt(0);
const BIG_ONE = BigInt(1);
const BIG_TWO = BigInt(2);
const BIG_TEN = BigInt(10);
const MILLI = BigInt(1000);
const scaled = (value: string | number, places: number) => {
  const raw = String(value ?? "0").trim();
  const match = raw.match(/^(-?)(\d*)(?:\.(\d*))?$/);
  if (!match) return BIG_ZERO;
  const sign = match[1] === "-" ? -BIG_ONE : BIG_ONE;
  const fraction = (match[3] || "").padEnd(places, "0").slice(0, places);
  return sign * (BigInt(match[2] || "0") * BIG_TEN ** BigInt(places) + BigInt(fraction || "0"));
};
const rounded = (value: bigint, divisor: bigint) => value >= BIG_ZERO ? (value + divisor / BIG_TWO) / divisor : -((-value + divisor / BIG_TWO) / divisor);
const lineRawMilliCents = (line: Line) => scaled(line.quantity, 3) * scaled(line.unitPrice, 2);
const amount = (line: Line) => Number(rounded(lineRawMilliCents(line), MILLI)) / 100;
const pesosFromCents = (cents: bigint) => Number(cents) / 100;
const today = () => { const parts = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const part = (type: string) => parts.find((item) => item.type === type)?.value || "00"; return `${part("year")}-${part("month")}-${part("day")}`; };
const stayDays = (start: string, end: string) => { const a = Date.parse(`${start}T00:00:00Z`), b = Date.parse(`${end}T00:00:00Z`); return Number.isFinite(a) && Number.isFinite(b) && b >= a ? String(Math.floor((b - a) / 86400000) + 1) : ""; };
const emptyLine = (category = "other"): Line => ({ key: crypto.randomUUID(), category, description: "", quantity: "1", unitPrice: "", date: today() });
const displayError = (error: unknown) => error instanceof Error ? error.message : (error as { message?: string })?.message || "The request could not be completed. Please retry.";

function normalizeAdmission(row: Record<string, any>): Record<string, any> {
  const room=Array.isArray(row.hospital_rooms)?row.hospital_rooms[0]:row.hospital_rooms;
  const doctor=Array.isArray(row.doctors)?row.doctors[0]:row.doctors;
  return {...row,admission_number:row.id,
    room:room?{...room,is_demo:room.is_demo===true}:null,doctor:doctor?{...doctor,is_demo:doctor.is_demo===true}:null};
}

export function CreatePatientBill() {
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [assigningDoctor, setAssigningDoctor] = useState(false);
  const [doctorId, setDoctorId] = useState("");
  const [careManagementAllowed, setCareManagementAllowed] = useState(false);
  const [doctorSaving, setDoctorSaving] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [billId, setBillId] = useState<string | null>(null);
  const [billNumber, setBillNumber] = useState("");
  const [discount, setDiscount] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [taxes, setTaxes] = useState("0");
  const [payments, setPayments] = useState(0);
  const [paymentTotalsByBill, setPaymentTotalsByBill] = useState<Record<string,number>>({});
  const [bills, setBills] = useState<Bill[]>([]);
  const [roomCharges,setRoomCharges]=useState<BillCharge[]>([]);
  const [viewing, setViewing] = useState<{ bill: Bill; charges: BillCharge[] } | null>(null);
  const [assigningRoom, setAssigningRoom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [patientCareError,setPatientCareError]=useState("");
  const [notice, setNotice] = useState("");
  const initialRef = useRef<string | null>(null);
  const patientRequests = useRef(createPatientRequestScope());
  const directoryRequest = useRef(0);
  const [lineErrors,setLineErrors] = useState<Record<string,Record<string,string>>>({});
  const [approvals,setApprovals] = useState<BillingAuthorization[]>([]);
  const [canApprove,setCanApprove] = useState(false);
  const [approvalError,setApprovalError] = useState('');
  const savingRequest = useRef(false);
  const finalizationReferences = useRef<Record<string,string>>({});
  useEffect(() => () => { patientRequests.current.clear(); directoryRequest.current += 1; }, []);

  const findPatients = useCallback(async (term: string) => {
    if (!supabase) return;
    const request = ++directoryRequest.current;
    const { data, error: queryError } = await supabase.rpc("admin_patient_directory", { p_limit: 20, p_offset: 0, p_search: term.trim() });
    if (request !== directoryRequest.current) return;
    if (queryError) throw queryError;
    setError("");
    try {
      const normalized = (Array.isArray(data) ? data : []).map(normalizeBillingPatient);
      setPatients([...new Map(normalized.map(row => [row.patient_id, row])).values()]);
    } catch (cause) {
      setPatients([]);
      if (process.env.NODE_ENV === "development") console.error("[Billing] Invalid patient directory response shape", { columns: Array.isArray(data) ? data.map(row => Object.keys(row ?? {})) : typeof data });
      throw cause;
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void findPatients(search).catch((e) => setError(displayError(e))), 250); return () => window.clearTimeout(timer); }, [search, findPatients]);

  useEffect(() => {
    if (!supabase) return;
    void Promise.all([
      supabase.from("products").select("id,name,category,price,stock,image_url,available").eq("available", true).order("name").limit(200),
      supabase.from("services").select("id,name,short_description").order("name").limit(200),
      supabase.from("doctors").select("id,display_name,specialty,department,is_demo").eq("available",true).eq("is_demo",false).order("display_name"),
    ]).then(([p, s, d]) => {
      if (p.error) throw p.error; if (s.error) throw s.error; if (d.error) throw d.error;
      setProducts((p.data || []) as Product[]); setServices((s.data || []) as Service[]); setDoctors((d.data || []) as Doctor[]);
    }).catch((e) => setError(displayError(e)));
  }, []);

  const refreshApprovals = useCallback(async (id: string) => {
    if (!supabase || !isValidUuid(id)) return;
    const isCurrent = patientRequests.current.snapshot();
    const { data, error: approvalFailure } = await supabase.rpc('billing_charge_options', { p_patient_id: id });
    if (!isCurrent() || !patientRequests.current.matches(id)) return;
    if (approvalFailure) {
      setApprovals([]);
      setCanApprove(false);
      const code = approvalFailure.code || '';
      const message = approvalFailure.message || 'No database error message was returned.';
      if (code === 'PGRST202' || code === '42883') {
        setApprovalError(`The billing approvals RPC billing_charge_options(p_patient_id uuid) is missing or not in the API schema cache (${code}). Apply supabase/migrations/20261218000000_verified_billing_charges.sql, then reload the PostgREST schema cache. ${message}`);
      } else if (code === '42501' || code === 'PGRST301') {
        setApprovalError(`Your account is not authorized to read billing approvals (${code}). Confirm the signed-in staff member has billing access. ${message}`);
      } else if (code === '42P01' || code === 'PGRST205') {
        setApprovalError(`A billing approvals database dependency is missing (${code}). Apply supabase/migrations/20261218000000_verified_billing_charges.sql. ${message}`);
      } else {
        setApprovalError(`Verified charge approvals failed to load (${code || 'unknown database error'}): ${message}`);
      }
      return;
    }
    if (!data || !Array.isArray(data.approvals) || typeof data.canApprove !== 'boolean') {
      setApprovals([]);
      setCanApprove(false);
      setApprovalError('The billing approvals RPC returned an unexpected response. Verify billing_charge_options returns approvals and canApprove, then refresh approvals.');
      return;
    }
    setApprovals(data.approvals);
    setCanApprove(data.canApprove);
    setApprovalError('');
  }, []);

  const refreshPatientBills = useCallback(async (id: string) => {
    if (!supabase) return;
    if (!isValidUuid(id)) throw new Error("Select a patient with a valid UUID before loading bills.");
    const isCurrent = patientRequests.current.snapshot();
    const { data, error: billError } = await supabase.from("patient_bills").select("id,bill_number,status,issued_at,description,total_amount,payment_approved_at").eq("patient_id", id).eq("is_demo", false).order("issued_at", { ascending: false }).limit(10);
    if (billError) throw billError;
    if (!isCurrent() || !patientRequests.current.matches(id)) return;
    setBills((data || []) as Bill[]);
  }, []);

  async function refreshProfessionalFees(id: string) {
    if(!supabase)return;
    if (!isValidUuid(id)) throw new Error("Select a patient with a valid UUID before loading professional fees.");
    const isCurrent = patientRequests.current.snapshot();
    const {data,error:queryError}=await supabase.from("patient_medical_charges").select("consultation_record_id,unit_price,bill_id").eq("patient_id",id).eq("is_demo",false).not("consultation_record_id","is",null);
    if(queryError)throw queryError;
    if (!isCurrent() || !patientRequests.current.matches(id)) return;
    const existingFees=new Map<string,{fee:number;bill_id?:string|null;alreadyCharged:boolean}>((data||[]).filter(row=>row.consultation_record_id).map(row=>[row.consultation_record_id,{fee:Number(row.unit_price),bill_id:row.bill_id,alreadyCharged:true}]));
    setConsultations(current=>current.map(record=>{const charge=existingFees.get(record.record_id);return charge?{...record,...charge}:{...record,fee:undefined,bill_id:undefined,alreadyCharged:false};}));
  }

  async function selectPatient(item: Patient) {
    try { item = normalizeBillingPatient(item); }
    catch (cause) {
      clearSelectedPatient();
      setError(displayError(cause));
      if (process.env.NODE_ENV === "development") console.error("[Billing] Invalid selected patient shape", { columns: Object.keys(item ?? {}) });
      return;
    }
    const request = patientRequests.current.begin(item.patient_id);
    const isCurrent = () => patientRequests.current.isCurrent(item.patient_id, request);
    setLineErrors({});setApprovals([]);setCanApprove(false);setApprovalError('');
    setViewing(null); setAssigningRoom(false);
    setPatient(item); setPatientCareError(""); setConsultations([]); setLines([]); setBillId(null); setBillNumber(""); setDiscount("0"); setDiscountReason(""); setTaxes("0"); setPayments(0); setPaymentTotalsByBill({}); setBills([]); setRoomCharges([]); setDoctorId(""); setAssigningDoctor(false); setCareManagementAllowed(false); initialRef.current=null; setError(""); setNotice("");
    if (!supabase) return;
    setLoading(true);
    try {
      const {data:admissionRows,error:admissionError}=await supabase.from("patient_admissions").select("id,patient_id,doctor_id,room_id,admitted_at,discharged_at,status,is_demo,hospital_rooms(id,room_number,room_type,bed_number,status,daily_rate,is_demo),doctors(id,display_name,specialty,department,consultation_fee,is_demo)").eq("patient_id",item.patient_id).order("admitted_at",{ascending:false});
      if (!isCurrent()) return;
      if(admissionError)setPatientCareError("Admission details failed to load: "+admissionError.message);
      const admissions=(admissionRows||[]).map((row:Record<string,any>)=>normalizeAdmission(row));
      const active=admissions.find((row:Record<string,any>)=>row.status==="admitted"&&!row.discharged_at);
      const selected=active||admissions[0];
      const care:Partial<Patient>=admissionError?{}:selected?{
        admissions,admission_id:selected.id,admission_number:selected.admission_number,admission_status:selected.status,
        admitted_at:selected.admitted_at,discharged_at:selected.discharged_at,is_demo:selected.is_demo===true,
        doctor_id:selected.doctor?.id||null,doctor_name:selected.doctor?.display_name||null,
        doctor_photo_url:selected.doctor?.avatar_url||selected.doctor?.image_url||null,
        doctor_department:selected.doctor?.department||null,specialty:selected.doctor?.specialty||null,
        doctor_sub_specialization:selected.doctor?.sub_specialization||null,
        doctor_consultation_fee:selected.doctor?.consultation_fee??null,doctor_is_demo:selected.doctor?.is_demo===true,
        doctor_assignment_active:Boolean(active&&selected.doctor),room_id:selected.room_id||null,
        room_number:selected.room?.room_number||null,room_type:selected.room?.room_type||null,
        bed_number:selected.room?.bed_number||null,room_status:selected.room?.status||null,
        room_daily_rate:selected.room?.daily_rate??null,room_is_demo:selected.room?.is_demo===true,
      }:{admissions,admission_id:null,admission_number:null,admission_status:null,admitted_at:null,discharged_at:null,doctor_id:null,doctor_name:null,room_id:null,room_number:null,room_type:null,bed_number:null,is_demo:false};
      const enhanced:Patient={...item,...care};setPatient(enhanced);
      const [billsResult,chargesResult,paymentsResult,recordsResult]=await Promise.all([
        supabase.from("patient_bills").select("*").eq("patient_id",item.patient_id).eq("is_demo",false).order("issued_at",{ascending:false}).limit(50),
        supabase.from("patient_medical_charges").select("*").eq("patient_id",item.patient_id).eq("is_demo",false),
        supabase.from("patient_payments").select("*").eq("patient_id",item.patient_id).eq("is_demo",false),
        supabase.from("patient_medical_records").select("id,patient_id,doctor_id,record_type,title,description,record_date,result_status,is_demo,created_at").eq("patient_id",item.patient_id).eq("is_demo",false).order("record_date",{ascending:false}),
      ]);
      if (!isCurrent()) return;
      if(billsResult.error)throw Object.assign(new Error("Bills query failed: "+billsResult.error.message),{code:billsResult.error.code,table:"patient_bills"});
      if(chargesResult.error)throw Object.assign(new Error("Charges query failed: "+chargesResult.error.message),{code:chargesResult.error.code,table:"patient_medical_charges"});
      if(paymentsResult.error)throw Object.assign(new Error("Payments query failed: "+paymentsResult.error.message),{code:paymentsResult.error.code,table:"patient_payments"});
      const genuineBills=((billsResult.data||[]) as Bill[]).filter(bill=>bill.is_demo===false&&!/^DEMO[-_]/i.test(String(bill.bill_number||"")));
      setBills(genuineBills);
      const genuineCharges=(chargesResult.data||[]).filter((row:any)=>row.is_demo===false);
      const finalizedBillIds=new Set(genuineBills.filter(bill=>bill.payment_approved_at).map(bill=>bill.id));
      setRoomCharges(genuineCharges.filter((row:any)=>String(row.category).toLowerCase()==="room"&&finalizedBillIds.has(row.bill_id)).map((row:any)=>({id:row.id,item_name:row.item_name||row.description||"Accommodation",category:row.category,quantity:Number(row.quantity),unit_price:Number(row.unit_price),bill_id:row.bill_id})));
      const feeRows=genuineCharges as {consultation_record_id?:string|null;unit_price:number;bill_id?:string|null}[];
      const existingFees=new Map<string,{fee:number;bill_id?:string|null;alreadyCharged:boolean}>(feeRows.filter(row=>row.consultation_record_id).map(row=>[row.consultation_record_id as string,{fee:Number(row.unit_price),bill_id:row.bill_id,alreadyCharged:true}]));
      const verifiedRecords=(recordsResult.error?[]:(recordsResult.data||[])).filter((row:any)=>["verified","released","amended"].includes(String(row.result_status||"").toLowerCase()));
      let doctorById=new Map<string,Doctor>();
      const doctorIds=[...new Set(verifiedRecords.map((row:any)=>row.doctor_id).filter(isValidUuid))];
      if(doctorIds.length){const {data:doctorRows,error:doctorError}=await supabase.from("doctors").select("id,display_name,specialty,department,is_demo").in("id",doctorIds);if(doctorError)console.warn("Could not load optional professional-fee doctor details",doctorError.message);else doctorById=new Map((doctorRows||[]).map((doctor:Doctor)=>[doctor.id,doctor]));}
      if (!isCurrent()) return;
      const eligibleConsultations:Consultation[]=verifiedRecords.filter((record:any)=>record.doctor_id&&doctorById.get(record.doctor_id)?.is_demo===false).map((record:any)=>{const doctor=doctorById.get(record.doctor_id)!;return {record_id:record.id,doctor_id:record.doctor_id,occurred_at:record.record_date||record.created_at,record_type:record.record_type||"consultation",reason:[record.title,record.description].filter(Boolean).join(" ? "),doctor_name:doctor.display_name,specialty:doctor.specialty||"",...existingFees.get(record.id)};});
      setConsultations(eligibleConsultations);
      await refreshApprovals(item.patient_id);
      if (!isCurrent()) return;
      setDoctorId(enhanced.doctor_id||"");
      // This admin-only UI offers the action; database row-level policies remain
      // the authorization boundary for the direct admission update.
      setCareManagementAllowed(true);
      const totals:Record<string,number>={};
      for(const payment of paymentsResult.data||[])if(["completed","paid","succeeded"].includes(String(payment.status||payment.payment_status||"").toLowerCase()))totals[payment.bill_id]=(totals[payment.bill_id]||0)+Number(payment.amount||0);
      setPaymentTotalsByBill(totals);setPayments(0);
      if(recordsResult.error)setNotice("Patient care details loaded. Verified professional records are temporarily unavailable.");
    } catch (cause) {
      if (!isCurrent()) return;
      const failure=cause as {code?:string;table?:string};
      if(failure.table==="patient_admissions"){setPatientCareError("Admission details failed to load: "+displayError(cause));}
      setError("Could not load this patient's billing details. "+displayError(cause));
    } finally { if (isCurrent()) setLoading(false); }
  }

  async function refreshPatientCare() {
    if (!supabase || !patient) return;
    if (!patientRequests.current.matches(patient.patient_id)) return;
    if (!isValidUuid(patient.patient_id)) throw new Error("Select a patient with a valid UUID to view admission, room, and doctor details.");
    const isCurrent = patientRequests.current.snapshot();
    setPatientCareError("");
    const {data,error:careError}=await supabase.from("patient_admissions").select("id,patient_id,doctor_id,room_id,admitted_at,discharged_at,status,is_demo,hospital_rooms(id,room_number,room_type,bed_number,status,daily_rate,is_demo),doctors(id,display_name,specialty,department,consultation_fee,is_demo)").eq("patient_id",patient.patient_id).order("admitted_at",{ascending:false});
    if (!isCurrent()) return;
    if(careError)throw Object.assign(new Error("Admissions query failed: "+careError.message),{code:careError.code,table:"patient_admissions"});
    const admissions=(data||[]).map((row:Record<string,any>)=>normalizeAdmission(row));
    const active=admissions.find((row:Record<string,any>)=>row.status==="admitted"&&!row.discharged_at);
    const selected=active||admissions[0];
    if(!selected){setPatient({...patient,admissions:[],admission_id:null,admission_number:null,admission_status:null,admitted_at:null,discharged_at:null,doctor_id:null,doctor_name:null,room_id:null,room_number:null,room_type:null,bed_number:null,is_demo:false});return;}
    setPatient({...patient,admissions,admission_id:selected.id,admission_number:selected.admission_number,admission_status:selected.status,admitted_at:selected.admitted_at,discharged_at:selected.discharged_at,is_demo:selected.is_demo===true,doctor_id:selected.doctor?.id||null,doctor_name:selected.doctor?.display_name||null,doctor_photo_url:selected.doctor?.avatar_url||selected.doctor?.image_url||null,doctor_department:selected.doctor?.department||null,specialty:selected.doctor?.specialty||null,doctor_sub_specialization:selected.doctor?.sub_specialization||null,doctor_consultation_fee:selected.doctor?.consultation_fee??null,doctor_is_demo:selected.doctor?.is_demo===true,doctor_assignment_active:Boolean(active&&selected.doctor),room_id:selected.room_id||null,room_number:selected.room?.room_number||null,room_type:selected.room?.room_type||null,bed_number:selected.room?.bed_number||null,room_status:selected.room?.status||null,room_daily_rate:selected.room?.daily_rate??null,room_is_demo:selected.room?.is_demo===true});
  }

  async function saveDoctorAssignment() {
    if (!supabase || !patient || !careManagementAllowed) return;
    if (!isValidUuid(patient.patient_id) || !isValidUuid(patient.admission_id) || !isValidUuid(doctorId)) { setError("Select a valid patient, active admission, and doctor."); return; }
    const isCurrent = patientRequests.current.snapshot();
    setDoctorSaving(true); setError(""); setNotice("");
    try {
      if(!patient.admission_id||patient.admission_status!=="admitted"||patient.is_demo)throw new Error("A genuine active admission is required before changing its assigned doctor.");
      const {data:updated,error:assignmentError}=await supabase.from("patient_admissions").update({doctor_id:doctorId}).eq("id",patient.admission_id).eq("patient_id",patient.patient_id).eq("status","admitted").is("discharged_at",null).select("id").maybeSingle();
      if (!isCurrent()) return;
      if(assignmentError)throw assignmentError;
      if(!updated)throw new Error("The active admission was not updated. Check your care management permission and retry.");
      await refreshPatientCare();
      if (!isCurrent()) return;
      setAssigningDoctor(false); setNotice("Doctor assignment saved and shared with the patient portal.");
    } catch(cause) { if (isCurrent()) setError(displayError(cause)); }
    finally { setDoctorSaving(false); }
  }

  async function refreshRoomAssignment() {
    const isCurrent = patientRequests.current.snapshot();
    setError("");
    try { await refreshPatientCare(); }
    catch (cause) { if (isCurrent()) { setPatientCareError(displayError(cause)); setError(`Room assignment could not be refreshed. ${displayError(cause)}`); } }
  }

  const filteredProducts = useMemo(() => products.filter((p) => `${p.name} ${p.category || ""}`.toLowerCase().includes(productSearch.toLowerCase())), [products, productSearch]);
  const filteredServices = useMemo(() => services.filter((s) => `${s.name} ${s.short_description || ""}`.toLowerCase().includes(serviceSearch.toLowerCase())), [services, serviceSearch]);
  const totals = useMemo(() => {
    const milliCents = { medicine: BIG_ZERO, room: BIG_ZERO, consultation: BIG_ZERO, services: BIG_ZERO, additional: BIG_ZERO };
    let subtotalMilliCents = BIG_ZERO;
    lines.forEach((line) => { const raw = lineRawMilliCents(line); subtotalMilliCents += raw; const key = line.category === "medicine" || line.category === "medical_supply" ? "medicine" : line.category === "room" ? "room" : line.category === "consultation" ? "consultation" : line.category === "hospital_service" ? "services" : "additional"; milliCents[key] += raw; });
    const subtotalCents = rounded(subtotalMilliCents, MILLI);
    const discountCents = scaled(discount, 2), taxCents = scaled(taxes, 2), paymentCents = scaled(payments, 2);
    const totalCents = subtotalCents - discountCents + taxCents;
    return { medicine: pesosFromCents(rounded(milliCents.medicine, MILLI)), room: pesosFromCents(rounded(milliCents.room, MILLI)), consultation: pesosFromCents(rounded(milliCents.consultation, MILLI)), services: pesosFromCents(rounded(milliCents.services, MILLI)), additional: pesosFromCents(rounded(milliCents.additional, MILLI)), subtotal: pesosFromCents(subtotalCents), discount: pesosFromCents(discountCents), taxes: pesosFromCents(taxCents), total: pesosFromCents(totalCents > BIG_ZERO ? totalCents : BIG_ZERO), due: pesosFromCents(totalCents - paymentCents > BIG_ZERO ? totalCents - paymentCents : BIG_ZERO) };
  }, [lines, discount, taxes, payments]);

  function updateLine(key: string, updates: Partial<Line>) { if(saving)return;setLineErrors(old=>{const next={...old};delete next[key];return next;});setLines((old) => old.map((line) => line.key === key ? { ...line, ...updates } : line)); }
  function addProduct(product: Product) { if(saving)return;setLines((old) => [...old, { ...emptyLine(product.category?.toLowerCase().includes("medicine") ? "medicine" : "medical_supply"), description: product.name, unitPrice: String(product.price), productId: product.id }]); }
  function addService(service: Service) { if(saving)return;setLines((old) => [...old, { ...emptyLine("hospital_service"), description: service.name, serviceId: service.id }]); }
  function addApprovedCharge(approval: BillingAuthorization) {
    if (saving) return;
    if (lines.some(line=>line.authorizationId===approval.id || approval.category==='consultation' && line.consultationRecordId===approval.consultation_record_id)) { setError('This authorized charge is already in the current bill.');return; }
    setLines(old=>[...old,lineFromAuthorization(approval,crypto.randomUUID(),today())]);
  }
  function addDoctorFee(recordId: string, fee: string, authorizationId: string) {
    const record=consultations.find(item=>item.record_id===recordId);
    const approval=approvals.find(item=>item.id===authorizationId&&item.category==='consultation'&&item.consultation_record_id===recordId);
    if(!record||!approval||Number(fee)!==Number(approval.unit_price)||record.alreadyCharged&&record.bill_id!==billId){setError('Doctor fee: Select an approved fee for a genuine verified consultation.');return;}
    addApprovedCharge(approval);
  }

  const serialize = () => lines.map((line) => ({ _patient_id: patient?.patient_id, client_key: line.key, billing_authorization_id: line.authorizationId || null, description: line.description.trim(), category: line.category, quantity: line.quantity.trim(), unit_price: line.unitPrice.trim(), inventory_product_id: line.productId || null, service_id: line.serviceId || null, doctor_id: line.doctorId || null, consultation_record_id: line.consultationRecordId || null, service_date: line.date || today(), period_start: line.periodStart || null, period_end: line.periodEnd || null, supporting_reason: line.reason?.trim() || null }));

  async function save(finalize: boolean) {
    if (savingRequest.current) return;
    setError(""); setNotice("");
    if (!supabase || !patient || !isValidUuid(patient.patient_id)) { setError("Select a patient with a valid UUID first."); return; }
    const relatedIds = [billId, patient.admission_id];
    if (relatedIds.some(id => id != null && !isValidUuid(id))) { setError("A billing item or admission has an invalid UUID. Reload the patient and billing items."); return; }
    if (!lines.length) { setError('Add at least one verified billing item.');return; }
    const validation = validateBillingLines(lines,products,approvals,billId);
    setLineErrors(validation);
    if (Object.keys(validation).length) { setError(Object.values(validation).flatMap(fields=>Object.values(fields))[0]);return; }
    if (!validDecimal(discount,2) || !validDecimal(taxes,2)) {setError('Discounts and taxes must be nonnegative amounts with at most 2 decimal places.');return;}
    if (totals.discount > totals.subtotal) { setError("Discount cannot exceed the subtotal."); return; }
    if (totals.discount > 0 && !discountReason.trim()) { setError("Add the approval reason for this discount."); return; }
    const isCurrent = patientRequests.current.snapshot();
    savingRequest.current=true;
    setSaving(true);
    try {
      initialRef.current ??= crypto.randomUUID();
      const { data, error: saveError } = await supabase.rpc("billing_save_patient_bill", { p_bill_id: billId, p_external_reference: initialRef.current, p_patient_id: patient.patient_id, p_admission_id: patient.is_demo ? null : patient.admission_id || null, p_items: serialize(), p_discount: totals.discount, p_discount_reason: discountReason.trim() || null, p_taxes: totals.taxes, p_finalize: finalize });
      if (!isCurrent()) return;
      if (saveError?.code === "PGRST202") throw new Error("The billing save RPC is missing from Supabase. Apply migration 20261220000000_restore_billing_save_patient_bill_rpc.sql and reload the schema cache, then retry.");
      if (saveError) {
        try { const detail=JSON.parse(saveError.details||'{}'); const failedLine=lines[detail.item_index]; if(failedLine&&detail.field)setLineErrors({[failedLine.key]:{[detail.field]:saveError.message}}); } catch {}
        throw saveError;
      }
      const saved = typeof data === "string" ? data : (data as { bill_id?: string; bill_number?: string })?.bill_id;
      const number = (data as { bill_number?: string })?.bill_number || billNumber;
      if (!saved) throw new Error("The billing service did not return a bill reference.");
      setBillId(saved); setBillNumber(number); setPayments(paymentTotalsByBill[saved]||0); initialRef.current = null;
      setNotice(finalize ? `Bill ${number} finalized and made available in the patient's portal.` : `Draft ${number} saved. It is not visible as a finalized obligation to the patient.`);
      await Promise.all([refreshPatientBills(patient.patient_id),refreshProfessionalFees(patient.patient_id),refreshApprovals(patient.patient_id)]);
    } catch (e) { if (isCurrent()) setError(displayError(e)); }
    finally { savingRequest.current=false;setSaving(false); }
  }

  async function openDraft(bill: Bill) {
    if (!supabase || !patient || !isValidUuid(patient.patient_id) || !isValidUuid(bill.id) || bill.payment_approved_at) return;
    const isCurrent = patientRequests.current.snapshot();
    setLoading(true); setError(""); setNotice("");
    try {
      const [{ data, error: chargeError }, { data: b, error: billError }] = await Promise.all([
        supabase.from("patient_medical_charges").select("id,item_name,category,quantity,unit_price,inventory_product_id,service_id,professional_doctor_id,consultation_record_id,service_date,service_period_start,service_period_end,supporting_reason,billing_authorization_id").eq("bill_id", bill.id).eq("patient_id", patient.patient_id).eq("is_demo", false),
        supabase.from("patient_bills").select("approved_discount,discount_reason,taxes_and_fees").eq("id", bill.id).single(),
      ]);
      if (!isCurrent()) return;
      if (chargeError) throw chargeError; if (billError) throw billError;
      setLines((data || []).map((item) => ({ key: item.id, authorizationId: item.billing_authorization_id || undefined, description: item.item_name, category: item.category, quantity: String(item.quantity), unitPrice: String(item.unit_price), productId: item.inventory_product_id || undefined, serviceId: item.service_id || undefined, doctorId: item.professional_doctor_id || undefined, consultationRecordId: item.consultation_record_id || undefined, date: item.service_date || today(), periodStart: item.service_period_start || undefined, periodEnd: item.service_period_end || undefined, reason: item.supporting_reason || undefined })));
      await refreshApprovals(patient.patient_id);
      if(!isCurrent())return;
      setLineErrors({});
      setDiscount(String(b.approved_discount || 0)); setTaxes(String(b.taxes_and_fees || 0)); setBillId(bill.id); setBillNumber(bill.bill_number); initialRef.current = null;
      setDiscountReason(b.discount_reason || "");
      setPayments(paymentTotalsByBill[bill.id]||0); setNotice(`Editing draft ${bill.bill_number}.`); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { if (isCurrent()) setError(displayError(e)); }
    finally { if (isCurrent()) setLoading(false); }
  }

  async function finalizeDraft(bill: Bill) {
    if (!supabase || !patient || !isValidUuid(patient.patient_id) || !isValidUuid(bill.id) || bill.payment_approved_at) return;
    if (savingRequest.current) return;
    savingRequest.current=true;
    const isCurrent = patientRequests.current.snapshot();
    setLoading(true); setError(""); setNotice("");
    try {
      const [{ data: charges, error: chargeError }, { data: adjustments, error: billError }] = await Promise.all([
        supabase.from("patient_medical_charges").select("item_name,category,quantity,unit_price,inventory_product_id,service_id,professional_doctor_id,consultation_record_id,service_date,service_period_start,service_period_end,supporting_reason,billing_authorization_id").eq("bill_id", bill.id).eq("patient_id", patient.patient_id).eq("is_demo", false),
        supabase.from("patient_bills").select("approved_discount,discount_reason,taxes_and_fees,admission_id").eq("id", bill.id).single(),
      ]);
      if (!isCurrent()) return;
      if (chargeError) throw chargeError; if (billError) throw billError;
      finalizationReferences.current[bill.id] ??= crypto.randomUUID();
      const { error: finalizeError } = await supabase.rpc("billing_save_patient_bill", { p_bill_id: bill.id, p_external_reference: finalizationReferences.current[bill.id], p_patient_id: patient.patient_id, p_admission_id: patient.is_demo ? null : adjustments.admission_id, p_items: (charges || []).map((item) => ({ _patient_id: patient.patient_id, billing_authorization_id: item.billing_authorization_id || null, description: item.item_name, category: item.category, quantity: item.quantity, unit_price: item.unit_price, inventory_product_id: item.inventory_product_id, service_id: item.service_id, doctor_id: item.professional_doctor_id, consultation_record_id: item.consultation_record_id, service_date: item.service_date, period_start: item.service_period_start, period_end: item.service_period_end, supporting_reason: item.supporting_reason })), p_discount: adjustments.approved_discount, p_discount_reason: adjustments.discount_reason, p_taxes: adjustments.taxes_and_fees, p_finalize: true });
      if (!isCurrent()) return;
      if (finalizeError?.code === "PGRST202") throw new Error("The billing save RPC is missing from Supabase. Apply migration 20261220000000_restore_billing_save_patient_bill_rpc.sql and reload the schema cache, then retry.");
      if (finalizeError) throw finalizeError;
      setNotice(`Bill ${bill.bill_number} finalized and made available to the patient.`);
      await Promise.all([refreshPatientBills(patient.patient_id),refreshProfessionalFees(patient.patient_id)]);
    } catch (e) { if (isCurrent()) setError(displayError(e)); }
    finally { savingRequest.current=false;if (isCurrent()) setLoading(false); }
  }

  async function viewBill(bill: Bill) {
    if (!supabase || !patient || !isValidUuid(patient.patient_id) || !isValidUuid(bill.id)) return;
    const isCurrent = patientRequests.current.snapshot();
    setLoading(true); setError("");
    try {
      const { data, error: chargeError } = await supabase.from("patient_medical_charges").select("id,item_name,category,quantity,unit_price").eq("bill_id", bill.id).eq("patient_id", patient.patient_id).eq("is_demo", false).order("charged_at");
      if (!isCurrent()) return;
      if (chargeError) throw chargeError;
      setViewing({ bill, charges: (data || []) as BillCharge[] });
    } catch (e) { if (isCurrent()) setError(displayError(e)); }
    finally { if (isCurrent()) setLoading(false); }
  }

  function cancelChanges() {
    if ((lines.length || billId) && !window.confirm("Discard the current unsaved billing changes?")) return;
    setLines([]); setBillId(null); setBillNumber(""); setDiscount("0"); setDiscountReason(""); setTaxes("0"); setPayments(0); initialRef.current = null; setError(""); setNotice("Changes cancelled.");
  }

  function clearSelectedPatient() {
    setLineErrors({});setApprovals([]);setCanApprove(false);setApprovalError('');
    patientRequests.current.clear();
    setLoading(false); setPatientCareError(""); setRoomCharges([]); setViewing(null); setAssigningRoom(false);
    setPatient(null); setConsultations([]); setLines([]); setBillId(null); setBillNumber(""); setDiscount("0"); setDiscountReason(""); setTaxes("0"); setPayments(0); setPaymentTotalsByBill({}); setBills([]);
    setDoctorId(""); setAssigningDoctor(false); setCareManagementAllowed(false); initialRef.current=null; setError(""); setNotice("");
  }

  const currentAdmission=patient?.admission_status==="admitted"&&!patient.discharged_at;
  const roomHistory=patient?.admissions||[];

  return <div className="mw-billing-layout">
    <div className="mw-billing-form">
      <section className="mw-bill-card"><div className="mw-bill-section-head"><span className="mw-bill-step">1</span><div><h2>Select Patient</h2><p>Search the patient directory and confirm their current care details.</p></div></div>
        <div className="mw-bill-search"><Search size={18}/><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patient by name, patient ID, or contact number..."/></div>
        {!patient && <div className="mw-bill-patient-results">{patients.length ? patients.map((p) => <button type="button" key={p.patient_id} onClick={() => void selectPatient(p)}><UserRound size={18}/><span><strong>{p.full_name || "Patient"}</strong><small>{p.patient_id} · {p.phone || p.email || "Contact unavailable"}</small></span></button>) : <p>{search ? "No matching patients." : "Search to find a patient."}</p>}</div>}
        {patient && <div className="mw-patient-detail-grid"><div className="mw-patient-name"><span><UserRound/></span><div><strong>{patient.full_name || "Patient"}</strong><small>{patient.patient_id}</small></div><button type="button" onClick={clearSelectedPatient}>Change</button></div>
          <div><small>Active admission</small><strong>{loading?"Loading admission details…":patientCareError?"Admission details unavailable":currentAdmission?patient.admission_id+" · "+patient.admission_status:"No active admission."}</strong></div>
          <div><small>Admission / discharge</small><strong>{patientCareError?patientCareError:patient.admission_id?(patient.admitted_at||"Date unavailable")+(patient.discharged_at?" · Discharged "+patient.discharged_at:""):"No admission record."}</strong></div>
          <div><small>Admission history</small><strong>{patientCareError?"Could not load history":roomHistory.filter(a=>a.status!=="admitted"||a.discharged_at).length+" historical admission(s)"}</strong></div>
          <div><small>Assigned doctor</small><strong>{patientCareError?"Admission details unavailable":patient.doctor_name||"No assigned doctor"}{!patientCareError&&patient.specialty?" ? "+patient.specialty:""}</strong></div><div><small>Assigned room</small><strong>{patientCareError?"Admission details unavailable":patient.room_number?patient.room_number+" ? "+(patient.room_type||"Type unavailable")+" ? "+(patient.bed_number||"Bed unavailable"):currentAdmission?"No room assigned.":"No active room assignment."}</strong></div></div>}
        {patient&&roomHistory.length>1&&<details className="mw-patient-admission-history"><summary>Admission history ({roomHistory.length})</summary>{roomHistory.map(admission=><p key={admission.id}>{admission.id} · {admission.status} · {admission.admitted_at||"Date unavailable"}{admission.discharged_at?" to "+admission.discharged_at:""}{admission.is_demo?" · Demo":""}</p>)}</details>}
      </section>

      {approvalError&&<p className="mw-billing-alert error" role="alert">{approvalError}</p>}
      {patient&&<BillingAuthorizations key={patient.patient_id} patientId={patient.patient_id} approvals={approvals} canApprove={canApprove} billId={billId} services={services} consultations={consultations} admissions={patient.admissions||[]} disabled={saving||loading} onRefresh={()=>refreshApprovals(patient.patient_id)} onAdd={addApprovedCharge}/>}

      <section className="mw-bill-card"><div className="mw-bill-section-head"><span className="mw-bill-step">2</span><div><h2>Medical Products &amp; Supplies</h2><p>Add medicines and medical supplies actually used by the patient.</p></div></div>
        <div className="mw-bill-search"><Search size={17}/><input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search products"/></div>
        <div className="mw-bill-catalog">{filteredProducts.slice(0, 16).map((product) => <button type="button" key={product.id} disabled={!product.available || product.stock <= 0} onClick={() => addProduct(product)} className="mw-bill-product">{product.image_url ? <img src={product.image_url} alt=""/> : <span className="mw-bill-product-placeholder"><ImagePlus size={20}/></span>}<span><strong>{product.name}</strong><small>{product.category || "Medical supply"} · Stock {product.stock}</small><b>{currency.format(Number(product.price))}</b></span><Plus size={18}/></button>)}</div>
        {lines.filter((l) => ["medicine", "medical_supply"].includes(l.category)).map((line) => <ChargeRow key={line.key} line={line} errors={lineErrors[line.key]} approvals={approvals} disabled={saving} billId={billId} onChange={updateLine} onRemove={() => setLines((old) => old.filter((l) => l.key !== line.key))}/>)}
      </section>

      <section className="mw-bill-card"><div className="mw-bill-section-head"><span className="mw-bill-step">3</span><div><h2>Room &amp; Accommodation Charges</h2><p>Room history comes from each admission&apos;s linked hospital room.</p></div><button type="button" className="mw-room-refresh" onClick={()=>void refreshRoomAssignment()} disabled={!patient||loading}><RefreshCw size={15}/>Refresh</button></div>
        {!patient?<div className="mw-bill-empty"><BedDouble size={18}/>Select a patient to view admission, room, and doctor details.</div>:patientCareError?<div className="mw-billing-alert error" role="alert">Room and bed details unavailable because the admission query failed: {patientCareError}</div>:<>
          {currentAdmission&&patient.room_id?<div className="mw-room-facts"><h3>Current Room Assignment</h3><div><small>Room</small><strong>{patient.room_number||"Not recorded"}</strong></div><div><small>Bed</small><strong>{patient.bed_number||"Not recorded"}</strong></div><div><small>Type</small><strong>{patient.room_type||"Not recorded"}</strong></div><div><small>Room status</small><strong>{patient.room_status||"Not recorded"}</strong></div><div><small>Admission date</small><strong>{patient.admitted_at||"Not recorded"}</strong></div></div>:null}
          {roomHistory.filter(a=>a.room&&(a.status!=="admitted"||a.discharged_at)).map(a=><div className="mw-room-facts" key={a.id}><h3>Previous Room Assignment {a.is_demo&&"· Record: Demo"}</h3><div><small>Room</small><strong>{a.room.room_number||"Not recorded"}</strong></div><div><small>Bed</small><strong>{a.room.bed_number||"Not recorded"}</strong></div><div><small>Type</small><strong>{a.room.room_type||"Not recorded"}</strong></div><div><small>Room status</small><strong>{a.room.status||"Not recorded"}</strong></div><div><small>Admission date</small><strong>{a.admitted_at||"Not recorded"}</strong></div><div><small>Admission status</small><strong>{a.status||"Not recorded"}</strong></div><div><small>Discharge date</small><strong>{a.discharged_at||"Not recorded"}</strong></div></div>)}
          {roomHistory.filter(a=>!a.room_id).map(a=><p className="mw-room-unassigned" key={a.id}>Admission {a.id}: No room assigned to this admission.</p>)}
          {!roomHistory.length&&<p className="mw-room-unassigned">No admission record.</p>}
          {currentAdmission&&!patient.room_id&&<p className="mw-room-unassigned">No room assigned to this admission.</p>}
          {lines.filter(line=>line.category==='room').map(line=><ChargeRow key={line.key} line={line} errors={lineErrors[line.key]} approvals={approvals} disabled={saving} billId={billId} onChange={updateLine} onRemove={()=>setLines(old=>old.filter(item=>item.key!==line.key))}/>)}
          {roomCharges.length>0&&<div className="mw-room-facts"><h3>Verified Accommodation Charges</h3>{roomCharges.map(charge=><div key={charge.id}><small>{charge.item_name} ? {charge.quantity} ? {currency.format(charge.unit_price)}</small><strong>{currency.format(Number(charge.quantity)*Number(charge.unit_price))}</strong></div>)}</div>}
          {currentAdmission&&!patient.is_demo&&<button type="button" className="mw-room-assign-trigger" disabled={loading||saving} onClick={()=>setAssigningRoom(true)}><ArrowRightLeft size={16}/>{patient.room_id?"Change Room & Bed":"Assign Room & Bed"}</button>}
        </>}
      </section>

      <section className="mw-bill-card"><div className="mw-bill-section-head"><span className="mw-bill-step">4</span><div><h2>Doctor &amp; Professional Fees</h2><p>Manage the patient&apos;s assigned doctor and add fees from verified care records.</p></div></div>
        {!patient?<div className="mw-bill-empty"><Stethoscope size={18}/>Select a patient to view admission, room, and doctor details.</div>:patientCareError?<div className="mw-billing-alert error" role="alert">Doctor assignment details unavailable because the admission query failed: {patientCareError}</div>:<div className="mw-assigned-doctor-card">
          <div className="mw-assigned-doctor-profile">{patient.doctor_photo_url?<img src={patient.doctor_photo_url} alt={`Dr. ${patient.doctor_name||"Assigned doctor"}`}/>:<span className="mw-assigned-doctor-placeholder"><Stethoscope size={28}/></span>}<div><small>{currentAdmission?"CURRENT ASSIGNED DOCTOR":"PREVIOUS ATTENDING DOCTOR"}{patient.doctor_is_demo?" ? RECORD: DEMO":""}</small><h3>{patient.doctor_name||"No doctor assigned to this admission."}</h3>{patient.doctor_id&&<p>{patient.specialty||"Specialty not listed"}</p>}</div></div>
          {patient.doctor_id&&<dl className="mw-assigned-doctor-facts"><div><dt>Department</dt><dd>{patient.doctor_department||patient.department||"Not recorded"}</dd></div><div><dt>Sub-specialization</dt><dd>{patient.doctor_sub_specialization||"Not recorded"}</dd></div><div><dt>Assignment status</dt><dd>{currentAdmission?"Active admission":"Historical admission"}</dd></div><div><dt>Admission date</dt><dd>{patient.admitted_at||"Not recorded"}</dd></div>{patient.doctor_consultation_fee!=null&&<div><dt>Configured Consultation Fee</dt><dd>{currency.format(Number(patient.doctor_consultation_fee))} · Display only</dd></div>}<div><dt>Admission</dt><dd>{patient.admission_number||"Care assignment"}</dd></div></dl>}
          {currentAdmission&&!patient.is_demo&&careManagementAllowed?<button className="mw-doctor-assignment-trigger" type="button" onClick={()=>setAssigningDoctor(open=>!open)} disabled={loading||doctorSaving}>{patient.doctor_id?"Change Doctor":"Assign Doctor"}</button>:currentAdmission&&!patient.is_demo?<p className="mw-doctor-permission-note">Care management permission is required to change this assignment.</p>:null}
          {assigningDoctor&&careManagementAllowed&&<div className="mw-doctor-assignment-form"><label>Active doctor<select value={doctorId} onChange={event=>setDoctorId(event.target.value)} required><option value="">Choose an active doctor</option>{doctors.map(doctor=><option key={doctor.id} value={doctor.id}>{doctor.display_name}{doctor.specialty?` · ${doctor.specialty}`:""}</option>)}</select></label><div><button type="button" onClick={()=>void saveDoctorAssignment()} disabled={doctorSaving||!doctorId}>{doctorSaving?<LoaderCircle className="mw-spin" size={15}/>:null}Save assignment</button><button type="button" onClick={()=>setAssigningDoctor(false)} disabled={doctorSaving}>Cancel</button></div></div>}
        </div>}
        <h3 className="mw-consultation-heading">Consultation &amp; Professional Fees</h3><DoctorAdder approvals={approvals} consultations={consultations} lines={lines} billId={billId} onAdd={addDoctorFee}/>
        {lines.filter((l) => l.category === "consultation").map((line) => <ChargeRow key={line.key} line={line} errors={lineErrors[line.key]} approvals={approvals} disabled={saving} billId={billId} onChange={updateLine} onRemove={() => setLines((old) => old.filter((l) => l.key !== line.key))}/>)}
      </section>

      <section className="mw-bill-card"><div className="mw-bill-section-head"><span className="mw-bill-step">5</span><div><h2>Hospital Services &amp; Procedures</h2><p>Add completed services with an authorized, verified rate.</p></div></div>
        <div className="mw-bill-search"><Search size={17}/><input value={serviceSearch} onChange={(e) => setServiceSearch(e.target.value)} placeholder="Search service"/></div><div className="mw-bill-service-list">{filteredServices.slice(0, 10).map((service) => <button type="button" key={service.id} onClick={() => addService(service)}><span>{service.name}</span><Plus size={17}/></button>)}</div>
        {lines.filter((l) => l.serviceId).map((line) => <ChargeRow key={line.key} line={line} errors={lineErrors[line.key]} approvals={approvals} disabled={saving} billId={billId} onChange={updateLine} onRemove={() => setLines((old) => old.filter((l) => l.key !== line.key))}/>)}
      </section>

      <section className="mw-bill-card"><div className="mw-bill-section-head"><span className="mw-bill-step">6</span><div><h2>Additional Hospital Charges</h2><p>Enter other genuine charges with a supporting reason.</p></div><button className="mw-bill-secondary" type="button" onClick={() => setLines((old) => [...old, emptyLine("other")])}><Plus size={16}/>Add Charge</button></div>
        {lines.filter((l) => ["other","laboratory","diagnostic"].includes(l.category)).map((line) => <ChargeRow key={line.key} line={line} errors={lineErrors[line.key]} approvals={approvals} disabled={saving} billId={billId} onChange={updateLine} onRemove={() => setLines((old) => old.filter((l) => l.key !== line.key))} additional/>)}
      </section>
    </div>

    <aside className="mw-billing-aside"><section className="mw-billing-summary"><div className="mw-bill-section-head"><FileText size={20}/><div><h2>Billing Summary</h2><p>{billNumber ? `Bill ${billNumber}` : "Live estimate"}</p></div></div>
      <SummaryRow label="Medical Products Total" value={totals.medicine}/><SummaryRow label="Room Charges Total" value={totals.room}/><SummaryRow label="Doctor Fees Total" value={totals.consultation}/><SummaryRow label="Hospital Services Total" value={totals.services}/><SummaryRow label="Additional Charges Total" value={totals.additional}/>
      <div className="mw-summary-divider"/><SummaryRow label="Subtotal" value={totals.subtotal}/><label className="mw-summary-adjustment">Discount<input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)}/></label>{Number(discount) > 0 && <label className="mw-summary-note">Discount approval reason<input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Authorization / reason"/></label>}<label className="mw-summary-adjustment">Taxes / Fees<input type="number" min="0" step="0.01" value={taxes} onChange={(e) => setTaxes(e.target.value)}/></label>
      <div className="mw-summary-highlight"><span>Total Bill Amount</span><strong>{currency.format(totals.total)}</strong></div><SummaryRow label="Verified Payments" value={payments}/><div className="mw-summary-outstanding"><span>Outstanding Balance</span><strong>{currency.format(totals.due)}</strong></div>
      {error && <div className="mw-billing-alert error" role="alert">{error}</div>}{notice && <div className="mw-billing-alert success" role="status">{notice}</div>}
      <button className="mw-bill-draft" type="button" disabled={!patient || saving || !lines.length} onClick={() => void save(false)}>{saving ? <LoaderCircle className="mw-spin" size={17}/> : null}Save as Draft</button><button className="mw-bill-finalize" type="button" disabled={!patient || saving || !lines.length} onClick={() => void save(true)}>{saving ? <LoaderCircle className="mw-spin" size={17}/> : null}Finalize Patient Bill</button><button className="mw-bill-cancel" type="button" disabled={saving} onClick={cancelChanges}>Cancel</button>
    </section>
    <section className="mw-billing-summary mw-recent-bills"><div className="mw-bill-section-head"><FileText size={19}/><div><h2>Recent Bills for This Patient</h2><p>{patient ? patient.full_name : "Select a patient to view bills"}</p></div></div>{!patient ? <p className="mw-bill-empty">Patient bills appear here.</p> : bills.length ? bills.map((bill) => <div className="mw-recent-bill" key={bill.id}><div><strong>{bill.bill_number}</strong><small>{new Date(bill.issued_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })} · {bill.payment_approved_at ? bill.status : "Draft"}</small></div><b>{currency.format(Number(bill.total_amount))}</b><div className="mw-recent-actions"><button type="button" onClick={() => void viewBill(bill)}>View Bill</button>{!bill.payment_approved_at ? <><button type="button" onClick={() => void openDraft(bill)}>Edit Draft</button><button type="button" onClick={() => void finalizeDraft(bill)} disabled={loading}>Finalize Draft</button></> : <button type="button" onClick={() => { void viewBill(bill).then(() => window.setTimeout(() => window.print(), 200)); }}>Print Bill</button>}</div></div>) : <p className="mw-bill-empty">No bills found for this patient.</p>}</section></aside>
    {assigningRoom&&patient&&<RoomBedAssignmentDrawer patient={patient} onClose={()=>setAssigningRoom(false)} onAssigned={refreshPatientCare}/>}
    {viewing && <div className="mw-bill-modal-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setViewing(null); }}><section className="mw-bill-modal mw-print-bill" role="dialog" aria-modal="true" aria-labelledby="mw-view-bill-title"><div className="mw-bill-modal-actions"><button type="button" onClick={() => window.print()}>Print Bill</button><button type="button" onClick={() => setViewing(null)}>Close</button></div><h2 id="mw-view-bill-title">Patient Bill · {viewing.bill.bill_number}</h2><p>{patient?.full_name} · {new Date(viewing.bill.issued_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</p><table><thead><tr><th>Charge</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>{viewing.charges.map((charge) => <tr key={charge.id}><td>{charge.item_name}</td><td>{charge.quantity}</td><td>{currency.format(Number(charge.unit_price))}</td><td>{currency.format(Number(charge.quantity) * Number(charge.unit_price))}</td></tr>)}</tbody></table><strong className="mw-print-total">Bill Total: {currency.format(Number(viewing.bill.total_amount))}</strong></section></div>}
  </div>;
}

function SummaryRow({ label, value }: { label: string; value: number }) { return <div className="mw-summary-row"><span>{label}</span><strong>{currency.format(value)}</strong></div>; }
function ChargeRow({ line, onChange, onRemove, additional = false, errors = {}, approvals, billId, disabled = false }: { line: Line; onChange: (key: string, updates: Partial<Line>) => void; onRemove: () => void; additional?: boolean; errors?: Record<string,string>; approvals: BillingAuthorization[]; billId: string|null; disabled?: boolean }) {
  const product=['medicine','medical_supply'].includes(line.category);
  const candidates=approvals.filter(item=>item.category===line.category&&(!item.used_bill_id||item.used_bill_id===billId));
  const errorFor=(field:string)=>errors[field]?<small className="mw-charge-field-error" id={line.key+'-'+field+'-error'} role="alert">{errors[field]}</small>:null;
  const inputProps=(field:string)=>({disabled,'aria-invalid':Boolean(errors[field]),'aria-describedby':errors[field]?line.key+'-'+field+'-error':undefined});
  return <div className="mw-charge-row mw-validated-charge-row">
    <label>Description<input {...inputProps('description')} value={line.description} onChange={e=>onChange(line.key,{description:e.target.value})} placeholder="Verified charge description"/>{errorFor('description')}</label>
    {!product&&<label className="mw-charge-source">Financial authorization<select {...inputProps('authorizationId')} value={line.authorizationId||''} onChange={e=>{const selected=candidates.find(item=>item.id===e.target.value);if(selected)onChange(line.key,lineFromAuthorization(selected,line.key,today()));}}><option value="">Select approved charge source</option>{line.authorizationId&&!candidates.some(item=>item.id===line.authorizationId)&&<option value={line.authorizationId}>Authorization unavailable - refresh approvals</option>}{candidates.map(item=><option key={item.id} value={item.id}>{item.description} - {currency.format(Number(item.unit_price))}</option>)}</select>{errorFor('authorizationId')}</label>}
    <label>{additional?'Supporting reason':'Supporting details / reference'}<input {...inputProps('reason')} value={line.reason||''} onChange={e=>onChange(line.key,{reason:e.target.value})} placeholder={additional?'Required reason / authorization basis':'Optional supporting details'}/>{errorFor('reason')}</label>
    <label>Service date<input {...inputProps('date')} type="date" readOnly={!product&&Boolean(line.authorizationId)} value={line.date||today()} onChange={e=>onChange(line.key,{date:e.target.value})}/>{errorFor('date')}</label>
    <label>Qty<input {...inputProps('quantity')} inputMode="decimal" value={line.quantity} onChange={e=>onChange(line.key,{quantity:e.target.value})}/>{errorFor('quantity')}</label>
    <label>Verified unit price<input {...inputProps('unitPrice')} readOnly inputMode="decimal" value={line.unitPrice} placeholder="Select approved source"/>{errorFor('unitPrice')}</label>
    <strong>{currency.format(amount(line))}</strong><button aria-label="Remove charge" type="button" disabled={disabled} onClick={onRemove}><Trash2 size={17}/></button>
    {line.category==='room'&&<p className="mw-charge-wide">Approved stay: {line.periodStart||'Missing start'} to {line.periodEnd||'Missing end'}</p>}
    {['category','productId','serviceId','consultationRecordId','period'].map(field=>errors[field]?<p className="mw-charge-field-error mw-charge-wide" role="alert" key={field}>{errors[field]}</p>:null)}
  </div>;
}
function DoctorAdder({ consultations, lines, billId, approvals, onAdd }: { consultations: Consultation[]; lines: Line[]; billId: string | null; approvals: BillingAuthorization[]; onAdd: (recordId: string, fee: string, authorizationId: string) => void }) {
  const [selectedApproval,setSelectedApproval]=useState<Record<string,string>>({});
  if(!consultations.length)return <div className="mw-bill-empty"><Stethoscope size={18}/>No released consultation records.</div>;
  return <div className="mw-consultation-table-wrap"><table className="mw-consultation-table"><thead><tr><th>Date</th><th>Consultation / Treatment</th><th>Doctor</th><th>Verified professional fee</th><th>Action</th></tr></thead><tbody>{consultations.map(record=>{
    const line=lines.find(item=>item.consultationRecordId===record.record_id);
    const sameDraft=Boolean(billId&&record.bill_id===billId);
    const chargedElsewhere=Boolean(record.alreadyCharged&&!sameDraft);
    const choices=approvals.filter(item=>item.category==='consultation'&&item.consultation_record_id===record.record_id&&(!item.used_bill_id||item.used_bill_id===billId));
    const approved=choices.find(item=>item.id===selectedApproval[record.record_id])||choices[0];
    return <tr key={record.record_id}><td>{new Date(record.occurred_at).toLocaleDateString('en-PH',{timeZone:'Asia/Manila'})}</td><td>{record.reason||record.record_type.replaceAll('_',' ')}</td><td>{record.doctor_name}<small>{record.specialty}</small></td><td>{chargedElsewhere?currency.format(Number(record.fee||0)):line?currency.format(Number(line.unitPrice)):choices.length?<select aria-label={'Approved fee for '+(record.reason||record.record_type)} value={approved?.id||''} onChange={event=>setSelectedApproval(old=>({...old,[record.record_id]:event.target.value}))}>{choices.map(item=><option key={item.id} value={item.id}>{currency.format(Number(item.unit_price))} ? {item.description}</option>)}</select>:<small>Doctor fee: Verified financial authorization is required.</small>}</td><td>{chargedElsewhere?<span className="mw-professional-fee-status">Already billed</span>:line?<span className="mw-professional-fee-status">In this draft</span>:<button type="button" className="mw-professional-fee-add" disabled={!approved} onClick={()=>approved&&onAdd(record.record_id,String(approved.unit_price),approved.id)}><Plus size={14}/>Add</button>}</td></tr>;
  })}</tbody></table></div>;
}

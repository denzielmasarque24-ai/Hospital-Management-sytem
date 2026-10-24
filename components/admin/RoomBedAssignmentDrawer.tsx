"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { isValidUuid } from "@/lib/admin/billing-patient.mjs";

type Patient={patient_id:string;full_name:string|null;admission_id?:string|null;admission_status?:string|null;room_id?:string|null};
type Room={id:string;room_number:string|null;room_type:string|null;bed_number:string|null;status:string|null;daily_rate?:number|null;is_demo?:boolean};
const message=(e:unknown)=>e instanceof Error?e.message:(e as {message?:string})?.message||"The request failed. Please retry.";

export function RoomBedAssignmentDrawer({patient,onClose,onAssigned}:{patient:Patient;onClose:()=>void;onAssigned:()=>Promise<void>}) {
  const [rows,setRows]=useState<Room[]>([]),[search,setSearch]=useState(""),[roomId,setRoomId]=useState("");
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const loadRequest = useRef(0);
  const load=useCallback(async()=>{
    if(!supabase){setError("Supabase is not configured.");setLoading(false);return;}
    setLoading(true);setError("");
    const request = ++loadRequest.current;
    try{
      const [{data:rooms,error:roomsError},{data:admissions,error:admissionsError}]=await Promise.all([
        supabase.from("hospital_rooms").select("id,room_number,room_type,bed_number,status,daily_rate,is_demo").order("room_number"),
        supabase.from("patient_admissions").select("room_id").eq("status","admitted").is("discharged_at",null).not("room_id","is",null),
      ]);
      if (request !== loadRequest.current) return;
      if(roomsError)throw roomsError;if(admissionsError)throw admissionsError;
      const occupied=new Set((admissions||[]).map(row=>row.room_id));const term=search.trim().toLowerCase();
      setRows(((rooms||[]) as Room[]).filter(room=>room.is_demo===false&&!occupied.has(room.id)&&String(room.status||"").toLowerCase()==="available"&&[room.room_number,room.room_type,room.bed_number].some(value=>String(value||"").toLowerCase().includes(term))));setRoomId("");
    }catch(cause){if(request===loadRequest.current)setError(message(cause));}finally{if(request===loadRequest.current)setLoading(false);}
  },[search]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),180);return()=>{window.clearTimeout(timer);loadRequest.current+=1;};},[load]);
  const available=useMemo(()=>rows,[rows]);
  async function save(){
    if(!supabase||!patient.admission_id){setError("An active admission is required before assigning a room.");return;}
    if(!isValidUuid(patient.patient_id)||!isValidUuid(patient.admission_id)||!isValidUuid(roomId)){setError("Choose a valid patient, admission, and available room and bed.");return;}
    setSaving(true);setError("");
    try{
      const chosen=available.find(room=>room.id===roomId);if(!chosen||chosen.is_demo!==false)throw new Error("Choose an available genuine room and bed.");
      const {data:updated,error:saveError}=await supabase.from("patient_admissions").update({room_id:roomId}).eq("id",patient.admission_id).eq("patient_id",patient.patient_id).eq("status","admitted").is("discharged_at",null).select("id").maybeSingle();
      if(saveError)throw saveError;if(!updated)throw new Error("The active admission was not updated. Check your assignment permission and retry.");
      await onAssigned();onClose();
    }catch(e){setError(message(e));}finally{setSaving(false);}
  }
  return <div className="mw-room-drawer-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><aside className="mw-room-drawer" role="dialog" aria-modal="true" aria-labelledby="mw-room-drawer-title">
    <header><div><span>ROOM &amp; BED ASSIGNMENT</span><h2 id="mw-room-drawer-title">Assign a room</h2><p>{patient.full_name||"Selected patient"}</p><small>Admission {patient.admission_id?patient.admission_status||"Active":"not selected"}</small></div><button type="button" onClick={onClose} aria-label="Close assignment drawer"><X size={20}/></button></header>
    {!patient.admission_id||patient.admission_status!=="admitted"?<div className="mw-room-drawer-alert" role="alert">An active admitted record without a room is required before assigning a room.</div>:<>
      <div className="mw-room-drawer-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search room, bed, or category"/><button type="button" onClick={()=>void load()} aria-label="Refresh rooms"><RefreshCw size={16}/></button></div>
      {error&&<div className="mw-room-drawer-alert" role="alert">{error}</div>}
      <div className="mw-room-drawer-body" aria-busy={loading}>{loading?<p className="mw-room-drawer-empty">Loading available rooms…</p>:available.length?available.map(room=><button type="button" key={room.id} className={`mw-room-option${roomId===room.id?" selected":""}`} onClick={()=>setRoomId(room.id)}><span><strong>Room {room.room_number||"—"} · {room.bed_number?( /^bed\b/i.test(String(room.bed_number))?room.bed_number:`Bed ${room.bed_number}`):"Bed —"}</strong><small>{room.room_type||"Type not recorded"}</small></span><span><BedDouble size={18}/> Available</span></button>):<p className="mw-room-drawer-empty">No available rooms match this search.</p>}</div>
    </>}
    {error&&(!patient.admission_id||patient.admission_status!=="admitted")&&<div className="mw-room-drawer-alert" role="alert">{error}</div>}
    <footer><button className="mw-room-drawer-cancel" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="mw-room-drawer-save" type="button" onClick={()=>void save()} disabled={saving||loading||!patient.admission_id||patient.admission_status!=="admitted"||!roomId}>{saving?<LoaderCircle className="mw-spin" size={16}/>:null}Confirm Assignment</button></footer>
  </aside></div>;
}

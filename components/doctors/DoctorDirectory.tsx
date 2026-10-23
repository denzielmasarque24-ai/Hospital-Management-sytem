"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, ChevronLeft, ChevronRight, RotateCcw, Search, Stethoscope } from "lucide-react";
import { DoctorAvatar } from "./DoctorAvatar";
import { usePublicDoctors } from "./usePublicDoctors";
import type { PublicDoctor } from "./usePublicDoctors";
import "./doctor-directory.css";

const pageSize = 10;
type SortField = "name" | "department" | "specialty" | "subSpecialization";
const columns: { label: string; field: SortField }[] = [
  { label: "Doctor's Name", field: "name" },
  { label: "Department", field: "department" },
  { label: "Specialization", field: "specialty" },
  { label: "Sub-Specialization", field: "subSpecialization" },
];
const fieldValue = (doctor: PublicDoctor, field: SortField) => doctor[field]?.trim() || "Not specified";

export function DoctorDirectory() {
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [department, setDepartment] = useState("");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const { doctors, loading, error, retry } = usePublicDoctors();

  const specialties = [...new Set(doctors.map(doctor => doctor.specialty).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const departments = [...new Set(doctors.map(doctor => doctor.department).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
  const filteredDoctors = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("en-PH");
    return doctors.filter(doctor =>
      (!specialty || doctor.specialty === specialty) &&
      (!department || (department === "__unspecified__" ? !doctor.department : doctor.department === department)) &&
      (!search || [doctor.name, doctor.department, doctor.specialty, doctor.subSpecialization].filter(Boolean).join(" ").toLocaleLowerCase("en-PH").includes(search))
    ).sort((a, b) => {
      const order = fieldValue(a, sortField).localeCompare(fieldValue(b, sortField), "en", { sensitivity: "base", numeric: true });
      return order ? (sortDirection === "asc" ? order : -order) : a.id.localeCompare(b.id);
    });
  }, [doctors, query, specialty, department, sortField, sortDirection]);
  const totalPages = Math.max(1, Math.ceil(filteredDoctors.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;
  const visible = filteredDoctors.slice(offset, offset + pageSize);
  const clearFilters = () => { setQuery(""); setDepartment(""); setSpecialty(""); setPage(1); };
  const sort = (field: SortField) => {
    setSortDirection(sortField === field && sortDirection === "asc" ? "desc" : "asc");
    setSortField(field); setPage(1);
  };

  return <section className="medwell-directory" aria-label="Doctors directory" aria-busy={loading}>
    <div className="directory-toolbar">
      <label className="directory-search"><Search size={18} aria-hidden="true"/><span className="directory-sr-only">Search doctors</span><input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search by doctor's name, department, or specialization..."/></label>
      <label className="directory-select"><span className="directory-sr-only">Department</span><select value={department} aria-label="Filter doctors by department" onChange={event => { setDepartment(event.target.value); setPage(1); }}><option value="">All Departments</option>{departments.map(value => <option value={value} key={value}>{value}</option>)}{doctors.some(doctor => !doctor.department) && <option value="__unspecified__">Not specified</option>}</select></label>
      <label className="directory-select"><span className="directory-sr-only">Specialization</span><select value={specialty} aria-label="Filter doctors by specialization" onChange={event => { setSpecialty(event.target.value); setPage(1); }}><option value="">All Specializations</option>{specialties.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <button type="button" className="directory-clear" onClick={clearFilters}><RotateCcw size={15} aria-hidden="true"/>Clear Filters</button>
    </div>

    {error ? <div className="directory-state directory-error" role="alert"><Stethoscope size={30} aria-hidden="true"/><h2>Doctor profiles are temporarily unavailable</h2><p>{error}</p><button className="directory-profile-button" type="button" onClick={retry}>Try Again</button></div> : <>
      {loading && <p className="directory-sr-only" role="status">Loading doctor profiles...</p>}
      <div className="directory-table-scroll" tabIndex={0} role="region" aria-label="Doctor listings">
        <table className="directory-table">
          <caption className="directory-sr-only">MedWell doctors, specialties, and booking options</caption>
          <colgroup><col className="directory-name-col"/><col className="directory-department-col"/><col className="directory-specialty-col"/><col className="directory-subspecialty-col"/><col className="directory-actions-col"/></colgroup>
          <thead><tr>{columns.map(({ label, field }) => <th scope="col" key={field} aria-sort={sortField === field ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><button type="button" onClick={() => sort(field)}>{label}{sortField === field ? sortDirection === "asc" ? <ArrowUp size={13} aria-hidden="true"/> : <ArrowDown size={13} aria-hidden="true"/> : <ArrowUpDown size={13} aria-hidden="true"/>}</button></th>)}<th scope="col">Actions</th></tr></thead>
          <tbody>{loading ? Array.from({ length: pageSize }, (_, index) => <tr key={index} className="directory-skeleton" aria-hidden="true"><td><i/><span/></td><td><span/></td><td><span/></td><td><span/></td><td><span/></td></tr>) : visible.map((doctor, index) => <tr key={doctor.id}>
            <td data-label="Doctor's Name"><div className="directory-doctor-cell"><span className="directory-row-number">{offset + index + 1}</span><DoctorAvatar image={doctor.image} fallbackImage={doctor.fallbackImage} name={doctor.name} showFallbackIcon={false}/><div><Link href={doctor.href} className="directory-doctor-name">{doctor.name}</Link>{doctor.isDemo && <small className="directory-demo">DEMO PROFILE</small>}</div></div></td>
            <td data-label="Department">{doctor.department || <span className="directory-unspecified">Not specified</span>}</td>
            <td data-label="Specialization">{doctor.specialty || <span className="directory-unspecified">Not specified</span>}</td>
            <td data-label="Sub-Specialization">{doctor.subSpecialization || <span className="directory-unspecified">Not specified</span>}</td>
            <td data-label="Actions"><div className="directory-row-actions"><Link href={doctor.href} className="directory-profile-button" aria-label={`View profile of ${doctor.name}`}>View Profile</Link>{doctor.canBook ? <Link href={`/appointment?doctor=${encodeURIComponent(doctor.id)}`} className="directory-book-button" aria-label={`Book an appointment with ${doctor.name}`}><CalendarDays size={14} aria-hidden="true"/>Book Appointment</Link> : <button type="button" className="directory-book-button" disabled><CalendarDays size={14} aria-hidden="true"/>Unavailable</button>}</div></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!loading && !visible.length && <div className="directory-state"><Search size={29} aria-hidden="true"/><h2>{doctors.length ? "No matching doctors" : "No doctor profiles available"}</h2><p>{doctors.length ? "Try a different name, department, or specialization." : "Please check back later or contact the hospital for assistance."}</p>{doctors.length > 0 && <button type="button" className="directory-profile-button" onClick={clearFilters}>Clear Filters</button>}</div>}
      {!loading && <footer className="directory-pagination"><p role="status">Showing <strong>{visible.length ? offset + 1 : 0}</strong> to <strong>{offset + visible.length}</strong> of <strong>{filteredDoctors.length}</strong> doctors</p><nav aria-label="Doctor directory pages"><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={15} aria-hidden="true"/>Previous</button>{Array.from({ length: totalPages }, (_, index) => index + 1).map(number => <button key={number} type="button" className={currentPage === number ? "is-active" : ""} aria-current={currentPage === number ? "page" : undefined} aria-label={`Page ${number}`} onClick={() => setPage(number)}>{number}</button>)}<button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight size={15} aria-hidden="true"/></button></nav></footer>}
    </>}
  </section>;
}

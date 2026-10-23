"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Armchair, Bath, BedDouble, Check, Lamp, MapPin, Refrigerator, Snowflake, Sofa, Tv, Wifi, X } from "lucide-react";
import { roomListings, roomRateLabel, type RoomAmenity, type RoomListing } from "@/lib/rooms/room-rates";
import { supabase } from "@/lib/supabase/client";

function RoomPhoto({ room, index }: { room: RoomListing; index: number }) {
  if (room.imageUrl) return <Image className="room-rate-photo" src={room.imageUrl} alt={`${room.name} room`} fill sizes="(max-width: 600px) 100vw, (max-width: 1024px) 50vw, 33vw" />;
  return <div className={`room-rate-photo-placeholder room-tone-${index % 5}`} role="img" aria-label={`Photo for ${room.name} has not been provided`}>
    <span className="room-photo-window" aria-hidden="true" />
    <span className="room-photo-bed" aria-hidden="true"><BedDouble size={54} strokeWidth={1.15} /></span>
    <span className="room-photo-caption">Room photo to be confirmed</span>
  </div>;
}

const amenityIcons: Record<string, typeof Wifi> = {
  wifi: Wifi,
  tv: Tv,
  smart: Tv,
  air: Snowflake,
  sofa: Sofa,
  refrigerator: Refrigerator,
  fridge: Refrigerator,
  bathroom: Bath,
  bath: Bath,
  table: Armchair,
  chair: Armchair,
  locker: BedDouble,
  bed: BedDouble,
  light: Lamp,
};

function amenityIcon(label: string) {
  const normalized = label.toLowerCase();
  const match = Object.entries(amenityIcons).find(([word]) => normalized.includes(word));
  return match?.[1] ?? Check;
}

function RoomAmenities({ amenities }: { amenities?: RoomAmenity[] }) {
  const items = amenities ?? [];
  if (!items.length) return <p className="room-rate-amenities-pending">Room amenities to be confirmed</p>;
  return <section className="room-amenities" aria-label="Verified room amenities">
    <div className="room-amenities-heading"><h3>Room amenities</h3></div>
    <ul className="room-rate-amenities">
      {items.map((amenity, index) => {
        const Icon = amenityIcon(amenity.label);
        return <li key={`${amenity.label}-${index}`}><Icon size={18} aria-hidden="true"/><span>{amenity.label}</span></li>;
      })}
    </ul>
  </section>;
}

export function RoomRatesGrid() {
  const [rooms, setRooms] = useState<RoomListing[]>([]);
  const [roomLoadError, setRoomLoadError] = useState("");
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<RoomListing | null>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const refreshRoomCategories = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setRoomLoadError("Room category information is unavailable because Supabase is not configured.");
      setLoadingCategories(false);
      return;
    }
    setLoadingCategories(true);
    setRoomLoadError("");
    try {
      const { data, error } = await client.from("room_categories")
        .select("id,name,slug,daily_rate,is_demo_rate,is_active")
        .eq("is_active", true)
        .order("daily_rate", { ascending: false });
      if (error) {
        console.error("[RoomRatesGrid] Room category query failed", {
          operation: "room_categories.select(active verified columns)",
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        setRooms([]);
        setRoomLoadError(`Room rates could not be loaded (${error.code ?? "database error"}): ${error.message}${error.details ? ` ${error.details}` : ""}${error.hint ? ` Hint: ${error.hint}` : ""}`);
        return;
      }
      if (!data) {
        setRooms([]);
        setRoomLoadError("Room category information was not returned by the database.");
        return;
      }
      const roomBySlug = new Map(roomListings.map((room) => [room.id, room]));
      const categories = data.map((row) => {
        const mappedRoom = roomBySlug.get(row.slug);
        const rate = row.daily_rate == null ? null : Number(row.daily_rate);
        return {
          ...(mappedRoom ?? { id: row.slug, name: row.name }),
          id: row.slug,
          name: row.name || mappedRoom?.name || "Hospital room",
          nightlyRate: rate !== null && Number.isFinite(rate) && rate >= 0 ? rate : null,
          isDemoRate: row.is_demo_rate === true && rate !== null,
          description: mappedRoom?.description,
          amenities: mappedRoom?.amenities ?? [],
        } satisfies RoomListing;
      });
      setRooms(categories);
    } catch (cause) {
      const failure = cause as { code?: string; message?: string; details?: string; hint?: string };
      console.error("[RoomRatesGrid] Room category request threw", {
        operation: "room_categories.select(active verified columns)",
        code: failure?.code,
        message: failure?.message ?? String(cause),
        details: failure?.details,
        hint: failure?.hint,
      });
      setRooms([]);
      setRoomLoadError(`Room rates could not be loaded: ${failure?.message ?? "The database request failed."}`);
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    void refreshRoomCategories();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshRoomCategories();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshRoomCategories]);

  useEffect(() => {
    if (!selectedRoom) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedRoom(null);
      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedRoom]);

  const activeSelectedRoom = selectedRoom ? rooms.find((room) => room.id === selectedRoom.id) ?? selectedRoom : null;

  useEffect(() => {
    if (!selectedRoom) lastTrigger.current?.focus();
  }, [selectedRoom]);

  return <>
    {roomLoadError ? <div className="room-rates-load-error" role="alert"><p>{roomLoadError}</p><button type="button" onClick={() => void refreshRoomCategories()} disabled={loadingCategories}>{loadingCategories ? "Refreshing…" : "Retry"}</button></div> : null}
    {loadingCategories ? <p role="status">Loading room categories…</p> : null}
    {!loadingCategories && !roomLoadError && rooms.length === 0 ? <div className="room-rates-empty-state" role="status">No active room categories are currently available.</div> : null}
    {!loadingCategories && !roomLoadError && rooms.length > 0 ? <div className="room-rates-grid">
      {rooms.map((room, index) => <article className="room-rate-card" key={room.id}>
        <div className="room-rate-media">
          <RoomPhoto room={room} index={index}/>
          {room.nightlyRate == null
            ? <span className="room-rate-badge">Rate to be confirmed</span>
            : <span className="room-rate-badge">
                {roomRateLabel(room.nightlyRate)}
                {room.isDemoRate ? <small>Sample rate</small> : null}
              </span>}
        </div>
        <div className="room-rate-card-body">
          <h2>{room.name}</h2>
          {room.branch ? <p className="room-rate-location"><MapPin size={14} aria-hidden="true"/>{room.branch} branch</p> : null}
          <p className="room-rate-description">{room.description || "Description to be confirmed by the hospital."}</p>
          <RoomAmenities amenities={room.amenities}/>
          <p className="room-rate-price">{roomRateLabel(room.nightlyRate)}</p>
          {room.isDemoRate ? <p className="room-rate-sample-caption">Sample rate — subject to hospital confirmation</p> : null}
          <div className="room-rate-card-footer">
            <button type="button" className="room-rate-details-button" onClick={(event) => { lastTrigger.current = event.currentTarget; setSelectedRoom(room); }}>More Details</button>
            <span className="room-rate-meta">{room.category || room.name}<br/>Availability to be confirmed</span>
          </div>
        </div>
      </article>)}
    </div> : null}

    {activeSelectedRoom ? <div className="room-rate-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedRoom(null); }}>
      <section className="room-rate-dialog" role="dialog" aria-modal="true" aria-labelledby="room-rate-dialog-title" tabIndex={-1} ref={dialogRef}>
        <button type="button" className="room-rate-dialog-close" aria-label="Close room details" onClick={() => setSelectedRoom(null)}><X size={19}/></button>
        <span className="room-rate-dialog-eyebrow">Patient room details</span>
        <h2 id="room-rate-dialog-title">{activeSelectedRoom.name}</h2>
        {activeSelectedRoom.branch ? <p className="room-rate-location"><MapPin size={14} aria-hidden="true"/>{activeSelectedRoom.branch} branch</p> : null}
        {activeSelectedRoom.imageUrl ? <div className="room-rate-detail-image"><Image src={activeSelectedRoom.imageUrl} alt={`${activeSelectedRoom.name} room`} fill sizes="(max-width: 560px) 100vw, 472px" className="room-rate-detail-photo" /></div> : null}
        <dl className="room-rate-detail-list">
          <div><dt>Daily rate</dt><dd>{roomRateLabel(activeSelectedRoom.nightlyRate)}</dd></div>
          <div><dt>Description</dt><dd>{activeSelectedRoom.description || "To be confirmed by the hospital."}</dd></div>
          <div><dt>Bed capacity</dt><dd>{typeof activeSelectedRoom.bedCapacity === "number" ? activeSelectedRoom.bedCapacity + (activeSelectedRoom.bedCapacity === 1 ? " bed" : " beds") : "To be confirmed"}</dd></div>
          <div><dt>Bathroom type</dt><dd>{activeSelectedRoom.bathroom ? activeSelectedRoom.bathroom.replace(/^./, (letter) => letter.toUpperCase()) : "To be confirmed"}</dd></div>
          <div><dt>Room category and size</dt><dd>{activeSelectedRoom.roomSizeSqm == null ? `${activeSelectedRoom.name} · Room size to be confirmed` : `${activeSelectedRoom.name} · ${activeSelectedRoom.roomSizeSqm.toFixed(2)} m²`}</dd></div>
          <div><dt>Availability</dt><dd>To be confirmed</dd></div>
        </dl>
        {activeSelectedRoom.isDemoRate ? <p className="room-rate-sample-caption room-rate-dialog-sample">Sample rate — subject to hospital confirmation</p> : null}
        <RoomAmenities amenities={activeSelectedRoom.amenities}/>
        <p className="room-rate-verification-note">This nightly rate applies to the room charge only. Medicines, consultations, laboratory tests, and other hospital charges are separate.</p>
        <p className="room-rate-verification-note">Room specifications or availability marked “To be confirmed” have not yet been verified by the hospital.</p>
      </section>
    </div> : null}
  </>;
}

export type RoomAmenity = { label: string };

export type RoomListing = {
  id: string;
  name: string;
  branch?: string;
  description?: string;
  nightlyRate?: number | null;
  isDemoRate?: boolean;
  imageUrl?: string;
  amenities?: RoomAmenity[];
  bedCapacity?: number | null;
  airConditioning?: boolean;
  wifi?: boolean;
  bathroom?: "private" | "shared" | null;
  category?: string;
  roomSizeSqm?: number | null;
};

export const roomListings: RoomListing[] = [
  { id: "premier-suite", name: "Premier Suite", imageUrl: "/images/rooms/Luxury Premier Hospital Suite.png" },
  { id: "superior-suite", name: "Superior Suite", imageUrl: "/images/rooms/Medwell Superior Suite Interior.png" },
  { id: "semi-suite-room", name: "Semi-Suite Room", imageUrl: "/images/rooms/Modern Medwell Hospital Semi-Suite.png" },
  { id: "junior-suite", name: "Junior Suite", imageUrl: "/images/rooms/Warm Modern Medwell Junior Suite.png" },
  { id: "regular-private-new", name: "Regular Private New", imageUrl: "/images/rooms/Modern Sage-Toned Hospital Private Room.png" },
  { id: "regular-private", name: "Regular Private", imageUrl: "/images/rooms/regular.png" },
  { id: "semi-private-building-a-b", name: "Semi-Private Building A/B", imageUrl: "/images/rooms/Building A_B Semi-Private Rooms.png" },
  { id: "ward", name: "Ward", imageUrl: "/images/rooms/Modern Hospital Ward Interior.png" },
  { id: "premier-suite-mandaue", name: "Premier Suite – Mandaue", branch: "Mandaue", imageUrl: "/images/rooms/Luxury Premier Hospital Suite.png" },
];

export function roomRateLabel(rate?: number | null) {
  return typeof rate === "number" && Number.isFinite(rate) && rate >= 0
    ? `${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rate)} / day`
    : "Rate to be confirmed";
}


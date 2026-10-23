/**
 * Editable drafts, independent of user accounts and the doctors table.
 * Fill in hospital-approved details and a correctly matched, licensed portrait.
 * Set verified and published only after hospital administrator confirmation.
 * Sample drafts render only in the development preview and are labeled explicitly.
 * Production renders only verified, published profiles from leadershipProfiles.
 */
export type LeadershipProfile = {
  id: string;
  name: string;
  role: string;
  ownerTitle: string;
  specialty: string;
  department: string;
  description: string;
  image: string | null;
  verified: boolean;
  published: boolean;
};

// Production content is deliberately empty until the hospital confirms profiles.
export const leadershipProfiles: LeadershipProfile[] = [];

// Local design samples with illustrative portraits, not verified photographs of these leaders.
// Never included in the production display list.
export const draftLeadershipProfiles: LeadershipProfile[] = [
  {
    id: "leadership-1", name: "Dr. Denziel Masarque", role: "Chairman & President", ownerTitle: "Hospital Owner",
    specialty: "Internal Medicine", department: "Internal Medicine Department",
    description: "Provides strategic leadership focused on accessible, quality, and patient-centered healthcare.",
    image: "/images/p1.png", verified: false, published: false,
  },
  {
    id: "leadership-2", name: "Dr. Maria Santos", role: "Vice President", ownerTitle: "Co-Owner",
    specialty: "Pediatrics", department: "Pediatrics Department",
    description: "Supports hospital leadership, clinical collaboration, and quality healthcare services for families and children.",
    image: "/images/p2.png", verified: false, published: false,
  },
  {
    id: "leadership-3", name: "Dr. Juan Reyes", role: "Physician-Owner", ownerTitle: "Co-Owner",
    specialty: "Cardiology", department: "Cardiology Department",
    description: "Contributes to clinical development, cardiovascular care, patient safety, and continuous service improvement.",
    image: "/images/p3.png", verified: false, published: false,
  },
];

export function isPublishedLeader(profile: LeadershipProfile) {
  return profile.published && profile.verified && Boolean(
    profile.name.trim() && profile.role.trim() && profile.ownerTitle.trim() && profile.specialty.trim()
    && profile.department.trim() && profile.description.trim()
  );
}

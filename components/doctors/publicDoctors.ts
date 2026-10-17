export type PublicDoctor = {
  name: string;
  specialty: string;
  experience: string;
  availability: string;
  image: string;
};

export const PUBLIC_DOCTORS: PublicDoctor[] = [
  { name: "Dr. Maria Santos", specialty: "General Medicine", experience: "12 years experience", availability: "Available Today", image: "/images/doctors/D1.jpg" },
  { name: "Dr. John Reyes", specialty: "Cardiology", experience: "15 years experience", availability: "Available Today", image: "/images/doctors/D2.jpg" },
  { name: "Dr. Angela Cruz", specialty: "Pediatrics", experience: "10 years experience", availability: "Available This Week", image: "/images/doctors/D3.jpg" },
  { name: "Dr. Michael Garcia", specialty: "Internal Medicine", experience: "14 years experience", availability: "Available Monday", image: "/images/doctors/D4.jpg" },
  { name: "Dr. Sophia Martinez", specialty: "Dermatology", experience: "9 years experience", availability: "Available Friday", image: "/images/doctors/D5.jpg" },
  { name: "Dr. Daniel Aquino", specialty: "Orthopedics", experience: "11 years experience", availability: "Available Tomorrow", image: "/images/doctors/D6.jpg" },
  { name: "Dr. Christine Lopez", specialty: "Obstetrics & Gynecology", experience: "13 years experience", availability: "Available Wednesday", image: "/images/doctors/D7.jpg" },
];

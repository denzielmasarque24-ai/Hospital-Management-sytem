import type { Metadata } from "next";

import { AuthPage } from "@/components/auth/AuthPage";

export const metadata: Metadata = {
  title: "Register",
  description: "Create a MediWell Hospital account.",
};

export default function RegisterPage() {
  return <AuthPage mode="register" />;
}

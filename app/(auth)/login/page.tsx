import type { Metadata } from "next";

import { AuthPage } from "@/components/auth/AuthPage";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to your MediWell Hospital account.",
};

export default function LoginPage() {
  return <AuthPage mode="login" />;
}

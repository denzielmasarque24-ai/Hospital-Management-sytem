import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your MedWell Medical Hospital account.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}

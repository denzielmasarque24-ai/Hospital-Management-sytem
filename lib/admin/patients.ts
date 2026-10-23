import { supabase } from "@/lib/supabase/client";

export type PatientRecord = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string | null;
};

type PatientDirectoryRow = {
  patient_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  registered_at?: string | null;
  total_count?: number | string | null;
};

function asDatabaseError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  return new Error([
    error.code ? `(${error.code})` : "",
    error.message || "Database request failed.",
    error.details,
    error.hint ? `Hint: ${error.hint}` : "",
  ].filter(Boolean).join(" "));
}

export async function verifyPatientDirectoryAdmin(): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error("[Admin Patient Accounts] Missing or invalid authentication session", {
      code: authError?.code,
      message: authError?.message,
      status: authError?.status,
    });
    throw new Error(authError?.message
      ? `Authentication session check failed: ${authError.message}`
      : "No authenticated session was found. Sign in with an administrator account to view patient records.");
  }

  const verifiedAdminProfileId = "f48893d4-1651-49a0-a8b2-ffad0fe9ca76";
  const { data: isAdmin, error: verificationError } = await supabase.rpc("is_medwell_admin");
  const verificationDetails = verificationError ? {
    code: verificationError.code,
    message: verificationError.message,
    details: verificationError.details,
    hint: verificationError.hint,
  } : null;
  console.info("[Admin Patient Accounts] is_medwell_admin verification result", {
    userId: user.id,
    verifiedAdminProfileId,
    matchesVerifiedAdminProfile: user.id.toLowerCase() === verifiedAdminProfileId,
    data: isAdmin,
    error: verificationDetails,
  });

  if (verificationError) {
    console.error("[Admin Patient Accounts] Administrator verification RPC failed", verificationDetails);
    throw new Error(`Administrator verification RPC failed${verificationError.code ? ` (${verificationError.code})` : ""}: ${verificationError.message}`);
  }
  if (isAdmin !== true) {
    console.warn("[Admin Patient Accounts] Signed-in user is not an administrator", {
      userId: user.id,
      verifiedAdminProfileId,
      matchesVerifiedAdminProfile: user.id.toLowerCase() === verifiedAdminProfileId,
      isAdmin,
    });
    throw new Error("Administrator access required to view patient accounts.");
  }

  console.info("[Admin Patient Accounts] Administrator access verified", {
    userId: user.id,
    verifiedAdminProfileId,
    matchesVerifiedAdminProfile: user.id.toLowerCase() === verifiedAdminProfileId,
  });
}

export async function listPatients(search: string, limit: number, offset: number): Promise<PatientRecord[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("admin_patient_directory", {
    p_limit: limit,
    p_offset: offset,
    p_search: search.trim(),
  });
  if (error) {
    const httpStatus = (error as typeof error & { status?: number }).status;
    console.error("[Admin Patient Accounts] admin_patient_directory RPC failed:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      status: httpStatus ?? null,
    });
    throw asDatabaseError(error);
  }
  const rows = (data ?? []) as PatientDirectoryRow[];
  console.info("[Admin Patient Accounts] Directory RPC succeeded", {
    request: { p_limit: limit, p_offset: offset, p_search: search.trim() },
    returnedCount: rows.length,
    responseColumns: rows[0] ? Object.keys(rows[0]) : [],
    missingNameCount: rows.filter((row) => !row.full_name?.trim() || row.full_name.trim() === "Patient").length,
  });
  return rows.map((row) => ({
    id: row.patient_id,
    full_name: row.full_name?.trim() || "Name not provided",
    email: row.email,
    phone: row.phone,
    avatar_url: null,
    role: "PATIENT",
  }));
}

export async function countPatients(): Promise<number> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("admin_patient_count");
  if (error) {
    const httpStatus = (error as typeof error & { status?: number }).status;
    console.error("[Admin Patient Accounts] admin_patient_count RPC failed:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      status: httpStatus ?? null,
    });
    throw asDatabaseError(error);
  }
  if (data === null || data === undefined) {
    throw new Error("Patient count query returned no count.");
  }
  const count = Number(data);
  if (!Number.isFinite(count)) {
    throw new Error("Patient count query returned an invalid count.");
  }
  return count;
}

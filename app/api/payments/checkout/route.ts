import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Online checkout is disabled. Please contact hospital billing to record a payment received by the hospital." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

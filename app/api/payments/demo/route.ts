import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Patient payment simulations are disabled. Hospital staff manage billing records." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}

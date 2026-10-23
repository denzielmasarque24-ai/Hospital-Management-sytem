import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";
export async function GET() {
  const client=await createSupabaseServerClient();
  if(!client) return NextResponse.json({methods:[]},{status:503});
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user) return NextResponse.json({methods:[]},{status:401});
  return NextResponse.json({
    methods:[],
    demoSimulationEnabled:false,
    message:"Online payments are disabled. Please contact hospital billing to record a payment received by the hospital.",
  },{headers:{"Cache-Control":"no-store"}});
}

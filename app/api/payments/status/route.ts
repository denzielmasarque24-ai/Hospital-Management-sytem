import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";
export async function GET(request:Request) {
  const client=await createSupabaseServerClient();
  if(!client) return NextResponse.json({error:"Payment status is unavailable."},{status:503});
  const {data:{user},error:authError}=await client.auth.getUser();
  if(authError||!user) return NextResponse.json({error:"Please sign in."},{status:401});
  const id=new URL(request.url).searchParams.get("paymentId");
  if(!id) return NextResponse.json({error:"Payment reference is required."},{status:400});
  const {data,error}=await client.from("online_payments").select("id,status").eq("id",id).eq("patient_id",user.id).maybeSingle();
  if(error) {
    console.error("[Payments] Could not load payment status",{code:error.code,message:error.message,details:error.details,hint:error.hint});
    return NextResponse.json({error:"Could not load payment status."},{status:500});
  }
  if(!data) return NextResponse.json({error:"Payment attempt not found."},{status:404});
  return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
}

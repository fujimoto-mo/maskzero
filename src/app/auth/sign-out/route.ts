import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * Signs out from a plain HTML form POST, so the browser does a full page load afterwards. With Cache
 * Components, Next keeps recently visited routes mounted (hidden) during client navigation; a full
 * load guarantees none of the signed-in screens stay in the page after sign-out.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}

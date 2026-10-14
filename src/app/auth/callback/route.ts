import { supabaseConfig } from "@/lib/env";
import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  if (!supabaseConfig())
    return NextResponse.redirect(
      new URL("/ingresar?error=configuracion", request.url),
    );
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const c = await serverClient();
    const { error } = await c.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/inicio", request.url));
  }
  return NextResponse.redirect(new URL("/ingresar?error=enlace", request.url));
}

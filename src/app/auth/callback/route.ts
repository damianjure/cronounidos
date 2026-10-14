import { supabaseConfig } from "@/lib/env";
import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const redirectBase = process.env.APP_URL || request.url;
  if (!supabaseConfig())
    return NextResponse.redirect(
      new URL("/ingresar?error=configuracion", redirectBase),
    );
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const c = await serverClient();
    const { error } = await c.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/inicio", redirectBase));
  }
  return NextResponse.redirect(new URL("/ingresar?error=enlace", redirectBase));
}

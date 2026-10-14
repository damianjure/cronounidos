import { supabaseConfig } from "@/lib/env";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { serverClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const redirectBase = process.env.APP_URL || request.url;
  if (!supabaseConfig())
    return NextResponse.redirect(
      new URL("/ingresar?error=configuracion", redirectBase),
    );
  const hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const allowed = ["signup", "invite", "recovery", "email"];
  if (hash && type && allowed.includes(type)) {
    const c = await serverClient();
    const { error } = await c.auth.verifyOtp({
      token_hash: hash,
      type: type as EmailOtpType,
    });
    if (!error)
      return NextResponse.redirect(
        new URL(
          type === "invite" || type === "recovery"
            ? "/actualizar-clave"
            : "/inicio",
          redirectBase,
        ),
      );
  }
  return NextResponse.redirect(new URL("/ingresar?error=enlace", redirectBase));
}

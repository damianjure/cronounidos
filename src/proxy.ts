import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "@/lib/env";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const c = supabaseConfig();
  if (c) {
    const supabase = createServerClient(c.url, c.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    const { error } = await supabase.auth.getUser();
    if (error && error.status && error.status >= 500)
      return new NextResponse(
        "No se pudo verificar la sesión. Intentá nuevamente.",
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icons/|sw.js|manifest.webmanifest|offline.html|favicon.ico).*)",
  ],
};

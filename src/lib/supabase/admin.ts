import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";
export function adminClient() {
  const c = supabaseConfig();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!c || !key)
    throw new Error(
      "Falta la clave segura de servidor para altas e invitaciones.",
    );
  return createClient(c.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

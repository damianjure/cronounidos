import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";
// Deliberately never reads session cookies: public RPC has the anon identity.
export function publicClient() {
  const c = supabaseConfig();
  return c
    ? createClient(c.url, c.key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;
}

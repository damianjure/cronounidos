"use client";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/env";
export function browserClient() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase no está configurado.");
  return createBrowserClient(config.url, config.key);
}

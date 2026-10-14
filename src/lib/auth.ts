import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseConfig } from "./env";
import { serverClient } from "./supabase/server";
export const accessContext = cache(async function accessContext() {
  if (!supabaseConfig()) return { state: "unconfigured" as const };
  const client = await serverClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error && error.status && error.status >= 500)
    throw new Error("No se pudo verificar la sesión.");
  if (!user) return { state: "anonymous" as const };
  const { data, error: membershipError } = await client
    .from("memberships")
    .select("org_id,status,organizations(name)")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .order("org_id");
  if (membershipError)
    throw new Error(
      "No se pudo consultar la membresía. Verificá las migraciones.",
    );
  const org = data?.[0];
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("approved_at")
    .eq("user_id", user.id)
    .single();
  if (profileError) throw new Error("No se pudo consultar el perfil.");
  if (!org || !profile?.approved_at) return { state: "pending" as const, user };
  return {
    state: "approved" as const,
    user,
    orgId: org.org_id as string,
    client,
  };
});
export async function requireAccess() {
  const access = await accessContext();
  if (access.state === "anonymous") redirect("/ingresar");
  if (access.state === "pending") redirect("/pendiente");
  return access;
}
export async function requireAdmin(orgId: string) {
  const access = await accessContext();
  if (access.state !== "approved") throw new Error("Acceso no autorizado.");
  const { data, error } = await access.client.rpc("has_permission", {
    p_org: orgId,
    p_permission: "administer",
    p_team: null,
  });
  if (error || !data) throw new Error("Necesitás permiso de administración.");
  return access.client;
}

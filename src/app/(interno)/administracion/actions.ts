"use server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { adminInput } from "@/lib/auth-validation";
export async function approveMember(form: FormData) {
  const org = String(form.get("orgId"));
  const c = await requireAdmin(org);
  const user = String(form.get("userId"));
  const role = String(form.get("role"));
  const { error } = await c.rpc("approve_member", {
    p_org: org,
    p_user: user,
    p_role: role,
    p_team: form.get("teamId") || null,
  });
  if (error) redirect("/administracion?error=aprobacion");
  redirect("/administracion?ok=aprobado");
}
export async function provisionUser(form: FormData) {
  const parsed = adminInput.safeParse({
    orgId: form.get("orgId"),
    email: form.get("email"),
    displayName: form.get("displayName"),
    mode: form.get("mode"),
    password: form.get("password") || undefined,
  });
  if (!parsed.success) redirect("/administracion?error=datos");
  const p = parsed.data;
  const c = await requireAdmin(p.orgId);
  let admin;
  try {
    admin = adminClient();
  } catch {
    redirect("/administracion?error=configuracion");
  }
  const origin = process.env.APP_URL;
  if (!origin) redirect("/administracion?error=configuracion");
  const result =
    p.mode === "invite"
      ? await admin.auth.admin.inviteUserByEmail(p.email, {
          redirectTo: `${new URL(origin).origin}/auth/confirm`,
          data: { display_name: p.displayName },
        })
      : await admin.auth.admin.createUser({
          email: p.email,
          password: p.password,
          email_confirm: true,
          user_metadata: { display_name: p.displayName },
        });
  if (result.error || !result.data.user) redirect("/administracion?error=alta");
  const { error } = await c.rpc("register_invited_member", {
    p_org: p.orgId,
    p_user: result.data.user.id,
  });
  if (error) {
    /* Never leave an untracked privileged membership; the newly created user has no access. */ redirect(
      "/administracion?error=membresia",
    );
  }
  redirect("/administracion?ok=alta");
}

export async function linkPerson(form: FormData) {
  const org = String(form.get("orgId"));
  const c = await requireAdmin(org);
  const { error } = await c.rpc("link_member_person", {
    p_org: org,
    p_user: String(form.get("userId")),
    p_person: form.get("personId") || null,
  });
  if (error) redirect("/administracion?error=persona");
  redirect("/administracion?ok=persona");
}
export async function suspendMember(form: FormData) {
  const org = String(form.get("orgId"));
  const c = await requireAdmin(org);
  const { error } = await c.rpc("set_member_status", {
    p_org: org,
    p_user: String(form.get("userId")),
    p_status: "suspended",
  });
  if (error) redirect("/administracion?error=suspension");
  redirect("/administracion?ok=suspendido");
}
export async function grantPermission(form: FormData) {
  const org = String(form.get("orgId"));
  const c = await requireAdmin(org);
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user) throw new Error("Sesión vencida");
  const { error } = await c.from("permission_grants").insert({
    org_id: org,
    subject_user_id: String(form.get("userId")),
    team_id: form.get("teamId") || null,
    permission: String(form.get("permission")),
    granted_by: user.id,
  });
  if (error) redirect("/administracion?error=permiso");
  redirect("/administracion?ok=permiso");
}
export async function revokePermission(form: FormData) {
  const org = String(form.get("orgId"));
  const c = await requireAdmin(org);
  const { error } = await c
    .from("permission_grants")
    .delete()
    .eq("id", String(form.get("grantId")))
    .eq("org_id", org);
  if (error) redirect("/administracion?error=revocar");
  redirect("/administracion?ok=revocado");
}

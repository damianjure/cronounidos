"use server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import {
  adminInput,
  approveMemberInput,
  grantInput,
  linkPersonInput,
  memberInput,
  revokeInput,
} from "@/lib/auth-validation";
export async function approveMember(form: FormData) {
  const parsed = approveMemberInput.safeParse({
    orgId: form.get("orgId"),
    userId: form.get("userId"),
    role: form.get("role"),
    teamId: form.get("teamId"),
  });
  if (!parsed.success) redirect("/administracion?error=datos");
  const p = parsed.data;
  const c = await requireAdmin(p.orgId);
  const { error } = await c.rpc("approve_member", {
    p_org: p.orgId,
    p_user: p.userId,
    p_role: p.role,
    p_team: p.teamId,
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
  let origin: string;
  try {
    const url = new URL(process.env.APP_URL ?? "");
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Invalid application origin");
    origin = url.origin;
  } catch {
    redirect("/administracion?error=configuracion");
  }
  const result =
    p.mode === "invite"
      ? await admin.auth.admin.inviteUserByEmail(p.email, {
          redirectTo: `${origin}/auth/confirm`,
          data: { display_name: p.displayName },
        })
      : await admin.auth.admin.createUser({
          email: p.email,
          password: p.password,
          email_confirm: true,
          user_metadata: { display_name: p.displayName },
        });
  if (result.error || !result.data.user) redirect("/administracion?error=alta");
  let membershipFailed = false;
  try {
    const { error } = await c.rpc("register_invited_member", {
      p_org: p.orgId,
      p_user: result.data.user.id,
    });
    membershipFailed = !!error;
  } catch {
    membershipFailed = true;
  }
  // Invitation may return an EXISTING unconfirmed account. Even for create,
  // a lost RPC response does not prove that membership creation rolled back.
  // Preserve identity in both cases; do not compensate an uncertain outcome
  // with a global Auth delete. An administrator must reconcile membership.
  if (membershipFailed) redirect("/administracion?error=membresia");
  redirect("/administracion?ok=alta");
}

export async function linkPerson(form: FormData) {
  const parsed = linkPersonInput.safeParse({
    orgId: form.get("orgId"),
    userId: form.get("userId"),
    personId: form.get("personId"),
  });
  if (!parsed.success) redirect("/administracion?error=datos");
  const p = parsed.data;
  const c = await requireAdmin(p.orgId);
  const { error } = await c.rpc("link_member_person", {
    p_org: p.orgId,
    p_user: p.userId,
    p_person: p.personId,
  });
  if (error) redirect("/administracion?error=persona");
  redirect("/administracion?ok=persona");
}
export async function suspendMember(form: FormData) {
  const parsed = memberInput.safeParse({
    orgId: form.get("orgId"),
    userId: form.get("userId"),
  });
  if (!parsed.success) redirect("/administracion?error=datos");
  const p = parsed.data;
  const c = await requireAdmin(p.orgId);
  const { error } = await c.rpc("set_member_status", {
    p_org: p.orgId,
    p_user: p.userId,
    p_status: "suspended",
  });
  if (error) redirect("/administracion?error=suspension");
  redirect("/administracion?ok=suspendido");
}
export async function grantPermission(form: FormData) {
  const parsed = grantInput.safeParse({
    orgId: form.get("orgId"),
    userId: form.get("userId"),
    teamId: form.get("teamId"),
    permission: form.get("permission"),
  });
  if (!parsed.success) redirect("/administracion?error=datos");
  const p = parsed.data;
  const c = await requireAdmin(p.orgId);
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user) throw new Error("Sesión vencida");
  const { error } = await c.from("permission_grants").insert({
    org_id: p.orgId,
    subject_user_id: p.userId,
    team_id: p.teamId,
    permission: p.permission,
    granted_by: user.id,
  });
  if (error) redirect("/administracion?error=permiso");
  redirect("/administracion?ok=permiso");
}
export async function revokePermission(form: FormData) {
  const parsed = revokeInput.safeParse({
    orgId: form.get("orgId"),
    grantId: form.get("grantId"),
  });
  if (!parsed.success) redirect("/administracion?error=datos");
  const p = parsed.data;
  const c = await requireAdmin(p.orgId);
  const { error } = await c
    .from("permission_grants")
    .delete()
    .eq("id", p.grantId)
    .eq("org_id", p.orgId);
  if (error) redirect("/administracion?error=revocar");
  redirect("/administracion?ok=revocado");
}

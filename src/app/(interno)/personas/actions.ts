"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";
import { parseDirectoryInput, teamMemberInput } from "@/lib/directory-input";

type Kind = "people" | "teams" | "roles";
const kindSchema = z.enum(["people", "teams", "roles"]);

function fail(code: string): never {
  redirect(`/personas?error=${code}`);
}
function done(): never {
  revalidatePath("/personas");
  revalidatePath("/cronograma");
  revalidatePath("/administracion");
  redirect("/personas?ok=1");
}

async function context(permission: "assign" | "edit_roles", teamId: string | null = null) {
  const a = await requireAccess();
  if (a.state !== "approved") fail("acceso");
  const { data, error } = await a.client.rpc("has_permission", {
    p_org: a.orgId,
    p_permission: permission,
    p_team: teamId,
  });
  if (error || !data) fail("acceso");
  return a;
}

export async function saveDirectoryItem(form: FormData) {
  const kind = kindSchema.safeParse(form.get("kind"));
  const rawId = form.get("id") || null;
  const id = rawId ? z.uuid().safeParse(rawId) : null;
  if (!kind.success || (id && !id.success)) fail("datos");
  let values;
  try {
    values = parseDirectoryInput(kind.data, form);
  } catch {
    fail("datos");
  }
  const teamId = "team_id" in values && typeof values.team_id === "string" ? values.team_id : null;
  const a = await context(kind.data === "people" ? "assign" : "edit_roles", teamId);
  const target: Kind = kind.data;
  if (id?.success) {
    const { data, error } = await a.client.from(target)
      .update(values).eq("org_id", a.orgId).eq("id", id.data)
      .select("id").maybeSingle();
    if (error || !data) fail("guardar");
  } else {
    const { error } = await a.client.from(target).insert({ ...values, org_id: a.orgId });
    if (error) fail("guardar");
  }
  done();
}

export async function deleteDirectoryItem(form: FormData) {
  const kind = kindSchema.safeParse(form.get("kind"));
  const id = z.uuid().safeParse(form.get("id"));
  const teamId = form.get("teamId") || null;
  if (!kind.success || !id.success || (teamId && !z.uuid().safeParse(teamId).success)) fail("datos");
  const a = await context(kind.data === "people" ? "assign" : "edit_roles", kind.data === "roles" ? String(teamId || "") || null : null);
  const { data, error } = await a.client.from(kind.data)
    .delete().eq("org_id", a.orgId).eq("id", id.data)
    .select("id").maybeSingle();
  if (error || !data) fail("uso");
  done();
}

export async function addTeamMember(form: FormData) {
  const values = teamMemberInput.safeParse({ team_id: form.get("teamId"), person_id: form.get("personId") });
  if (!values.success) fail("datos");
  const a = await context("assign", values.data.team_id);
  const { error } = await a.client.from("team_memberships").insert({
    ...values.data, org_id: a.orgId,
  });
  if (error) fail("guardar");
  done();
}

export async function removeTeamMember(form: FormData) {
  const id = z.uuid().safeParse(form.get("id"));
  const teamId = z.uuid().safeParse(form.get("teamId"));
  if (!id.success || !teamId.success) fail("datos");
  const a = await context("assign", teamId.data);
  const { data, error } = await a.client.from("team_memberships")
    .delete().eq("org_id", a.orgId).eq("team_id", teamId.data).eq("id", id.data)
    .select("id").maybeSingle();
  if (error || !data) fail("guardar");
  done();
}

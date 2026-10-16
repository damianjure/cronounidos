"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";
import { safeUrl } from "@/lib/editor/model";

export async function editTeamResponsible(form: FormData) {
  const parsed = z.object({
    meetingId: z.uuid(), teamId: z.uuid(), blockId: z.uuid(),
    version: z.coerce.number().int().positive(),
    action: z.enum(["add", "remove"]),
    personId: z.uuid().nullable(), roleId: z.uuid().nullable(), assignmentId: z.uuid().nullable(),
  }).safeParse({
    meetingId: form.get("meetingId"), teamId: form.get("teamId"), blockId: form.get("blockId"),
    version: form.get("version"), action: form.get("action"),
    personId: form.get("personId") || null, roleId: form.get("roleId") || null,
    assignmentId: form.get("assignmentId") || null,
  });
  if (!parsed.success) redirect("/cronograma?error=datos");
  const value = parsed.data;
  const path = `/cronograma/${value.meetingId}/equipos/${value.teamId}`;
  const a = await requireAccess();
  if (a.state !== "approved") redirect("/pendiente");
  const { error } = await a.client.rpc("edit_team_block_responsible", {
    p_meeting: value.meetingId, p_team: value.teamId, p_block: value.blockId,
    p_expected_version: value.version, p_action: value.action,
    p_person: value.personId, p_role: value.roleId, p_assignment: value.assignmentId,
  });
  if (error) redirect(`${path}?error=${/conflict/i.test(error.message) ? "conflicto" : "guardar"}`);
  revalidatePath(path);
  revalidatePath("/cronograma");
  redirect(`${path}?ok=responsables`);
}

export async function saveTeamNotes(form: FormData) {
  const meeting = z.uuid().safeParse(form.get("meetingId"));
  const team = z.uuid().safeParse(form.get("teamId"));
  const block = z.uuid().safeParse(form.get("blockId"));
  const version = z.coerce.number().int().positive().safeParse(form.get("version"));
  const notes = z.string().max(12000).safeParse(form.get("notes"));
  if (!meeting.success || !team.success || !block.success || !version.success || !notes.success)
    redirect("/cronograma?error=datos");
  const path = `/cronograma/${meeting.data}/equipos/${team.data}`;
  const a = await requireAccess();
  if (a.state !== "approved") redirect("/pendiente");
  const { error } = await a.client.rpc("save_team_block_notes", {
    p_meeting: meeting.data,
    p_team: team.data,
    p_block: block.data,
    p_expected_version: version.data,
    p_notes: notes.data,
  });
  if (error) redirect(`${path}?error=${/conflict/i.test(error.message) ? "conflicto" : "guardar"}`);
  revalidatePath(path);
  revalidatePath("/cronograma");
  redirect(`${path}?ok=1`);
}

export async function saveTeamFields(form: FormData) {
  const meeting = z.uuid().safeParse(form.get("meetingId"));
  const team = z.uuid().safeParse(form.get("teamId"));
  const block = z.uuid().safeParse(form.get("blockId"));
  const version = z.coerce.number().int().positive().safeParse(form.get("version"));
  const raw = form.get("values");
  let decoded: unknown;
  try { decoded = typeof raw === "string" && raw.length <= 16384 ? JSON.parse(raw) : null; }
  catch { decoded = null; }
  const values = z.record(z.string(), z.union([z.string().max(12000), z.number().finite(), z.boolean(), z.null()])).safeParse(decoded);
  if (!meeting.success || !team.success || !block.success || !version.success || !values.success)
    redirect("/cronograma?error=datos");
  const path = `/cronograma/${meeting.data}/equipos/${team.data}`;
  const a = await requireAccess();
  if (a.state !== "approved") redirect("/pendiente");
  const { error } = await a.client.rpc("save_team_block_fields", {
    p_meeting: meeting.data,
    p_team: team.data,
    p_block: block.data,
    p_expected_version: version.data,
    p_values: values.data,
  });
  if (error) redirect(`${path}?error=${/conflict/i.test(error.message) ? "conflicto" : "guardar"}`);
  revalidatePath(path);
  revalidatePath("/cronograma");
  redirect(`${path}?ok=campos`);
}

export async function addTeamLink(form: FormData) {
  const meeting = z.uuid().safeParse(form.get("meetingId"));
  const team = z.uuid().safeParse(form.get("teamId"));
  const block = z.uuid().safeParse(form.get("blockId"));
  const version = z.coerce.number().int().positive().safeParse(form.get("version"));
  const title = z.string().trim().min(1).max(200).safeParse(form.get("title"));
  const url = safeUrl.safeParse(form.get("url"));
  if (!meeting.success || !team.success || !block.success || !version.success || !title.success || !url.success)
    redirect("/cronograma?error=datos");
  const path = `/cronograma/${meeting.data}/equipos/${team.data}`;
  const a = await requireAccess();
  if (a.state !== "approved") redirect("/pendiente");
  const { error } = await a.client.rpc("add_team_block_url", {
    p_meeting: meeting.data,
    p_team: team.data,
    p_block: block.data,
    p_expected_version: version.data,
    p_title: title.data,
    p_url: url.data,
  });
  if (error) redirect(`${path}?error=${/conflict/i.test(error.message) ? "conflicto" : "guardar"}`);
  revalidatePath(path);
  revalidatePath("/cronograma");
  redirect(`${path}?ok=enlace`);
}

export async function removeTeamLink(form: FormData) {
  const meeting = z.uuid().safeParse(form.get("meetingId"));
  const team = z.uuid().safeParse(form.get("teamId"));
  const block = z.uuid().safeParse(form.get("blockId"));
  const resource = z.uuid().safeParse(form.get("resourceId"));
  const version = z.coerce.number().int().positive().safeParse(form.get("version"));
  if (!meeting.success || !team.success || !block.success || !resource.success || !version.success)
    redirect("/cronograma?error=datos");
  const path = `/cronograma/${meeting.data}/equipos/${team.data}`;
  const a = await requireAccess();
  if (a.state !== "approved") redirect("/pendiente");
  const { error } = await a.client.rpc("remove_team_block_resource", {
    p_meeting: meeting.data,
    p_team: team.data,
    p_block: block.data,
    p_expected_version: version.data,
    p_resource: resource.data,
  });
  if (error) redirect(`${path}?error=${/conflict/i.test(error.message) ? "conflicto" : "guardar"}`);
  revalidatePath(path);
  revalidatePath("/cronograma");
  redirect(`${path}?ok=desvinculado`);
}

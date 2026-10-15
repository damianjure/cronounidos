"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";

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

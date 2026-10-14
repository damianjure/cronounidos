"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { editorContext } from "@/lib/editor/server";
import { fieldDefinition, snapshotSchema } from "@/lib/editor/model";
import { templateBlocks } from "@/lib/editor/templates";

const nameSchema = z.string().trim().min(2).max(120);
const fieldSchema = z.array(fieldDefinition).max(50).superRefine((fields, ctx) => {
  if (new Set(fields.map((field) => field.key)).size !== fields.length)
    ctx.addIssue({ code: "custom", message: "Campos repetidos." });
});
const idSchema = z.uuid();
const versionSchema = z.coerce.number().int().positive();

function done(key: string) {
  revalidatePath("/cronograma/catalogos");
  redirect(`/cronograma/catalogos?${key}=1`);
}

export async function saveBlockType(form: FormData) {
  const a = await editorContext();
  const id = String(form.get("id") || "");
  const name = nameSchema.safeParse(form.get("name"));
  let parsedFields: unknown;
  try {
    parsedFields = JSON.parse(String(form.get("fields") || "[]"));
  } catch {
    redirect("/cronograma/catalogos?error=campos");
  }
  const fields = fieldSchema.safeParse(parsedFields);
  if (!name.success || !fields.success)
    redirect("/cronograma/catalogos?error=campos");
  if (id) {
    const idResult = idSchema.safeParse(id);
    const version = versionSchema.safeParse(form.get("version"));
    if (!idResult.success || !version.success)
      redirect("/cronograma/catalogos?error=datos");
    const { data, error } = await a.client
      .from("block_types")
      .update({
        name: name.data,
        field_schema_json: fields.data,
        version: version.data + 1,
      })
      .eq("org_id", a.orgId)
      .eq("id", idResult.data)
      .eq("version", version.data)
      .select("id")
      .maybeSingle();
    if (error || !data) redirect("/cronograma/catalogos?error=conflicto");
  } else {
    const { error } = await a.client.from("block_types").insert({
      org_id: a.orgId,
      name: name.data,
      field_schema_json: fields.data,
    });
    if (error) redirect("/cronograma/catalogos?error=guardar");
  }
  done("tipo");
}

export async function deleteBlockType(form: FormData) {
  const a = await editorContext();
  const id = idSchema.safeParse(form.get("id"));
  if (!id.success) redirect("/cronograma/catalogos?error=datos");
  const { error } = await a.client
    .from("block_types")
    .delete()
    .eq("org_id", a.orgId)
    .eq("id", id.data);
  if (error) redirect("/cronograma/catalogos?error=uso");
  done("tipo");
}

export async function saveTemplate(form: FormData) {
  const a = await editorContext();
  const id = idSchema.safeParse(form.get("meetingId"));
  const name = nameSchema.safeParse(form.get("name"));
  const version = versionSchema.safeParse(form.get("version"));
  if (!id.success || !name.success || !version.success)
    redirect("/cronograma/catalogos?error=datos");
  const { data, error } = await a.client.rpc("get_editor_snapshot", {
    p_meeting: id.data,
  });
  if (error || !data) redirect("/cronograma/catalogos?error=reunion");
  const snapshot = snapshotSchema.safeParse(data);
  if (!snapshot.success) redirect("/cronograma/catalogos?error=reunion");
  if (snapshot.data.version !== version.data)
    redirect("/cronograma/catalogos?error=conflicto");
  const { error: insertError } = await a.client.from("meeting_templates").insert({
    org_id: a.orgId,
    name: name.data,
    definition_json: { blocks: templateBlocks(snapshot.data) },
  });
  if (insertError) redirect("/cronograma/catalogos?error=guardar");
  done("plantilla");
}

export async function renameTemplate(form: FormData) {
  const a = await editorContext();
  const id = idSchema.safeParse(form.get("id"));
  const name = nameSchema.safeParse(form.get("name"));
  const version = versionSchema.safeParse(form.get("version"));
  if (!id.success || !name.success || !version.success)
    redirect("/cronograma/catalogos?error=datos");
  const { data, error } = await a.client
    .from("meeting_templates")
    .update({ name: name.data, definition_version: version.data + 1 })
    .eq("org_id", a.orgId)
    .eq("id", id.data)
    .eq("definition_version", version.data)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect("/cronograma/catalogos?error=conflicto");
  done("plantilla");
}

export async function replaceTemplateDefinition(form: FormData) {
  const a = await editorContext();
  const id = idSchema.safeParse(form.get("id"));
  const meetingId = idSchema.safeParse(form.get("meetingId"));
  const version = versionSchema.safeParse(form.get("version"));
  if (!id.success || !meetingId.success || !version.success)
    redirect("/cronograma/catalogos?error=datos");
  const { data: source, error: sourceError } = await a.client.rpc(
    "get_editor_snapshot",
    { p_meeting: meetingId.data },
  );
  const snapshot = snapshotSchema.safeParse(source);
  if (sourceError || !snapshot.success)
    redirect("/cronograma/catalogos?error=reunion");
  const { data, error } = await a.client
    .from("meeting_templates")
    .update({
      definition_json: { blocks: templateBlocks(snapshot.data) },
      definition_version: version.data + 1,
    })
    .eq("org_id", a.orgId)
    .eq("id", id.data)
    .eq("definition_version", version.data)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect("/cronograma/catalogos?error=conflicto");
  done("plantilla");
}

export async function deleteTemplate(form: FormData) {
  const a = await editorContext();
  const id = idSchema.safeParse(form.get("id"));
  if (!id.success) redirect("/cronograma/catalogos?error=datos");
  const { error } = await a.client
    .from("meeting_templates")
    .delete()
    .eq("org_id", a.orgId)
    .eq("id", id.data);
  if (error) redirect("/cronograma/catalogos?error=uso");
  done("plantilla");
}

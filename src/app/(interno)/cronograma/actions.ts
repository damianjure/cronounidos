"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { editorContext } from "@/lib/editor/server";
import {
  snapshotSchema,
  metadataSchema,
  copyOptionsSchema,
  readableError,
  type EditorSnapshot,
  type CopyOptions,
  type Metadata,
} from "@/lib/editor/model";
export async function saveMeeting(
  input: EditorSnapshot,
  publish = false,
): Promise<EditorSnapshot> {
  const snapshot = snapshotSchema.parse(input);
  const a = await editorContext();
  const { data, error } = await a.client.rpc(
    publish ? "publish_editor_snapshot" : "save_editor_snapshot",
    {
      p_meeting: snapshot.meetingId,
      p_expected_version: snapshot.version,
      p_metadata: snapshot.metadata,
      p_blocks: snapshot.blocks,
    },
  );
  if (error) throw new Error(readableError(error));
  return snapshotSchema.parse(data);
}
export async function duplicateMeeting(
  sourceId: string,
  metadata: Metadata,
  options: CopyOptions,
) {
  z.uuid().parse(sourceId);
  metadataSchema.parse(metadata);
  copyOptionsSchema.parse(options);
  const a = await editorContext();
  const { data, error } = await a.client.rpc("duplicate_editor_meeting", {
    p_source: sourceId,
    p_metadata: metadata,
    p_options: options,
  });
  if (error) throw new Error(readableError(error));
  return snapshotSchema.parse(data);
}
export async function createMeeting(
  previous: { message: string },
  form: FormData,
): Promise<{ message: string }> {
  const parsed = metadataSchema.safeParse({
    title: form.get("title"),
    date: form.get("date"),
    startLocalTime: form.get("startLocalTime"),
    timezone: form.get("timezone"),
    meetingTypeId: form.get("meetingTypeId") || null,
    seriesId: form.get("seriesId") || null,
  });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const a = await editorContext();
  const template = form.get("templateId") || null;
  if (template && !z.uuid().safeParse(template).success)
    return { message: "Plantilla inválida." };
  const { data, error } = await a.client.rpc("create_editor_meeting", {
    p_org: a.orgId,
    p_metadata: parsed.data,
    p_template: template,
  });
  if (error) return { message: readableError(error) };
  const snapshot = snapshotSchema.parse(data);
  redirect(`/cronograma/${snapshot.meetingId}`);
}

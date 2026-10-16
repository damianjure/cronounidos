"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { editorContext } from "@/lib/editor/server";
import { adminClient } from "@/lib/supabase/admin";
import { hasResourceSignature, isResourceMimeType, resourceMimeTypes } from "@/lib/editor/upload-validation";

const bucketName = "crono-resources";
type Context = Awaited<ReturnType<typeof editorContext>>;

async function validatedFile(form: FormData) {
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > 5 * 1024 * 1024 ||
    !isResourceMimeType(file.type)
  ) redirect("/cronograma/contenidos?error=archivo");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!hasResourceSignature(file.type, bytes))
    redirect("/cronograma/contenidos?error=archivo");
  return { file, info: resourceMimeTypes[file.type] };
}

async function removeVerified(path: string) {
  // The JWT-backed RPC authorizes queue membership; the secret client only removes bytes.
  const bucket = adminClient().storage.from(bucketName);
  const { error: removeError } = await bucket.remove([path]);
  if (removeError) return false;
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error: listError } = await bucket.list(folder, {
    limit: 100,
    search: name,
  });
  return !listError && !data?.some((file) => file.name === name);
}

async function drainCleanup(a: Context) {
  for (let batch = 0; batch < 5; batch++) {
    const { data, error } = await a.client.rpc("pending_resource_file_cleanup", { p_org: a.orgId });
    if (error) return false;
    for (const row of data ?? []) {
      if (!(await removeVerified(row.path))) return false;
      const { error: ackError } = await a.client.rpc("ack_resource_file_cleanup", {
        p_org: a.orgId,
        p_path: row.path,
      });
      if (ackError) return false;
    }
    if ((data?.length ?? 0) < 20) return true;
  }
  return false;
}

async function discardUploaded(a: Context, path: string) {
  // Authorize and verify that no catalog row uses this path before privileged deletion.
  const { error: queueError } = await a.client.rpc("queue_unattached_resource_file", {
    p_org: a.orgId,
    p_path: path,
  });
  if (queueError) throw new Error("Archivo huérfano: se requiere limpieza manual.");
  if (!(await removeVerified(path))) return false;
  const { error: ackError } = await a.client.rpc("ack_resource_file_cleanup", {
    p_org: a.orgId,
    p_path: path,
  });
  return !ackError;
}

function finish(clean: boolean) {
  revalidatePath("/cronograma/contenidos");
  redirect(`/cronograma/contenidos?${clean ? "ok" : "cleanup"}=1`);
}

export async function uploadResource(form: FormData) {
  const title = z.string().trim().min(1).max(200).safeParse(form.get("title"));
  if (!title.success) redirect("/cronograma/contenidos?error=datos");
  const { file, info } = await validatedFile(form);
  const a = await editorContext();
  const path = `${a.orgId}/${crypto.randomUUID()}.${info.extension}`;
  const bucket = a.client.storage.from(bucketName);
  const { error: uploadError } = await bucket.upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) redirect("/cronograma/contenidos?error=subida");
  const { error: insertError } = await a.client.from("resources").insert({
    org_id: a.orgId,
    title: title.data,
    url: null,
    storage_path: path,
    resource_type: info.resourceType,
  });
  if (insertError) {
    const clean = await discardUploaded(a, path);
    redirect(`/cronograma/contenidos?error=guardar${clean ? "" : "&cleanup=1"}`);
  }
  finish(true);
}

export async function replaceResourceFile(form: FormData) {
  const id = z.uuid().safeParse(form.get("id"));
  const oldPath = z.string().min(1).safeParse(form.get("oldPath"));
  const title = z.string().trim().min(1).max(200).safeParse(form.get("title"));
  if (!id.success || !oldPath.success || !title.success)
    redirect("/cronograma/contenidos?error=datos");
  const { file, info } = await validatedFile(form);
  const a = await editorContext();
  const path = `${a.orgId}/${crypto.randomUUID()}.${info.extension}`;
  const { error: uploadError } = await a.client.storage.from(bucketName).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) redirect("/cronograma/contenidos?error=subida");
  const { error } = await a.client.rpc("replace_unlinked_resource_file", {
    p_resource: id.data,
    p_old_path: oldPath.data,
    p_new_path: path,
    p_title: title.data,
    p_resource_type: info.resourceType,
  });
  if (error) {
    const clean = await discardUploaded(a, path);
    const reason = /in use/i.test(error.message) ? "uso" : /changed/i.test(error.message) ? "conflicto" : "guardar";
    redirect(`/cronograma/contenidos?error=${reason}${clean ? "" : "&cleanup=1"}`);
  }
  revalidatePath(`/recursos/${id.data}`);
  finish(await drainCleanup(a));
}

export async function deleteResourceFile(form: FormData) {
  const id = z.uuid().safeParse(form.get("id"));
  const oldPath = z.string().min(1).safeParse(form.get("oldPath"));
  if (!id.success || !oldPath.success || form.get("confirm") !== "yes")
    redirect("/cronograma/contenidos?error=datos");
  const a = await editorContext();
  const { error } = await a.client.rpc("delete_unlinked_resource_file", {
    p_resource: id.data,
    p_old_path: oldPath.data,
  });
  if (error) {
    const reason = /in use/i.test(error.message) ? "uso" : /changed/i.test(error.message) ? "conflicto" : "guardar";
    redirect(`/cronograma/contenidos?error=${reason}`);
  }
  revalidatePath(`/recursos/${id.data}`);
  finish(await drainCleanup(a));
}

export async function retryResourceFileCleanup() {
  const a = await editorContext();
  finish(await drainCleanup(a));
}

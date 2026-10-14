"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { editorContext } from "@/lib/editor/server";
import { hasResourceSignature, isResourceMimeType, resourceMimeTypes } from "@/lib/editor/upload-validation";

export async function uploadResource(form: FormData) {
  const title = z.string().trim().min(1).max(200).safeParse(form.get("title"));
  const file = form.get("file");
  if (
    !title.success ||
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > 5 * 1024 * 1024 ||
    !isResourceMimeType(file.type)
  ) redirect("/cronograma/contenidos?error=archivo");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!hasResourceSignature(file.type, bytes))
    redirect("/cronograma/contenidos?error=archivo");
  const a = await editorContext();
  const info = resourceMimeTypes[file.type];
  const path = `${a.orgId}/${crypto.randomUUID()}.${info.extension}`;
  const bucket = a.client.storage.from("crono-resources");
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
    const { error: cleanupError } = await bucket.remove([path]);
    if (cleanupError)
      throw new Error("La carga no se pudo registrar y requiere limpieza manual.");
    redirect("/cronograma/contenidos?error=guardar");
  }
  revalidatePath("/cronograma/contenidos");
  redirect("/cronograma/contenidos?ok=1");
}

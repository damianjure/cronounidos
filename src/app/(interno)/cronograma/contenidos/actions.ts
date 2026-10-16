"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { editorContext } from "@/lib/editor/server";
import { catalogKind, parseCatalogInput } from "@/lib/editor/catalog-input";

function done() {
  revalidatePath("/cronograma/contenidos");
  redirect("/cronograma/contenidos?ok=1");
}

export async function saveCatalogItem(form: FormData) {
  const kind = catalogKind.safeParse(form.get("kind"));
  if (!kind.success) redirect("/cronograma/contenidos?error=datos");
  let values;
  try {
    values = parseCatalogInput(kind.data, form);
  } catch {
    redirect("/cronograma/contenidos?error=datos");
  }
  const a = await editorContext();
  const id = String(form.get("id") || "");
  if (id) {
    const validId = z.uuid().safeParse(id);
    if (!validId.success) redirect("/cronograma/contenidos?error=datos");
    if (kind.data === "resources") {
      const resource = values as { title: string; url: string; resource_type: string };
      const { error } = await a.client.rpc("update_unlinked_url_resource", {
        p_resource: validId.data,
        p_title: resource.title,
        p_url: resource.url,
        p_resource_type: resource.resource_type,
      });
      if (error) redirect("/cronograma/contenidos?error=guardar");
    } else {
      const { data, error } = await a.client
        .from(kind.data)
        .update(values)
        .eq("org_id", a.orgId)
        .eq("id", validId.data)
        .select("id")
        .maybeSingle();
      if (error || !data) redirect("/cronograma/contenidos?error=guardar");
    }
  } else {
    const { error } = await a.client.from(kind.data).insert({
      ...values,
      org_id: a.orgId,
    });
    if (error) redirect("/cronograma/contenidos?error=guardar");
  }
  done();
}

export async function deleteCatalogItem(form: FormData) {
  const kind = catalogKind.safeParse(form.get("kind"));
  const id = z.uuid().safeParse(form.get("id"));
  if (!kind.success || !id.success)
    redirect("/cronograma/contenidos?error=datos");
  const a = await editorContext();
  if (kind.data === "resources") {
    const { error } = await a.client.rpc("delete_unlinked_url_resource", {
      p_resource: id.data,
    });
    if (error) redirect("/cronograma/contenidos?error=uso");
  } else {
    const { data, error } = await a.client
      .from(kind.data)
      .delete()
      .eq("org_id", a.orgId)
      .eq("id", id.data)
      .select("id")
      .maybeSingle();
    if (error || !data) redirect("/cronograma/contenidos?error=uso");
  }
  done();
}

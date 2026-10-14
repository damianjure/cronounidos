import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";
import { safeUrl } from "@/lib/editor/model";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new NextResponse("No encontrado", { status: 404 });
  const a = await requireAccess();
  if (a.state !== "approved")
    return new NextResponse("No encontrado", { status: 404 });
  const { data: resource, error } = await a.client
    .from("resources")
    .select("url,storage_path")
    .eq("org_id", a.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error || !resource)
    return new NextResponse("No encontrado", { status: 404 });
  let destination: string | null = null;
  if (resource.storage_path) {
    const { data, error: signedError } = await a.client.storage
      .from("crono-resources")
      .createSignedUrl(resource.storage_path, 60);
    if (signedError || !data?.signedUrl)
      return new NextResponse("No disponible", { status: 403 });
    destination = data.signedUrl;
  } else if (resource.url && safeUrl.safeParse(resource.url).success) {
    destination = resource.url;
  }
  if (!destination)
    return new NextResponse("No disponible", { status: 404 });
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

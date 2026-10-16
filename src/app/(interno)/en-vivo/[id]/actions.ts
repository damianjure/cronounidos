"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/auth";
import { liveCommand, liveSnapshot, type LiveSnapshot } from "@/lib/live/model";
export type LiveResult =
  | { ok: true; snapshot: LiveSnapshot }
  | { ok: false; message: string; denied: boolean };
export async function readLive(id: string): Promise<LiveResult> {
  if (!z.uuid().safeParse(id).success)
    return { ok: false, message: "Reunión inválida.", denied: true };
  const access = await requireAccess();
  if (access.state !== "approved")
    return { ok: false, message: "Sesión no autorizada.", denied: true };
  const { data, error } = await access.client.rpc("get_live_snapshot", {
    p_meeting: id,
  });
  if (error)
    return {
      ok: false,
      message:
        "No se pudo sincronizar la reunión. Revisá tu conexión y permisos.",
      denied:
        error.message.includes("Forbidden") ||
        error.message.includes("Published meeting"),
    };
  return { ok: true, snapshot: liveSnapshot.parse(data) };
}
export async function operateLive(input: unknown): Promise<LiveResult> {
  const parsed = liveCommand.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: "Operación inválida.", denied: false };
  const access = await requireAccess();
  if (access.state !== "approved")
    return { ok: false, message: "Sesión no autorizada.", denied: true };
  const p = parsed.data;
  const { data, error } = await access.client.rpc("transition_live", {
    p_meeting: p.meetingId,
    p_version: p.version,
    p_request: p.requestId,
    p_command: p.command,
  });
  if (error)
    return {
      ok: false,
      message: error.message.toLowerCase().includes("conflict")
        ? "Otro operador cambió la reunión. Se actualizará el estado; revisalo antes de volver a operar."
        : "No se pudo realizar la transición. Revisá conexión, permiso y estado actual.",
      denied: error.message.includes("Forbidden"),
    };
  for (const path of [
    "/cronograma",
    "/calendario",
    "/confirmaciones",
    `/en-vivo/${p.meetingId}`,
  ])
    revalidatePath(path);
  return { ok: true, snapshot: liveSnapshot.parse(data) };
}

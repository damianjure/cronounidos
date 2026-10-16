"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/auth";
import { configureRequest, staffRequest } from "@/lib/staffing/model";
export async function configurePosition(form: FormData) {
  const value = configureRequest.safeParse(Object.fromEntries(form));
  if (!value.success) throw new Error("Datos de puesto inválidos.");
  const p = value.data;
  const access = await requireAccess();
  if (access.state !== "approved") redirect("/ingresar");
  const { error } = await access.client.rpc("configure_meeting_position", {
    p_meeting: p.meetingId,
    p_version: p.version,
    p_team: p.teamId,
    p_role: p.roleId,
    p_priority: p.priority,
    p_quantity: p.quantity,
  });
  finish(p.meetingId, error?.message);
}
export async function staffPosition(form: FormData) {
  const value = staffRequest.safeParse({
    ...Object.fromEntries(form),
    expected: form.get("expected") || null,
    status: form.get("status") || null,
    respondedAt: form.get("respondedAt") || null,
  });
  if (!value.success) throw new Error("Datos de asignación inválidos.");
  const p = value.data;
  const access = await requireAccess();
  if (access.state !== "approved") redirect("/ingresar");
  const { error } = await access.client.rpc("staff_meeting_position", {
    p_position: p.positionId,
    p_version: p.version,
    p_person: p.personId,
    p_expected: p.expected,
    p_status: p.status,
    p_responded_at: p.respondedAt,
  });
  finish(p.meetingId, error?.message);
}
function finish(id: string, error?: string) {
  for (const path of [
    "/calendario",
    "/cobertura",
    "/confirmaciones",
    "/cronograma",
    `/cronograma/${id}/puestos`,
  ])
    revalidatePath(path);
  redirect(
    `/cronograma/${id}/puestos${error ? `?error=${error.toLowerCase().includes("conflict") ? "conflicto" : "guardar"}` : "?ok=1"}`,
  );
}

export async function justifyConflict(form: FormData) {
  const { exceptionRequest } = await import("@/lib/staffing/model");
  const value = exceptionRequest.safeParse(Object.fromEntries(form));
  if (!value.success)
    throw new Error("El motivo debe tener entre 10 y 2000 caracteres.");
  const p = value.data;
  const access = await requireAccess();
  if (access.state !== "approved") redirect("/ingresar");
  const { error } = await access.client.rpc("justify_staffing_conflict", {
    p_meeting: p.meetingId,
    p_fingerprint: p.fingerprint,
    p_reason: p.reason,
  });
  finish(p.meetingId, error?.message);
}

export async function adjustPosition(form: FormData) {
  const { z } = await import("zod");
  const value = z
    .object({
      meetingId: z.uuid(),
      positionId: z.uuid(),
      version: z.coerce.number().int().positive(),
      priority: z.enum(["critical", "required", "optional"]),
      operation: z.enum(["priority", "remove"]),
      ack: z.literal("yes"),
    })
    .safeParse(Object.fromEntries(form));
  if (!value.success) throw new Error("Confirmá el cambio de puesto.");
  const p = value.data;
  const access = await requireAccess();
  if (access.state !== "approved") redirect("/ingresar");
  const { error } = await access.client.rpc("adjust_meeting_position", {
    p_position: p.positionId,
    p_version: p.version,
    p_priority: p.priority,
    p_remove: p.operation === "remove",
  });
  finish(p.meetingId, error?.message);
}

export async function replaceBlockPerson(form: FormData) {
  const { z } = await import("zod");
  const value = z
    .object({
      meetingId: z.uuid(),
      assignmentId: z.uuid(),
      personId: z.uuid(),
      version: z.coerce.number().int().positive(),
      ack: z.literal("yes"),
    })
    .safeParse(Object.fromEntries(form));
  if (!value.success) throw new Error("Confirmá el reemplazo.");
  const p = value.data;
  const access = await requireAccess();
  if (access.state !== "approved") redirect("/ingresar");
  const { error } = await access.client.rpc("replace_block_person", {
    p_meeting: p.meetingId,
    p_version: p.version,
    p_assignment: p.assignmentId,
    p_person: p.personId,
  });
  finish(p.meetingId, error?.message);
}

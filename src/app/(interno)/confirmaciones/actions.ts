"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/auth";
import { confirmationRequest } from "@/lib/confirmations/model";

export async function respondAssignments(form: FormData) {
  let expected: unknown = null;
  const raw = form.get("expected");
  try { if (typeof raw === "string" && raw.length <= 32000) expected = JSON.parse(raw); }
  catch { /* Invalid payload fails closed below. */ }
  const parsed = confirmationRequest.safeParse({
    meetingId: form.get("meetingId"), personId: form.get("personId"), status: form.get("status"), expected,
  });
  if (!parsed.success) redirect("/confirmaciones?error=datos");
  const value = parsed.data;
  const url = `/confirmaciones?meeting=${value.meetingId}`;
  const access = await requireAccess();
  if (access.state !== "approved") redirect("/ingresar");
  const { error } = await access.client.rpc("respond_assignments", {
    p_meeting: value.meetingId, p_person: value.personId, p_status: value.status, p_expected: value.expected,
  });
  if (error) redirect(`${url}&error=${error.message.includes("conflict") ? "conflicto" : "guardar"}`);
  for (const path of ["/confirmaciones", "/inicio", "/cronograma", "/calendario"])
    revalidatePath(path);
  redirect(`${url}&ok=1`);
}

"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/auth";
import { feedbackSubmission } from "@/lib/feedback/model";
export async function submitFeedback(form: FormData) {
  const parsed = feedbackSubmission.safeParse({
    requestId: form.get("requestId"),
    category: form.get("category"),
    comment: form.get("comment"),
  });
  if (!parsed.success) redirect("/feedback?error=datos");
  const access = await requireAccess();
  if (access.state !== "approved") redirect("/ingresar");
  const { error } = await access.client.rpc("submit_meeting_feedback", {
    p_request: parsed.data.requestId,
    p_category: parsed.data.category,
    p_comment: parsed.data.comment,
  });
  if (error) redirect("/feedback?error=guardar");
  for (const path of ["/feedback", "/feedback/admin", "/inicio"])
    revalidatePath(path);
  redirect("/feedback?ok=1");
}

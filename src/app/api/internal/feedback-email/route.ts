import { createHash, timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { mailConfig, processFeedbackEmails } from "@/lib/feedback/email";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.FEEDBACK_WORKER_SECRET;
  const provided = request.headers.get("authorization") ?? "";
  // Authentication is independent of provider configuration and Supabase user
  // roles. No URL/query token, browser cookie or admin role can run the worker.
  if (
    !secret ||
    secret.length < 32 ||
    secret.length > 256 ||
    provided.length > 1024 ||
    !timingSafeEqual(
      createHash("sha256").update(provided).digest(),
      createHash("sha256").update(`Bearer ${secret}`).digest(),
    )
  )
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  const config = mailConfig(process.env);
  if (!config)
    return Response.json(
      { error: "email_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const client = adminClient();
    const result = await processFeedbackEmails(
      (name, args) => client.rpc(name, args),
      config,
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Do not log provider bodies, recipients, authorization headers or API keys.
    return Response.json(
      { error: "email_worker_failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

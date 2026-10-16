import { z } from "zod";
export const emailJob = z.strictObject({
  requestId: z.uuid(),
  leaseToken: z.uuid(),
  recipient: z.string(),
  sender: z.string(),
  origin: z.string(),
});
export type EmailJob = z.infer<typeof emailJob>;
export type MailOutcome = {
  outcome:
    | "accepted"
    | "duplicate"
    | "retry"
    | "uncertain"
    | "rejected"
    | "invalid_response"
    | "invalid_recipient"
    | "configuration_changed";
  messageId: string | null;
};
export function mailConfig(env: Record<string, string | undefined>) {
  if (env.FEEDBACK_EMAIL_ENABLED !== "true") return null;
  const sender = z.email().max(254).safeParse(env.FEEDBACK_FROM_EMAIL);
  if (!sender.success || !env.BREVO_API_KEY || env.BREVO_API_KEY.length < 12)
    return null;
  if (
    env.VERCEL_ENV === "production" &&
    sender.data.toLowerCase() === "hola@damianjure.com"
  )
    return null;
  try {
    const url = new URL(env.APP_URL ?? "");
    const local =
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      env.VERCEL_ENV !== "production";
    if (
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return {
      sender: sender.data,
      origin: url.origin,
      apiKey: env.BREVO_API_KEY,
    };
  } catch {
    return null;
  }
}
export async function sendFeedbackEmail(
  job: EmailJob,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<MailOutcome> {
  const plain = (
    outcome: MailOutcome["outcome"],
    messageId: string | null = null,
  ) => ({ outcome, messageId });
  if (
    !z.email().max(254).safeParse(job.recipient).success ||
    !z.email().max(254).safeParse(job.sender).success
  )
    return plain("invalid_recipient");
  let origin: URL;
  try {
    origin = new URL(job.origin);
    if (
      origin.origin !== job.origin ||
      !["https:", "http:"].includes(origin.protocol)
    )
      return plain("invalid_recipient");
  } catch {
    return plain("invalid_recipient");
  }
  try {
    const response = await fetcher("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Crono Unidos", email: job.sender },
        to: [{ email: job.recipient }],
        subject: "Tu feedback en Crono Unidos",
        textContent: `Tenés una solicitud de feedback pendiente en Crono Unidos. Ingresá con tu cuenta para responder: ${origin.origin}/feedback\n\nLas respuestas son privadas y solo pueden consultarlas administradores.`,
        headers: { idempotencyKey: job.requestId },
      }),
    });
    if (response.status === 201) {
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return plain("invalid_response");
      }
      const parsed = z
        .object({
          messageId: z
            .string()
            .min(1)
            .max(256)
            .refine((v) => v.trim().length > 0 && !/[\r\n]/.test(v)),
        })
        .safeParse(payload);
      return parsed.success
        ? plain("accepted", parsed.data.messageId)
        : plain("invalid_response");
    }
    if (response.status === 400) {
      // Duplicate key confirms prior processing, NOT delivery to an inbox.
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return plain("rejected");
      }
      if (
        z.object({ code: z.literal("duplicate_parameter") }).safeParse(body)
          .success
      )
        return plain("duplicate");
    }
    if (response.status === 429 || response.status >= 500)
      return plain("retry");
    return plain("rejected");
  } catch {
    return plain("uncertain");
  }
}
export type MailRpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>;
export async function processFeedbackEmails(
  rpc: MailRpc,
  config: NonNullable<ReturnType<typeof mailConfig>>,
  fetcher: typeof fetch = fetch,
) {
  const claimed = await rpc("claim_feedback_emails", {
    p_sender: config.sender,
    p_origin: config.origin,
    p_limit: 5,
  });
  if (claimed.error) throw new Error("Mail queue unavailable");
  const jobs = z.array(emailJob).max(5).parse(claimed.data);
  const summary = { processed: 0, accepted: 0, deferred: 0, failed: 0 };
  for (const job of jobs) {
    // Frozen retries must never cross a sender/origin or environment cutover.
    const result: MailOutcome =
      job.sender.toLowerCase() !== config.sender.toLowerCase() ||
      job.origin !== config.origin
        ? { outcome: "configuration_changed", messageId: null }
        : await sendFeedbackEmail(job, config.apiKey, fetcher);
    const saved = await rpc("finish_feedback_email", {
      p_request: job.requestId,
      p_lease: job.leaseToken,
      p_outcome: result.outcome,
      p_message_id: result.messageId,
    });
    if (saved.error) throw new Error("Mail acknowledgement unavailable");
    summary.processed++;
    if (["accepted", "duplicate"].includes(result.outcome)) summary.accepted++;
    else if (["rejected", "invalid_recipient"].includes(result.outcome))
      summary.failed++;
    else summary.deferred++;
  }
  return summary;
}

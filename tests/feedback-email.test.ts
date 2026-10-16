import { it, expect, vi, afterEach } from "vitest";
import {
  mailConfig,
  sendFeedbackEmail,
  processFeedbackEmails,
  type EmailJob,
} from "@/lib/feedback/email";
const job: EmailJob = {
  requestId: "00000000-0000-4000-8000-000000000001",
  leaseToken: "00000000-0000-4000-8000-000000000002",
  recipient: "ficticio@example.invalid",
  sender: "crono@example.invalid",
  origin: "https://crono.example.invalid",
};
const env = {
  FEEDBACK_EMAIL_ENABLED: "true",
  FEEDBACK_FROM_EMAIL: job.sender,
  BREVO_API_KEY: "fictitious-api-key-only",
  APP_URL: job.origin,
  VERCEL_ENV: "preview",
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("email deshabilitado por defecto y origen/remitente válidos", () => {
  expect(mailConfig({})).toBeNull();
  expect(mailConfig(env)?.origin).toBe(job.origin);
  for (const patch of [
    { FEEDBACK_EMAIL_ENABLED: "false" },
    { BREVO_API_KEY: "" },
    { FEEDBACK_FROM_EMAIL: "mal" },
    { APP_URL: "https://user:pass@example.invalid" },
    { APP_URL: "https://crono.example.invalid/ruta" },
    { APP_URL: "http://example.invalid" },
    { APP_URL: "https://crono.example.invalid/?token=x" },
    { VERCEL_ENV: "production", FEEDBACK_FROM_EMAIL: "hola@damianjure.com" },
  ])
    expect(mailConfig({ ...env, ...patch })).toBeNull();
  expect(mailConfig({ ...env, APP_URL: "http://localhost:3101" })?.origin).toBe(
    "http://localhost:3101",
  );
  expect(
    mailConfig({
      ...env,
      APP_URL: "http://localhost:3101",
      VERCEL_ENV: "production",
    }),
  ).toBeNull();
});
it("Brevo recibe contenido genérico, un destinatario y clave idempotente estable", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ messageId: "ficticio-brevo-id" }), {
      status: 201,
    }),
  );
  expect(await sendFeedbackEmail(job, env.BREVO_API_KEY, fetcher)).toEqual({
    outcome: "accepted",
    messageId: "ficticio-brevo-id",
  });
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("https://api.brevo.com/v3/smtp/email");
  expect(options?.redirect).toBe("error");
  const body = JSON.parse(options!.body as string);
  expect(body.headers.idempotencyKey).toBe(job.requestId);
  expect(body.to).toEqual([{ email: job.recipient }]);
  expect(body.textContent).toContain(`${job.origin}/feedback`);
  expect(Object.keys(body).sort()).toEqual([
    "headers",
    "sender",
    "subject",
    "textContent",
    "to",
  ]);
  expect(JSON.stringify(body)).not.toMatch(
    /comment|category|leaseToken|feedback_request|fictitious-api-key-only/,
  );
});
it.each([
  [400, { code: "duplicate_parameter" }, "duplicate"],
  [400, { message: "NO persistir destinatario ni claves" }, "rejected"],
  [401, {}, "rejected"],
  [429, {}, "retry"],
  [503, {}, "retry"],
  [201, {}, "invalid_response"],
  [201, { messageId: "bad\nheader" }, "invalid_response"],
  [200, {}, "rejected"],
] as const)(
  "clasifica proveedor %s sin exponer su cuerpo",
  async (status, body, outcome) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(body), { status }));
    expect(await sendFeedbackEmail(job, env.BREVO_API_KEY, fetcher)).toEqual({
      outcome,
      messageId: null,
    });
  },
);
it("timeout se considera incierto y un destinatario inválido no genera HTTP", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error("fictitious-secret-must-not-escape"));
  expect(await sendFeedbackEmail(job, env.BREVO_API_KEY, fetcher)).toEqual({
    outcome: "uncertain",
    messageId: null,
  });
  fetcher.mockClear();
  expect(
    (
      await sendFeedbackEmail(
        { ...job, recipient: "bad\nrecipient" },
        env.BREVO_API_KEY,
        fetcher,
      )
    ).outcome,
  ).toBe("invalid_recipient");
  expect(fetcher).not.toHaveBeenCalled();
});
it("solo cuenta aceptados después de persistir ack, y nunca oculta fallos de base", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: [job], error: null })
    .mockResolvedValueOnce({ data: null, error: null });
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify({ messageId: "ficticio" }), { status: 201 }),
    );
  expect(await processFeedbackEmails(rpc, mailConfig(env)!, fetcher)).toEqual({
    processed: 1,
    accepted: 1,
    deferred: 0,
    failed: 0,
  });
  expect(rpc.mock.calls[1][1]).toMatchObject({
    p_request: job.requestId,
    p_lease: job.leaseToken,
    p_outcome: "accepted",
    p_message_id: "ficticio",
  });
  const broken = vi
    .fn()
    .mockResolvedValueOnce({ data: [job], error: null })
    .mockResolvedValueOnce({ data: null, error: { message: "ficticio" } });
  await expect(
    processFeedbackEmails(
      broken,
      mailConfig(env)!,
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ messageId: "ficticio" }), {
          status: 201,
        }),
      ),
    ),
  ).rejects.toThrow("Mail acknowledgement unavailable");
  await expect(
    processFeedbackEmails(
      vi.fn().mockResolvedValue({ data: null, error: { message: "no" } }),
      mailConfig(env)!,
      fetcher,
    ),
  ).rejects.toThrow("Mail queue unavailable");
});

it("contabiliza diferidos y errores permanentes sin convertirlos en éxitos", async () => {
  const jobs = [
    { ...job, recipient: "invalido" },
    { ...job, requestId: "00000000-0000-4000-8000-000000000003" },
  ];
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: jobs, error: null })
    .mockResolvedValue({ data: null, error: null });
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("{}", { status: 429 }));
  expect(await processFeedbackEmails(rpc, mailConfig(env)!, fetcher)).toEqual({
    processed: 2,
    accepted: 0,
    deferred: 1,
    failed: 1,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("respuestas rotas y orígenes inválidos no se convierten en envíos aceptados", async () => {
  for (const [status, outcome] of [
    [201, "invalid_response"],
    [400, "rejected"],
  ] as const) {
    const response = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("no-json", { status }));
    expect(
      (await sendFeedbackEmail(job, env.BREVO_API_KEY, response)).outcome,
    ).toBe(outcome);
  }
  const fetcher = vi.fn<typeof fetch>();
  for (const origin of ["invalid-url", "https://crono.example.invalid/path"])
    expect(
      (await sendFeedbackEmail({ ...job, origin }, env.BREVO_API_KEY, fetcher))
        .outcome,
    ).toBe("invalid_recipient");
  expect(fetcher).not.toHaveBeenCalled();
  expect(mailConfig({ ...env, APP_URL: "invalid-url" })).toBeNull();
  const response = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify({ messageId: "   " }), { status: 201 }),
    );
  expect(
    (await sendFeedbackEmail(job, env.BREVO_API_KEY, response)).outcome,
  ).toBe("invalid_response");
});
it("un payload congelado de Preview no se envía con otro remitente/origen", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({
      data: [
        {
          ...job,
          sender: "hola@damianjure.com",
          origin: "https://preview.example.invalid",
        },
      ],
      error: null,
    })
    .mockResolvedValue({ data: null, error: null });
  const fetcher = vi.fn<typeof fetch>();
  expect(
    await processFeedbackEmails(
      rpc,
      mailConfig({ ...env, VERCEL_ENV: "production" })!,
      fetcher,
    ),
  ).toEqual({ processed: 1, accepted: 0, deferred: 1, failed: 0 });
  expect(fetcher).not.toHaveBeenCalled();
  expect(rpc.mock.calls[1][1]).toMatchObject({
    p_outcome: "configuration_changed",
  });
});

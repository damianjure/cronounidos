import { it, expect, vi, afterEach } from "vitest";
const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: admin }));
import { POST } from "@/app/api/internal/feedback-email/route";
const secret = "fictitious-machine-secret-never-real-123456789";
function request(token?: string) {
  return new Request(
    "https://crono.example.invalid/api/internal/feedback-email",
    {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    },
  );
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  admin.mockReset();
});
it("rechaza navegador, secretos ausentes/incorrectos y nunca toca la base", async () => {
  vi.stubEnv("FEEDBACK_WORKER_SECRET", secret);
  for (const token of [undefined, "incorrecto", "x".repeat(2000)])
    expect((await POST(request(token))).status).toBe(401);
  vi.stubEnv("FEEDBACK_WORKER_SECRET", "");
  expect((await POST(request(secret))).status).toBe(401);
  expect(admin).not.toHaveBeenCalled();
});
it("sin proveedor explícitamente habilitado devuelve 503, sin reclamar correo", async () => {
  vi.stubEnv("FEEDBACK_WORKER_SECRET", secret);
  vi.stubEnv("FEEDBACK_EMAIL_ENABLED", "false");
  const response = await POST(request(secret));
  expect(response.status).toBe(503);
  expect(admin).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("el worker autenticado no expone claves ni destinatarios en errores", async () => {
  for (const [key, value] of Object.entries({
    FEEDBACK_WORKER_SECRET: secret,
    FEEDBACK_EMAIL_ENABLED: "true",
    FEEDBACK_FROM_EMAIL: "crono@example.invalid",
    APP_URL: "https://crono.example.invalid",
    BREVO_API_KEY: "fictitious-api-key-only",
  }))
    vi.stubEnv(key, value);
  admin.mockImplementation(() => {
    throw Error("fictitious-api-key-only ficticio@example.invalid");
  });
  const response = await POST(request(secret));
  expect(response.status).toBe(502);
  expect(await response.text()).toBe('{"error":"email_worker_failed"}');
});

it("sin trabajo devuelve solo contadores, nunca email ni secretos", async () => {
  for (const [key, value] of Object.entries({
    FEEDBACK_WORKER_SECRET: secret,
    FEEDBACK_EMAIL_ENABLED: "true",
    FEEDBACK_FROM_EMAIL: "crono@example.invalid",
    APP_URL: "https://crono.example.invalid",
    BREVO_API_KEY: "fictitious-api-key-only",
  }))
    vi.stubEnv(key, value);
  admin.mockReturnValue({
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  });
  const response = await POST(request(secret));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    processed: 0,
    accepted: 0,
    deferred: 0,
    failed: 0,
  });
});

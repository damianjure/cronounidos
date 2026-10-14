import { describe, it, expect } from "vitest";
import { coverage, timeline, resetConfirmations } from "@/lib/domain";
import { credentials, adminInput, safeRedirect } from "@/lib/auth-validation";
import { supabaseConfig } from "@/lib/env";
import { vi, afterEach } from "vitest";
afterEach(() => vi.unstubAllEnvs());
describe("cobertura por puesto", () => {
  it("sin puestos es gris, no 100%", () =>
    expect(coverage([])).toMatchObject({ color: "gray", percentage: null }));
  it("opcional fuera del denominador", () =>
    expect(
      coverage([{ priority: "optional", status: "confirmed" }]).total,
    ).toBe(0));
  it("rojo debajo de 60%", () =>
    expect(coverage([{ priority: "required" }]).color).toBe("red"));
  it("amarillo desde 60 hasta menos de 90", () =>
    expect(
      coverage(
        Array.from({ length: 10 }, (_, i) => ({
          priority: "required",
          status: i < 6 ? "confirmed" : "pending",
        })),
      ),
    ).toMatchObject({ color: "yellow", percentage: 60 }));
  it("95% sin crítico confirmado sigue amarillo", () =>
    expect(
      coverage([
        { priority: "critical" },
        ...Array.from({ length: 19 }, () => ({
          priority: "required" as const,
          status: "confirmed" as const,
        })),
      ]),
    ).toMatchObject({ color: "yellow", percentage: 95 }));
  it("90% y todos los críticos confirma verde", () =>
    expect(
      coverage(
        Array.from({ length: 10 }, (_, i) => ({
          priority: i === 0 ? "critical" : "required",
          status: i < 9 ? "confirmed" : "pending",
        })),
      ),
    ).toMatchObject({ color: "green", percentage: 90 }));
  it("cuenta pendientes, rechazos y vacantes por separado", () =>
    expect(
      coverage([
        { priority: "required" },
        { priority: "critical", status: "pending" },
        { priority: "required", status: "unavailable" },
      ]),
    ).toMatchObject({ pending: 1, unavailable: 1, vacant: 1 }));
});
describe("horarios UTC", () => {
  it("recalcula eje lineal cruzando medianoche", () =>
    expect(timeline("2026-10-15T23:50:00-03:00", [600, 1200])).toEqual([
      { start: "2026-10-16T02:50:00.000Z", end: "2026-10-16T03:00:00.000Z" },
      { start: "2026-10-16T03:00:00.000Z", end: "2026-10-16T03:20:00.000Z" },
    ]));
  it("rechaza fecha inválida", () =>
    expect(() => timeline("invalid", [])).toThrow());
  it.each([-1, 1.5, NaN])("rechaza duración %s", (n) =>
    expect(() => timeline("2026-10-15T00:00:00Z", [n])).toThrow(),
  );
  it("duración cero válida", () =>
    expect(timeline("2026-10-15T00:00:00Z", [0])[0].start).toEqual(
      timeline("2026-10-15T00:00:00Z", [0])[0].end,
    ));
});
it("duplicación resetea estado sin mutar original", () => {
  const a = [
    {
      status: "confirmed" as const,
      responded_at: "2026-10-14",
      person_id: "p",
    },
  ];
  expect(resetConfirmations(a)).toEqual([
    { status: "pending", responded_at: null, person_id: "p" },
  ]);
  expect(a[0].status).toBe("confirmed");
});
it("validación email/clave y altas", () => {
  expect(
    credentials.safeParse({ email: "bad", password: "short" }).success,
  ).toBe(false);
  expect(
    adminInput.safeParse({
      orgId: "not-uuid",
      mode: "invite",
      email: "bad",
      displayName: "x",
    }).success,
  ).toBe(false);
  expect(
    adminInput.safeParse({
      orgId: "10000000-0000-4000-8000-000000000001",
      mode: "create",
      email: "ficticio@example.invalid",
      displayName: "Prueba",
    }).success,
  ).toBe(false);
});
it("redirect nunca sale del sitio", () => {
  expect(safeRedirect("//evil.test")).toBe("/inicio");
  expect(safeRedirect("https://evil.test")).toBe("/inicio");
  expect(safeRedirect(null)).toBe("/inicio");
  expect(safeRedirect("/inicio")).toBe("/inicio");
  expect(safeRedirect("/\\evil")).toBe("/inicio");
});
it("sin variables no inventa backend", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  expect(supabaseConfig()).toBeNull();
});
it("URL valida y clave presente", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://demo.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "demo");
  expect(supabaseConfig()).toEqual({
    url: "https://demo.supabase.co",
    key: "demo",
  });
});
it.each(["bad", "ftp://bad"])("rechaza URL %s", (url) => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "demo");
  expect(supabaseConfig()).toBeNull();
});

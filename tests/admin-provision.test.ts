import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  rpc: vi.fn(),
  invite: vi.fn(),
  create: vi.fn(),
  deleteUser: vi.fn(),
  adminClient: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: mocks.adminClient }));
import { provisionUser } from "@/app/(interno)/administracion/actions";
const org = "00000000-0000-4000-8000-000000000001";
const user = "00000000-0000-4000-8000-000000000099";
function form(mode = "invite") {
  const data = new FormData();
  for (const [k, v] of Object.entries({
    orgId: org,
    email: "persona@example.invalid",
    displayName: "Persona ficticia",
    mode,
    password: "clave-ficticia-segura",
  }))
    data.set(k, v);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "https://crono.example.invalid");
  mocks.requireAdmin.mockResolvedValue({ rpc: mocks.rpc });
  mocks.adminClient.mockReturnValue({
    auth: {
      admin: {
        inviteUserByEmail: mocks.invite,
        createUser: mocks.create,
        deleteUser: mocks.deleteUser,
      },
    },
  });
  for (const fn of [mocks.invite, mocks.create])
    fn.mockResolvedValue({ data: { user: { id: user } }, error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});
it.each(["invite", "create"])(
  "%s completa la membresía sin compensaciones destructivas",
  async (mode) => {
    await expect(provisionUser(form(mode))).rejects.toThrow(
      "redirect:/administracion?ok=alta",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("register_invited_member", {
      p_org: org,
      p_user: user,
    });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  },
);
it.each(["invite", "create"])(
  "%s conserva identidad y membresía ante resultado incierto",
  async (mode) => {
    mocks.rpc.mockResolvedValue({
      error: { message: "network response lost after possible commit" },
    });
    await expect(provisionUser(form(mode))).rejects.toThrow(
      "redirect:/administracion?error=membresia",
    );
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  },
);
it("reenviar invitación a una cuenta preexistente no la elimina ante un fallo", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "Forbidden" } });
  await expect(provisionUser(form())).rejects.toThrow("error=membresia");
  await expect(provisionUser(form())).rejects.toThrow("error=membresia");
  expect(mocks.invite).toHaveBeenCalledTimes(2);
  expect(mocks.deleteUser).not.toHaveBeenCalled();
});
it("autoriza antes de usar el cliente privilegiado", async () => {
  mocks.requireAdmin.mockRejectedValue(new Error("Forbidden"));
  await expect(provisionUser(form())).rejects.toThrow("Forbidden");
  expect(mocks.adminClient).not.toHaveBeenCalled();
});
it("entrada inválida no consulta servicios", async () => {
  const data = form();
  data.set("orgId", "invalid");
  await expect(provisionUser(data)).rejects.toThrow("error=datos");
  expect(mocks.requireAdmin).not.toHaveBeenCalled();
});
it("falta de clave segura no envía invitaciones", async () => {
  mocks.adminClient.mockImplementation(() => {
    throw new Error("not configured");
  });
  await expect(provisionUser(form())).rejects.toThrow("error=configuracion");
  expect(mocks.invite).not.toHaveBeenCalled();
});
it.each(["", "not a url", "javascript:alert(1)"])(
  "APP_URL inválida (%s) falla sin efectos",
  async (origin) => {
    vi.stubEnv("APP_URL", origin);
    await expect(provisionUser(form())).rejects.toThrow("error=configuracion");
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  },
);
it.each(["invite", "create"])(
  "%s rechazado por Auth no registra ni borra usuarios",
  async (mode) => {
    (mode === "invite" ? mocks.invite : mocks.create).mockResolvedValue({
      data: { user: null },
      error: { message: "rejected" },
    });
    await expect(provisionUser(form(mode))).rejects.toThrow("error=alta");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  },
);
it("error lanzado por RPC también conserva la cuenta y se informa", async () => {
  mocks.rpc.mockRejectedValue(new Error("transport failure"));
  await expect(provisionUser(form())).rejects.toThrow("error=membresia");
  expect(mocks.deleteUser).not.toHaveBeenCalled();
});

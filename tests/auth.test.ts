import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  signup: vi.fn(),
  login: vi.fn(),
  recover: vi.fn(),
  update: vi.fn(),
  signout: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCode: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  serverClient: async () => ({
    auth: {
      getUser: mocks.getUser,
      signUp: mocks.signup,
      signInWithPassword: mocks.login,
      resetPasswordForEmail: mocks.recover,
      updateUser: mocks.update,
      signOut: mocks.signout,
      verifyOtp: mocks.verifyOtp,
      exchangeCodeForSession: mocks.exchangeCode,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}));
import { accessContext, requireAccess, requireAdmin } from "@/lib/auth";
import { authAction, requestAccess, signOut } from "@/app/auth/actions";
import { GET as confirmEmail } from "@/app/auth/confirm/route";
import { GET as callback } from "@/app/auth/callback/route";
import { NextRequest } from "next/server";
const form = (
  email = "ficticio@example.invalid",
  password = "clave-ficticia-segura",
) => {
  const f = new FormData();
  f.set("displayName", "Persona ficticia");
  f.set("email", email);
  f.set("password", password);
  return f;
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable");
  vi.stubEnv("APP_URL", "https://chrono.example.invalid");
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "test-id", email: "ficticio@example.invalid" } },
    error: null,
  });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  for (const fn of [
    mocks.signup,
    mocks.login,
    mocks.recover,
    mocks.update,
    mocks.signout,
    mocks.verifyOtp,
    mocks.exchangeCode,
  ])
    fn.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table: string) => {
    const result =
      table === "memberships"
        ? { data: [{ org_id: "org-a", status: "approved" }], error: null }
        : { data: { approved_at: "2026-10-14" }, error: null };
    const query = {
      select: () => query,
      eq: () => query,
      order: async () => result,
      single: async () => result,
    };
    return query;
  });
});
it("confirmación usa APP_URL canónica y no el host de la solicitud", async () => {
  const request = new NextRequest(
    "http://localhost:3105/auth/confirm?token_hash=fake-token&type=invite",
  );
  const response = await confirmEmail(request);
  expect(response.headers.get("location")).toBe(
    "https://chrono.example.invalid/actualizar-clave",
  );
  expect(mocks.verifyOtp).toHaveBeenCalledWith({
    token_hash: "fake-token",
    type: "invite",
  });
});
it("callback PKCE usa APP_URL canónica", async () => {
  const response = await callback(
    new NextRequest("http://localhost:3105/auth/callback?code=fake-code"),
  );
  expect(response.headers.get("location")).toBe(
    "https://chrono.example.invalid/inicio",
  );
  expect(mocks.exchangeCode).toHaveBeenCalledWith("fake-code");
});
it("acceso no configurado nunca consulta backend", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  expect(await requireAccess()).toEqual({ state: "unconfigured" });
  expect(mocks.getUser).not.toHaveBeenCalled();
});
it("valida usuario en servidor y devuelve membresía aprobada", async () => {
  expect(await accessContext()).toMatchObject({
    state: "approved",
    orgId: "org-a",
  });
  expect(mocks.getUser).toHaveBeenCalledOnce();
});
it("sin usuario exige login", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  await expect(requireAccess()).rejects.toThrow("redirect:/ingresar");
});
it("membresía aprobada pero perfil sin aprobación exige aprobación", async () => {
  mocks.from.mockImplementation((table: string) => {
    const result =
      table === "profiles"
        ? { data: { approved_at: null }, error: null }
        : { data: [{ org_id: "org-a" }], error: null };
    const q = {
      select: () => q,
      eq: () => q,
      order: async () => result,
      single: async () => result,
    };
    return q;
  });
  await expect(requireAccess()).rejects.toThrow("redirect:/pendiente");
});
it("errores de auth 5xx fallan cerrado", async () => {
  mocks.getUser.mockResolvedValue({
    data: { user: null },
    error: { status: 503 },
  });
  await expect(accessContext()).rejects.toThrow("verificar la sesión");
});
it("error de RLS/schema no se silencia como lista vacía", async () => {
  const q = {
    select: () => q,
    eq: () => q,
    order: async () => ({ data: null, error: { message: "schema" } }),
  };
  mocks.from.mockReturnValue(q);
  await expect(accessContext()).rejects.toThrow("consultar la membresía");
});
it("administración consulta permiso real, no metadata", async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  await expect(requireAdmin("org-a")).rejects.toThrow(
    "permiso de administración",
  );
  expect(mocks.rpc).toHaveBeenCalledWith("has_permission", {
    p_org: "org-a",
    p_permission: "administer",
    p_team: null,
  });
});
it("backend sin configurar informa antes de autenticar", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  expect(await authAction("login", { message: "" }, form())).toMatchObject({
    message: expect.stringContaining("Falta conectar"),
  });
});
it("login valida datos y error no revela existencia de correo", async () => {
  expect(
    await authAction("login", { message: "" }, form("bad", "short")),
  ).toMatchObject({ message: expect.any(String) });
  expect(mocks.login).not.toHaveBeenCalled();
  mocks.login.mockResolvedValue({ error: { message: "private details" } });
  expect(await authAction("login", { message: "" }, form())).toEqual({
    message: "No pudimos ingresar. Revisá el correo y la contraseña.",
  });
});
it("login correcto redirige a ruta fija", async () => {
  await expect(authAction("login", { message: "" }, form())).rejects.toThrow(
    "redirect:/inicio",
  );
});
it("signup usa APP_URL fija y no otorga membresía", async () => {
  expect(await authAction("signup", { message: "" }, form())).toMatchObject({
    ok: true,
  });
  expect(mocks.signup).toHaveBeenCalledWith(
    expect.objectContaining({
      options: {
        emailRedirectTo: "https://chrono.example.invalid/auth/confirm",
        data: { display_name: "Persona ficticia" },
      },
    }),
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("signup sin APP_URL no envía mail", async () => {
  vi.stubEnv("APP_URL", "");
  expect(await authAction("signup", { message: "" }, form())).toMatchObject({
    message: expect.stringContaining("APP_URL"),
  });
  expect(mocks.signup).not.toHaveBeenCalled();
});
it("signup error no dice que el correo ya existe", async () => {
  mocks.signup.mockResolvedValue({ error: { message: "already exists" } });
  expect(await authAction("signup", { message: "" }, form())).toEqual({
    message:
      "No se pudo registrar la cuenta. Verificá los datos o intentá nuevamente.",
  });
});
it("recuperación tiene respuesta genérica y callback fijo", async () => {
  expect(await authAction("recover", { message: "" }, form())).toMatchObject({
    ok: true,
    message: expect.stringContaining("Si existe"),
  });
  expect(mocks.recover).toHaveBeenCalledWith("ficticio@example.invalid", {
    redirectTo: "https://chrono.example.invalid/auth/confirm",
  });
});
it("recuperación rechaza correo inválido", async () => {
  expect(await authAction("recover", { message: "" }, form("bad"))).toEqual({
    message: "Ingresá un correo válido.",
  });
  expect(mocks.recover).not.toHaveBeenCalled();
});
it("actualizar clave exige sesión validada", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect(await authAction("update", { message: "" }, form())).toEqual({
    message: "El enlace expiró. Solicitá uno nuevo.",
  });
  expect(mocks.update).not.toHaveBeenCalled();
});
it("actualizar clave con sesión válida redirige", async () => {
  await expect(authAction("update", { message: "" }, form())).rejects.toThrow(
    "redirect:/inicio",
  );
  expect(mocks.update).toHaveBeenCalledWith({
    password: "clave-ficticia-segura",
  });
});
it("solicitud de acceso usa RPC y comunica fallo", async () => {
  const f = new FormData();
  f.set("slug", "unidos-demo");
  mocks.rpc.mockResolvedValue({ error: { message: "not found" } });
  await expect(requestAccess(f)).rejects.toThrow(
    "redirect:/pendiente?error=solicitud",
  );
});
it("logout no afirma éxito si Supabase falla", async () => {
  mocks.signout.mockResolvedValue({ error: { message: "offline" } });
  await expect(signOut()).rejects.toThrow("No se pudo cerrar la sesión");
});
it("logout correcto lleva a limpieza de cachés", async () => {
  await expect(signOut()).rejects.toThrow("redirect:/salida");
});

it("membresía vacía y perfil válido sigue pendiente", async () => {
  mocks.from.mockImplementation((table: string) => {
    const result =
      table === "memberships"
        ? { data: [], error: null }
        : { data: { approved_at: "2026-10-14" }, error: null };
    const q = {
      select: () => q,
      eq: () => q,
      order: async () => result,
      single: async () => result,
    };
    return q;
  });
  expect(await accessContext()).toMatchObject({ state: "pending" });
});
it("error de perfil no se silencia", async () => {
  mocks.from.mockImplementation((table: string) => {
    const result =
      table === "profiles"
        ? { data: null, error: { message: "schema" } }
        : { data: [{ org_id: "org-a" }], error: null };
    const q = {
      select: () => q,
      eq: () => q,
      order: async () => result,
      single: async () => result,
    };
    return q;
  });
  await expect(accessContext()).rejects.toThrow("consultar el perfil");
});
it("requireAdmin rechaza cuenta anónima antes de RPC", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  await expect(requireAdmin("org-a")).rejects.toThrow("Acceso no autorizado");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("requireAdmin devuelve cliente solo con permiso válido", async () => {
  await expect(requireAdmin("org-a")).resolves.toMatchObject({
    rpc: expect.any(Function),
  });
});
it.each(["bad", "ftp://bad"])(
  "APP_URL inválida %s bloquea correos",
  async (url) => {
    vi.stubEnv("APP_URL", url);
    expect(await authAction("recover", { message: "" }, form())).toMatchObject({
      message: expect.stringContaining("APP_URL"),
    });
  },
);
it("operación inválida se rechaza", async () => {
  expect(await authAction("invalid", { message: "" }, form())).toEqual({
    message: "Operación inválida.",
  });
});
it("error al recuperar correo se informa", async () => {
  mocks.recover.mockResolvedValue({ error: { message: "SMTP" } });
  expect(await authAction("recover", { message: "" }, form())).toEqual({
    message: "No se pudo enviar el correo. Intentá nuevamente.",
  });
});
it("error al actualizar contraseña se informa", async () => {
  mocks.update.mockResolvedValue({ error: { message: "bad password" } });
  expect(await authAction("update", { message: "" }, form())).toEqual({
    message: "No se pudo actualizar la contraseña.",
  });
});
it("solicitud exitosa comunica estado y slug inválido no llega al backend", async () => {
  const f = new FormData();
  f.set("slug", "unidos-demo");
  await expect(requestAccess(f)).rejects.toThrow(
    "redirect:/pendiente?solicitado=1",
  );
  mocks.rpc.mockClear();
  f.set("slug", "BAD");
  await expect(requestAccess(f)).rejects.toThrow(
    "redirect:/pendiente?error=slug",
  );
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(["", "x", "x".repeat(101)])(
  "signup valida nombre visible %s",
  async (name) => {
    const f = form();
    f.set("displayName", name);
    expect(await authAction("signup", { message: "" }, f)).toEqual({
      message: "Ingresá tu nombre (entre 2 y 100 caracteres).",
    });
    expect(mocks.signup).not.toHaveBeenCalled();
  },
);

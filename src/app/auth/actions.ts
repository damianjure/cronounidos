"use server";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { credentials } from "@/lib/auth-validation";
import { supabaseConfig } from "@/lib/env";
export type AuthResult = { message: string; ok?: boolean };
function baseUrl() {
  const value = process.env.APP_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}
export async function authAction(
  mode: string,
  _previous: AuthResult,
  form: FormData,
): Promise<AuthResult> {
  if (!supabaseConfig())
    return { message: "Falta conectar Supabase. Consultá Configuración." };
  if (!["login", "signup", "recover", "update"].includes(mode))
    return { message: "Operación inválida." };
  const origin = baseUrl();
  if (["signup", "recover"].includes(mode) && !origin)
    return {
      message: "Falta configurar APP_URL para enviar enlaces de correo.",
    };
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (mode === "recover") {
    if (!credentials.shape.email.safeParse(email).success)
      return { message: "Ingresá un correo válido." };
    const c = await serverClient();
    const { error } = await c.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/actualizar-clave`,
    });
    if (error)
      return { message: "No se pudo enviar el correo. Intentá nuevamente." };
    return {
      ok: true,
      message: "Si existe una cuenta para ese correo, vas a recibir un enlace.",
    };
  }
  const parsed = credentials.safeParse({ email, password });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const client = await serverClient();
  if (mode === "signup") {
    const displayName = String(form.get("displayName") ?? "").trim();
    if (displayName.length < 2 || displayName.length > 100)
      return { message: "Ingresá tu nombre (entre 2 y 100 caracteres)." };
    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
        data: { display_name: displayName },
      },
    });
    if (error)
      return {
        message:
          "No se pudo registrar la cuenta. Verificá los datos o intentá nuevamente.",
      };
    return {
      ok: true,
      message:
        "Revisá tu correo para verificar la cuenta. Después ingresá y solicitá acceso; un administrador debe aprobarlo.",
    };
  }
  if (mode === "update") {
    const {
      data: { user },
      error: verificationError,
    } = await client.auth.getUser();
    if (verificationError || !user)
      return { message: "El enlace expiró. Solicitá uno nuevo." };
    const { error } = await client.auth.updateUser({ password });
    if (error) return { message: "No se pudo actualizar la contraseña." };
    redirect("/inicio");
  }
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error)
    return {
      message: "No pudimos ingresar. Revisá el correo y la contraseña.",
    };
  redirect("/inicio");
}
export async function signOut() {
  const c = await serverClient();
  const { error } = await c.auth.signOut();
  if (error)
    throw new Error("No se pudo cerrar la sesión. Intentá nuevamente.");
  redirect("/salida");
}
export async function requestAccess(form: FormData) {
  const c = await serverClient();
  const slug = String(form.get("slug") ?? "");
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) redirect("/pendiente?error=slug");
  const { error } = await c.rpc("request_access", { p_slug: slug });
  if (error) redirect("/pendiente?error=solicitud");
  redirect("/pendiente?solicitado=1");
}

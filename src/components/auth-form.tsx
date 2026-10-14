"use client";
import Link from "next/link";
import { useActionState } from "react";
import { authAction } from "@/app/auth/actions";
import { Button } from "./ui/button";
export function AuthForm({
  mode = "login",
}: {
  mode?: "login" | "signup" | "recover" | "update";
}) {
  const [state, action, pending] = useActionState(authAction.bind(null, mode), {
    message: "",
  });
  const title = {
    login: "Ingresar a mi cuenta",
    signup: "Crear una cuenta",
    recover: "Recuperar contraseña",
    update: "Elegir nueva contraseña",
  }[mode];
  return (
    <section className="panel auth-form">
      <h1>{title}</h1>
      <p className="muted" style={{ marginTop: 12 }}>
        {mode === "signup"
          ? "El registro no habilita acceso interno: tu cuenta necesita aprobación."
          : "Usá el correo de tu cuenta de Chrono Unidos."}
      </p>
      <form action={action}>
        {mode === "signup" && (
          <label className="field">
            Nombre visible
            <input
              name="displayName"
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
            />
          </label>
        )}
        <label className="field">
          Correo electrónico
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        {mode !== "recover" && (
          <label className="field">
            Contraseña
            <input
              type="password"
              name="password"
              minLength={10}
              maxLength={128}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
            />
            <span className="muted">Al menos 10 caracteres.</span>
          </label>
        )}
        {state.message && (
          <p
            className={`form-message ${state.ok ? "" : "error"}`}
            role={state.ok ? "status" : "alert"}
          >
            {state.message}
          </p>
        )}
        <Button disabled={pending}>
          {pending
            ? "Procesando…"
            : mode === "recover"
              ? "Enviar enlace"
              : mode === "update"
                ? "Actualizar contraseña"
                : title}
        </Button>
      </form>
      <div className="auth-links">
        {mode !== "login" && <Link href="/ingresar">Ya tengo cuenta</Link>}
        {mode === "login" && (
          <>
            <Link href="/registro">Crear cuenta</Link>
            <Link href="/recuperar">Olvidé mi contraseña</Link>
          </>
        )}
        <Link href="/">Ver agenda pública</Link>
      </div>
    </section>
  );
}

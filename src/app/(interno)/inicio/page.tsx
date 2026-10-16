import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireAccess } from "@/lib/auth";
import { signOut } from "@/app/auth/actions";
export default async function Dashboard() {
  const access = await requireAccess();
  let notifications = 0;
  if (access.state === "approved") {
    const result = await access.client
      .from("personal_notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    if (result.error) throw new Error("No se pudieron consultar tus avisos.");
    notifications = result.count ?? 0;
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Inicio del equipo</h1>
          <p className="muted">
            Tu cuenta está aprobada. La base de Crono Unidos ya está conectada.
          </p>
        </div>
        <form action={signOut}>
          <Button variant="outline">Cerrar sesión</Button>
        </form>
      </div>
      {notifications > 0 && (
        <p className="notice" role="status">
          <Link href="/feedback">
            Tenés {notifications} solicitud{notifications === 1 ? "" : "es"} de
            feedback pendiente{notifications === 1 ? "" : "s"}. Responder
            feedback
          </Link>
        </p>
      )}
      <section className="panel">
        <h2>Primeros pasos</h2>
        <p className="muted">
          Ya podés preparar reuniones en el editor, consultar el directorio y
          responder asignaciones según tus permisos. Ya está disponible el
          calendario mensual con cobertura agregada; también podés revisar la
          matriz, los conflictos y operar el modo en vivo según tus permisos.
        </p>
        <p className="footer-note">
          {access.state === "approved" ? access.user.email : ""}
        </p>
        <div className="auth-links">
          <Link href="/cronograma">Cronograma</Link>
          <Link href="/confirmaciones">Confirmaciones</Link>
          <Link href="/feedback">Mi feedback</Link>
          <Link href="/personas">Personas y equipos</Link>
          <Link href="/administracion">Administrar accesos</Link>
        </div>
      </section>
    </>
  );
}

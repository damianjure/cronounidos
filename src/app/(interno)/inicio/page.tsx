import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireAccess } from "@/lib/auth";
import { signOut } from "@/app/auth/actions";
export default async function Dashboard() {
  const access = await requireAccess();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Inicio del equipo</h1>
          <p className="muted">
            Tu cuenta está aprobada. La base de Chrono Unidos ya está conectada.
          </p>
        </div>
        <form action={signOut}>
          <Button variant="outline">Cerrar sesión</Button>
        </form>
      </div>
      <section className="panel">
        <h2>Primeros pasos</h2>
        <p className="muted">
          El editor de reuniones se implementa en el Sprint 2. Ya podés
          consultar el directorio y administrar accesos según tus permisos.
        </p>
        <p className="footer-note">
          {access.state === "approved" ? access.user.email : ""}
        </p>
        <div className="auth-links">
          <Link href="/personas">Personas y equipos</Link>
          <Link href="/administracion">Administrar accesos</Link>
        </div>
      </section>
    </>
  );
}

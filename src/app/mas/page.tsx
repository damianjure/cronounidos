import Link from "next/link";
import {
  Settings,
  Users,
  ShieldCheck,
  LogIn,
  CalendarDays,
} from "lucide-react";
export default function More() {
  return (
    <>
      <div className="page-heading">
        <h1>Más</h1>
      </div>
      <nav className="more-links" aria-label="Más opciones">
        <Link href="/personas">
          <Users />
          Personas y equipos
        </Link>
        <Link href="/administracion">
          <ShieldCheck />
          Administración
        </Link>
        <Link href="/configuracion">
          <Settings />
          Configuración
        </Link>
        <Link href="/ingresar">
          <LogIn />
          Mi cuenta
        </Link>
        <Link href="/">
          <CalendarDays />
          Agenda pública
        </Link>
      </nav>
    </>
  );
}

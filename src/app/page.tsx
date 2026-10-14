import Link from "next/link";
import { CalendarDays, LockKeyhole } from "lucide-react";
import { publicClient } from "@/lib/supabase/public";
import { SetupNotice } from "@/components/setup-notice";
import { Button } from "@/components/ui/button";
import { PublicAgenda, type PublicRow } from "@/components/public-agenda";
export const dynamic = "force-dynamic";
export default async function Home() {
  const client = publicClient();
  const result = client
    ? await client.rpc("public_agenda", { p_meeting: null })
    : null;
  const rows = (result?.data ?? []) as PublicRow[];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Nos encontramos.
            <br />
            Nos organizamos.
          </h1>
          <p className="muted">Agenda de reuniones de Unidos para Servir.</p>
        </div>
        <span className="pill">Agenda pública</span>
      </div>
      {!client && <SetupNotice />}
      {result?.error && (
        <div className="notice" role="alert">
          No se pudo cargar la agenda. Intentá nuevamente; si persiste, verificá
          las migraciones de Supabase.
        </div>
      )}
      <div className="grid">
        <section className="panel">
          <div className="section-title">
            <h2>Próximas reuniones</h2>
            <CalendarDays size={22} />
          </div>
          {rows.length ? (
            <PublicAgenda rows={rows} />
          ) : (
            <div className="empty">
              <CalendarDays size={42} />
              <h3>
                {result?.error
                  ? "La agenda no está disponible"
                  : "Todavía no hay reuniones publicadas"}
              </h3>
              <p className="muted">
                {result?.error
                  ? "No pudimos verificar las reuniones. Volvé a intentar en unos minutos."
                  : "Cuando el equipo publique una reunión, vas a encontrar acá sus actividades, horarios y duración."}
              </p>
            </div>
          )}
        </section>
        <aside className="stack">
          <section className="intro">
            <div className="status-line">
              <span className="dot" />
              Coordinación de equipos
            </div>
            <h2>El plan que nos une</h2>
            <p>
              Si sos parte de un equipo, ingresá con tu cuenta para consultar la
              información que tenés habilitada.
            </p>
            <Button asChild>
              <Link href="/ingresar">Ingresar a mi cuenta</Link>
            </Button>
          </section>
          <section className="panel placeholder">
            <LockKeyhole size={24} />
            <div>
              <h3>Solo lo necesario</h3>
              <p className="muted">
                Esta agenda no comparte personas, notas, canciones ni
                información interna.
              </p>
            </div>
          </section>
        </aside>
      </div>
      <p className="footer-note">
        Horarios según la zona de cada reunión. Por defecto, Buenos Aires.
      </p>
    </>
  );
}

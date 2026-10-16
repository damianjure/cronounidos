import Link from "next/link";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { CancelMeetingForm } from "@/components/editor/cancel-meeting-form";
export default async function Schedule({ searchParams }: { searchParams: Promise<{ error?: string; cancelled?: string }> }) {
  const a = await requireAccess();
  if (a.state !== "approved") return null;
  const params = await searchParams;
  const [rows, permission, noteTeams] = await Promise.all([
    a.client
      .from("meetings")
      .select("id,title,date,status,version,draft_revision_id,published_revision_id")
      .eq("org_id", a.orgId)
      .order("date")
      .limit(100),
    a.client.rpc("can_edit_meetings", { p_org: a.orgId }),
    a.client.rpc("team_note_editor_teams", { p_org: a.orgId }),
  ]);
  if (rows.error || permission.error || noteTeams.error)
    throw new Error("No se pudo consultar el cronograma.");
  const editableTeams = z.array(z.object({ id: z.uuid(), name: z.string() })).parse(noteTeams.data ?? []);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Cronograma</h1>
          <p className="muted">
            Prepará cada encuentro sin cambiar lo que ya está publicado.
          </p>
        </div>
        {permission.data && (
          <div className="editor-toolbar">
            <Button asChild variant="outline"><Link href="/cronograma/catalogos">Tipos y plantillas</Link></Button>
            <Button asChild variant="outline"><Link href="/cronograma/contenidos">Contenidos</Link></Button>
            <Button asChild><Link href="/cronograma/nueva">Nueva reunión</Link></Button>
          </div>
        )}
      </div>
      {params.error && <p className="notice error" role="alert">{params.error === "cancelar" ? "No se pudo cancelar la reunión. Revisá permisos o cambios recientes." : "Datos inválidos."}</p>}
      {params.cancelled && <p className="notice" role="status">Reunión cancelada. Ya no aparece en la agenda pública.</p>}
      <section className="panel">
        <ul className="member-list">
          {rows.data?.map((m) => (
            <li key={m.id}>
              <h2>{m.title}</h2>
              <p className="muted">
                {m.date} · {m.status === "published" ? "Publicada" : m.status === "cancelled" ? "Cancelada" : m.status === "finished" ? "Finalizada" : "Borrador"}
                {m.draft_revision_id && m.published_revision_id
                  ? " · Con cambios sin publicar"
                  : ""}
              </p>
              {m.status !== "cancelled" && m.status !== "finished" && <Button asChild variant="outline">
                <Link
                  href={
                    permission.data
                      ? `/cronograma/${m.id}`
                      : `/reuniones/${m.id}`
                  }
                >
                  {permission.data ? "Abrir editor" : "Ver agenda pública"}
                </Link>
              </Button>}
              {!permission.data && m.status !== "cancelled" && m.status !== "finished" && editableTeams.map((team) => (
                <Button asChild variant="outline" key={team.id}>
                  <Link href={`/cronograma/${m.id}/equipos/${team.id}`}>Contenido de {team.name}</Link>
                </Button>
              ))}
              {m.published_revision_id && m.status !== "cancelled" && <Button asChild variant="outline"><Link href={`/en-vivo/${m.id}`}>{m.status === "finished" ? "Ver ejecución" : "Modo en vivo"}</Link></Button>}
              {permission.data && m.status !== "cancelled" && m.status !== "finished" && <CancelMeetingForm id={m.id} version={m.version} />}
            </li>
          ))}
        </ul>
        {!rows.data?.length && (
          <div className="empty">
            <h2>Todavía no hay reuniones</h2>
            <p className="muted">
              Creá un borrador para empezar a organizar el cronograma.
            </p>
          </div>
        )}
      </section>
    </>
  );
}

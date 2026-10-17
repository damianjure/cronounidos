import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import { confirmationLabels, confirmationMeetingList, confirmationSnapshot, expectedRows, groupByPerson, type ConfirmationRow } from "@/lib/confirmations/model";
import { respondAssignments } from "./actions";

function ResponseForm({ meetingId, personId, rows, bulk = false }: {
  meetingId: string; personId: string; rows: ConfirmationRow[]; bulk?: boolean;
}) {
  return <form action={respondAssignments} className="editor-toolbar">
    <input type="hidden" name="meetingId" value={meetingId} />
    <input type="hidden" name="personId" value={personId} />
    <input type="hidden" name="expected" value={JSON.stringify(expectedRows(rows))} />
    <SubmitButton name="status" value="confirmed" variant="outline">{bulk ? "Confirmar todos" : "Confirmar"}</SubmitButton>
    <SubmitButton name="status" value="unavailable" variant="outline">{bulk ? "No disponible en todos" : "No disponible"}</SubmitButton>
    <SubmitButton name="status" value="pending" variant="ghost">{bulk ? "Todos pendientes" : "Volver a pendiente"}</SubmitButton>
  </form>;
}

export default async function Confirmations({ searchParams }: {
  searchParams: Promise<{ meeting?: string; error?: string; ok?: string }>;
}) {
  const access = await requireAccess();
  if (access.state !== "approved") return null;
  const query = await searchParams;
  if (query.meeting && !z.uuid().safeParse(query.meeting).success) notFound();
  const { data, error } = await access.client.rpc("confirmation_meetings", { p_org: access.orgId });
  if (error) throw new Error("No se pudieron consultar las confirmaciones.");
  const meetings = confirmationMeetingList.parse(data);
  const selected = query.meeting ?? meetings[0]?.id;
  let snapshot = null;
  let canStaff=false;
  if (selected) {
    const response = await access.client.rpc("get_meeting_confirmations", { p_meeting: selected });
    if (response.error) {
      if (response.error.message.includes("Forbidden")) notFound();
      throw new Error("No se pudieron consultar las asignaciones.");
    }
    snapshot = confirmationSnapshot.parse(response.data);
    const staff=await access.client.rpc("get_meeting_staffing",{p_meeting:selected});
    if(staff.error&&!staff.error.message.includes("Forbidden")) throw new Error("No se pudieron verificar los permisos de puestos.");
    canStaff=!staff.error;
  }
  return <>
    <div className="page-heading"><div><h1>Confirmaciones</h1><p className="muted">Respondé tus asignaciones o gestioná las de los equipos que tenés autorizados.</p></div></div>
    {query.error && <p role="alert" className="notice error">{query.error === "conflicto" ? "La respuesta cambió. Revisá el estado actualizado antes de volver a guardar." : "No se pudo guardar. Revisá los datos, tus permisos y el estado de la reunión."}</p>}
    {query.ok && <p role="status" className="notice">Respuestas guardadas. Los cambios anteriores permanecen en el historial.</p>}
    <nav className="auth-links" aria-label="Reuniones para confirmar">{meetings.map(meeting =>
      <Link key={meeting.id} href={`/confirmaciones?meeting=${meeting.id}`} aria-current={meeting.id === selected ? "page" : undefined}>{meeting.date} · {meeting.title}</Link>)}</nav>
    {!snapshot && <section className="panel empty"><h2>No hay asignaciones para responder</h2><p className="muted">Solo se muestran asignaciones vigentes y autorizadas. Las de un borrador inicial requieren permiso de planificación; después de publicar, integrantes pueden responder sus propias asignaciones.</p></section>}
    {snapshot && <>
      <h2>{snapshot.title} · {snapshot.date}</h2>
      {canStaff&&<p><Link href={`/cronograma/${snapshot.meetingId}/puestos`}>Gestionar puestos, reemplazos y solapamientos</Link></p>}
      <p className="notice">Las respuestas corresponden al plan vigente. Si la reunión ya está publicada, un borrador de edición no cambia ese plan. “No disponible” conserva el rechazo y deja el puesto sin cubrir; no asigna un reemplazo automáticamente.</p>
      {groupByPerson(snapshot.assignments).map(person => <section key={person.personId} className="panel" style={{ marginBottom: 20 }} aria-label={`Asignaciones de ${person.name}`}>
        <h3>{person.name}</h3>
        {person.rows.length > 1 && person.rows.length <= 100 && <><p className="muted">Responder los {person.rows.length} roles visibles de esta persona en una sola operación:</p><ResponseForm meetingId={snapshot.meetingId} personId={person.personId} rows={person.rows} bulk /></>}
        <ul className="member-list">{person.rows.map(row => <li key={row.id}>
          <h4>{row.activity}</h4>
          <p>{row.teamName ?? "Sin equipo"} · {row.roleName ?? "Sin rol"} · <strong>{confirmationLabels[row.status]}</strong></p>
          <ResponseForm meetingId={snapshot.meetingId} personId={person.personId} rows={[row]} />
          <details><summary>Historial de respuestas</summary>
            <ol>{row.history.map((event,index) => <li key={`${event.at}-${index}`}>
              {new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(event.at))}
              {" · "}{event.status ? confirmationLabels[event.status] : event.event === "removed_from_published_plan" ? "Retirada del plan publicado" : "Cambio registrado"}
              {event.previousStatus && ` (antes: ${confirmationLabels[event.previousStatus]})`}
            </li>)}</ol>
          </details>
        </li>)}</ul>
      </section>)}
    </>}
  </>;
}

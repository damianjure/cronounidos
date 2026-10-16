import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requireAccess } from "@/lib/auth";
import { calendarSnapshot, monthRange, summary, type CalendarMeeting } from "@/lib/calendar/model";
const coverageColors={gray:"#64748b",red:"#b42318",yellow:"#ad6500",green:"#15803d"};
function MeetingLink({meeting,compact=false}:{meeting:CalendarMeeting;compact?:boolean}) {
  const state=summary(meeting);
  return <Link className="calendar-meeting" aria-label={`${meeting.title} · ${meeting.typeName ?? "Sin tipo"} · ${state.label}${meeting.draft ? " · Borrador" : ""}`} href={meeting.draft ? `/cronograma/${meeting.id}` : `/reuniones/${meeting.id}`}>
    <span aria-hidden="true" className="calendar-indicator" style={{background:`conic-gradient(${meeting.typeColor} 0deg 180deg, ${coverageColors[state.color]} 180deg 360deg)`}} />
    <span><strong>{meeting.title}</strong><small>{compact ? (state.percentage === null ? "Sin puestos" : `${Math.floor(state.percentage)}%`) : `${meeting.typeName ?? "Sin tipo"} · ${state.label}`}{meeting.draft ? " · Borrador" : ""}</small></span>
  </Link>;
}
export default async function Calendar({searchParams}:{searchParams:Promise<{month?:string}>}) {
  const access=await requireAccess();
  if(access.state!=="approved") return null;
  const query=await searchParams;
  // formatToParts avoids locale-dependent separators when choosing the current month.
  const parts=new Intl.DateTimeFormat("en",{year:"numeric",month:"2-digit",timeZone:"America/Argentina/Buenos_Aires"}).formatToParts(new Date());
  const month=query.month ?? `${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}`;
  let range;
  try {range=monthRange(month);} catch {notFound();}
  const response=await access.client.rpc("calendar_overview",{p_org:access.orgId,p_from:range.from,p_to:range.to});
  if(response.error) {
    if(response.error.message.includes("Forbidden")) return <><h1>Calendario</h1><p className="notice">Necesitás permiso de agenda o planificación para ver el calendario.</p></>;
    throw new Error("No se pudo consultar el calendario.");
  }
  const data=calendarSnapshot.parse(response.data);
  const monthTitle=new Intl.DateTimeFormat("es-AR",{year:"numeric",month:"long",timeZone:"UTC"}).format(new Date(`${range.from}T12:00:00Z`));
  return <>
    <div className="page-heading"><div><h1>Calendario</h1><p className="muted">Tipo de reunión y cobertura de puestos requeridos; no incluye los opcionales.</p></div></div>
    <section className="panel calendar-panel" aria-label="Calendario mensual">
      <div className="section-title"><h2>{monthTitle}</h2><nav className="editor-toolbar" aria-label="Cambiar mes">
        <Button asChild variant="outline"><Link href={`/calendario?month=${range.previous}`}>Mes anterior</Link></Button>
        <Button asChild variant="outline"><Link href="/calendario">Mes actual</Link></Button>
        <Button asChild variant="outline"><Link href={`/calendario?month=${range.next}`}>Mes siguiente</Link></Button>
      </nav></div>
      <details><summary>Cómo leer los indicadores</summary><p className="muted">Círculo: mitad izquierda = cobertura, mitad derecha = tipo. Gris: sin puestos; rojo: menos de 60%; amarillo: 60–89% o falta un crítico; verde: ≥90% y todos los críticos confirmados.</p></details>
      <div className="calendar-scroll"><div className="calendar-grid">
        {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(day=><div className="calendar-weekday" key={day}>{day}</div>)}
        {Array.from({length:range.padding},(_,index)=><div key={`pad-${index}`} aria-hidden="true" />)}
        {range.days.map(day=>{
          const meetings=data.meetings.filter(meeting=>meeting.date===day);
          return <section className="calendar-day" key={day} aria-label={day}>
            <h3><time dateTime={day}>{Number(day.slice(-2))}</time></h3>
            {meetings.map(meeting=><MeetingLink key={meeting.id} meeting={meeting} compact />)}
            {!meetings.length && <span className="visually-hidden">Sin reuniones</span>}
          </section>;
        })}
      </div></div>
    </section>
    <section className="panel" style={{marginTop:24}} aria-label="Próximas tres reuniones">
      <h2>Próximas tres reuniones</h2>
      {!data.upcoming.length && <p className="muted">No hay próximas reuniones disponibles.</p>}
      <ul className="member-list">{data.upcoming.map(meeting=><li key={meeting.id}>
        <p><time dateTime={meeting.date}>{meeting.date}</time></p><MeetingLink meeting={meeting} />
        <p className="muted">Confirmados: {meeting.confirmed} · Pendientes: {meeting.pending} · No disponibles: {meeting.unavailable} · Vacantes: {meeting.vacant}</p>
        {meeting.hasDraftChanges && <p className="muted">Hay cambios sin publicar; esta cobertura usa el plan vigente.</p>}
      </li>)}</ul>
    </section>
  </>;
}

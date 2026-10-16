import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAccess } from "@/lib/auth";
import {
  adminFeedbackRows,
  feedbackLabels,
  feedbackCategory,
  feedbackTotals,
} from "@/lib/feedback/model";
export default async function AdminFeedback({
  searchParams,
}: {
  searchParams: Promise<{ meeting?: string }>;
}) {
  const access = await requireAccess();
  if (access.state !== "approved") return null;
  const permission = await access.client.rpc("has_permission", {
    p_org: access.orgId,
    p_permission: "administer",
    p_team: null,
  });
  if (permission.error)
    throw new Error("No se pudieron verificar los permisos.");
  if (!permission.data) notFound();
  const { meeting } = await searchParams;
  if (meeting && !z.uuid().safeParse(meeting).success) notFound();
  const result = await access.client
    .from("meetings")
    .select("id,title,date")
    .eq("org_id", access.orgId)
    .eq("status", "finished")
    .order("date", { ascending: false });
  if (result.error)
    throw new Error("No se pudieron consultar las reuniones cerradas.");
  const meetings = z
    .array(z.object({ id: z.uuid(), title: z.string(), date: z.string() }))
    .parse(result.data);
  const selected = meeting ?? meetings[0]?.id;
  if (selected && !meetings.some((m) => m.id === selected)) notFound();
  let rows: z.infer<typeof adminFeedbackRows> = [];
  if (selected) {
    const r = await access.client.rpc("admin_meeting_feedback", {
      p_org: access.orgId,
      p_meeting: selected,
    });
    if (r.error)
      throw new Error("No se pudo consultar el feedback administrativo.");
    rows = adminFeedbackRows.parse(r.data);
  }
  const personIds = rows.flatMap((r) => (r.personId ? [r.personId] : []));
  const userIds = rows.flatMap((r) => (r.userId ? [r.userId] : []));
  const [peopleResult, profilesResult] = await Promise.all([
    access.client
      .from("people")
      .select("id,first_name,last_name")
      .eq("org_id", access.orgId)
      .in("id", personIds),
    access.client
      .from("profiles")
      .select("user_id,display_name")
      .in("user_id", userIds),
  ]);
  if (peopleResult.error || profilesResult.error)
    throw new Error("No se pudo identificar a los participantes.");
  const people = new Map(
    (peopleResult.data ?? []).map((p) => [
      p.id,
      `${p.first_name} ${p.last_name}`,
    ]),
  );
  const profiles = new Map(
    (profilesResult.data ?? []).map((p) => [p.user_id, p.display_name]),
  );
  const totals = feedbackTotals(rows);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Feedback del equipo</h1>
          <p className="muted">
            Respuestas identificadas, exclusivamente para administradores.
          </p>
        </div>
        <Link href="/feedback">Mi feedback</Link>
      </div>
      <nav className="auth-links" aria-label="Reuniones con feedback">
        {meetings.map((m) => (
          <Link
            key={m.id}
            href={`/feedback/admin?meeting=${m.id}`}
            aria-current={m.id === selected ? "page" : undefined}
          >
            {m.date} · {m.title}
          </Link>
        ))}
      </nav>
      {!selected ? (
        <p className="notice">No hay reuniones cerradas.</p>
      ) : (
        <>
          <h2>{meetings.find((m) => m.id === selected)?.title}</h2>
          <p className="notice">
            {totals.submitted} respuesta{totals.submitted === 1 ? "" : "s"} de{" "}
            {totals.requested} solicitud{totals.requested === 1 ? "" : "es"}.
            Las solicitudes se generan a partir de diez minutos del cierre
            efectivo.
          </p>
          <ul>
            {feedbackCategory.options.map((category) => (
              <li key={category}>
                {feedbackLabels[category]}: {totals.categories[category]}
              </li>
            ))}
          </ul>
          {rows.length === 0 && (
            <p className="muted">
              Aún no hay solicitudes generadas para esta reunión.
            </p>
          )}
          {rows.map((row) => (
            <article key={row.requestId} className="panel feedback-card">
              <h3>
                {(row.personId && people.get(row.personId)) ||
                  (row.userId && profiles.get(row.userId)) ||
                  `Participante ${row.userId ?? row.personId ?? row.requestId}`}
              </h3>
              <p className="muted">
                {row.userId ? "Cuenta vinculada" : "Sin cuenta vinculada"} ·{" "}
                {row.submittedAt ? "Respuesta recibida" : "Pendiente"}
              </p>
              {row.category && (
                <p>
                  <strong>{feedbackLabels[row.category]}</strong>
                </p>
              )}
              {row.comment && <p className="feedback-comment">{row.comment}</p>}
            </article>
          ))}
        </>
      )}
    </>
  );
}

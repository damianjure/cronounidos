import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/auth";
import { calendarSnapshot, monthRange } from "@/lib/calendar/model";
import { matrixRows, matrixSummary } from "@/lib/staffing/coverage";
export default async function Coverage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const query = await searchParams;
  const month =
    query.month ??
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
  let range;
  try {
    range = monthRange(month);
  } catch {
    notFound();
  }
  const access = await requireAccess();
  if (access.state !== "approved") return null;
  const args = { p_org: access.orgId, p_from: range.from, p_to: range.to };
  const [calendar, matrix] = await Promise.all([
    access.client.rpc("calendar_overview", args),
    access.client.rpc("coverage_matrix", args),
  ]);
  if (calendar.error || matrix.error) {
    if ((calendar.error ?? matrix.error)?.message.includes("Forbidden"))
      return (
        <p className="notice">
          Necesitás permiso global de agenda o planificación.
        </p>
      );
    throw new Error("No se pudo consultar la cobertura.");
  }
  const meetings = calendarSnapshot.parse(calendar.data).meetings;
  const rows = matrixRows.parse(matrix.data);
  const roles = [
    ...new Map(rows.map((r) => [`${r.teamId}:${r.roleId}`, r])).values(),
  ];
  return (
    <>
      <h1>Matriz de cobertura</h1>
      <p>
        Mes {month} · Los opcionales no cuentan para cobertura. No se muestran
        datos personales.
      </p>
      <nav className="editor-toolbar" aria-label="Mes de cobertura">
        <Link
          className="button button-outline"
          href={`/cobertura?month=${range.previous}`}
        >
          Mes anterior
        </Link>
        <Link
          className="button button-outline"
          href={`/calendario?month=${month}`}
        >
          Calendario
        </Link>
        <Link
          className="button button-outline"
          href={`/cobertura?month=${range.next}`}
        >
          Mes siguiente
        </Link>
      </nav>
      {!meetings.length && <p>No hay reuniones en este mes.</p>}
      <div className="coverage-desktop calendar-scroll">
        <table>
          <caption>Roles por reunión</caption>
          <thead>
            <tr>
              <th scope="col">Equipo / rol</th>
              {meetings.map((m) => (
                <th scope="col" key={m.id}>
                  {m.title}
                  <br />
                  {m.date}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={`${r.teamId}:${r.roleId}`}>
                <th scope="row">
                  {r.teamName} / {r.roleName}
                </th>
                {meetings.map((m) => {
                  const cell = matrixSummary(
                    rows.filter(
                      (x) =>
                        x.teamId === r.teamId &&
                        x.roleId === r.roleId &&
                        x.meetingId === m.id,
                    ),
                  );
                  return (
                    <td key={m.id} data-coverage={cell.color}>
                      {cell.label}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="coverage-mobile">
        {meetings.map((m) => (
          <section className="panel" key={m.id}>
            <h2>{m.title}</h2>
            <p>{m.date}</p>
            {[
              ...new Set(
                rows.filter((r) => r.meetingId === m.id).map((r) => r.teamId),
              ),
            ].map((team) => (
              <section key={team}>
                <h3>{rows.find((r) => r.teamId === team)!.teamName}</h3>
                <ul>
                  {roles
                    .filter((r) => r.teamId === team)
                    .map((r) => {
                      const matching = rows.filter(
                        (x) =>
                          x.teamId === team &&
                          x.roleId === r.roleId &&
                          x.meetingId === m.id,
                      );
                      if (!matching.length) return null;
                      const cell = matrixSummary(matching);
                      return (
                        <li key={r.roleId} data-coverage={cell.color}>
                          {r.roleName}: {cell.label}
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
            {!rows.some((r) => r.meetingId === m.id) && (
              <p>Sin puestos requeridos.</p>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

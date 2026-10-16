import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/auth";
import { staffing, conflicts, blockStaffing } from "@/lib/staffing/model";
import { Button } from "@/components/ui/button";
import {
  configurePosition,
  staffPosition,
  justifyConflict,
  adjustPosition,
  replaceBlockPerson,
} from "./actions";
const labels = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  unavailable: "No disponible",
};
export default async function Positions({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const access = await requireAccess();
  if (access.state !== "approved") return null;
  const { data, error } = await access.client.rpc("get_meeting_staffing", {
    p_meeting: id,
  });
  if (error) {
    if (error.message.includes("Forbidden"))
      return (
        <p className="notice">
          Necesitás asignación y lectura de personas para gestionar puestos.
        </p>
      );
    throw new Error("No se pudieron consultar los puestos.");
  }
  const view = staffing.parse(data);
  const query = await searchParams;
  const conflictResult = await access.client.rpc("get_staffing_conflicts", {
    p_meeting: id,
  });
  if (conflictResult.error)
    throw new Error("No se pudieron verificar los solapamientos.");
  const overlaps = conflicts.parse(conflictResult.data);
  const blockResult = await access.client.rpc("get_block_staffing", {
    p_meeting: id,
  });
  if (blockResult.error)
    throw new Error("No se pudieron consultar los responsables.");
  const blockPeople = blockStaffing.parse(blockResult.data);
  let unscopedPeople: { id: string; name: string }[] = [];
  if (blockPeople.some((a) => a.teamId === null)) {
    const people = await access.client
      .from("people")
      .select("id,first_name,last_name")
      .eq("org_id", access.orgId)
      .eq("active", true)
      .order("first_name");
    if (people.error)
      throw new Error("No se pudieron consultar las personas autorizadas.");
    unscopedPeople = (people.data ?? []).map((p) => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
    }));
  }
  return (
    <>
      <h1>Puestos · {view.title}</h1>
      <p>
        <Link href={`/cronograma/${id}`}>Volver al cronograma</Link> ·{" "}
        <Link href={`/confirmaciones?meeting=${id}`}>Confirmaciones</Link>
      </p>
      <p className="notice">
        Los puestos y su cobertura son operativos: se actualizan inmediatamente.
        No modifican las actividades publicadas. Cada reemplazo comienza
        pendiente y conserva el historial anterior.
      </p>
      {query.error && (
        <p role="alert" className="error">
          {query.error === "conflicto"
            ? "La reunión cambió. Revisá los datos actualizados antes de reintentar."
            : "No se pudo guardar. Revisá permisos y pertenencia al equipo."}
        </p>
      )}
      {query.ok && <p role="status">Cambios guardados.</p>}
      {view.closed && (
        <p className="notice">La reunión está cerrada; no admite cambios.</p>
      )}
      <section className="panel">
        <h2>Solapamientos</h2>
        <p>
          Se compara el borrador de esta reunión con los planes vigentes de
          otras reuniones. Para resolver: reprogramá desde el cronograma,
          reemplazá la persona o registrá una excepción con motivo.
        </p>
        {!overlaps.length && <p>Sin solapamientos detectados.</p>}
        <ul className="member-list">
          {overlaps.map((c) => (
            <li key={c.fingerprint}>
              <h3>{c.personName}</h3>
              <p>{c.description}</p>
              <p>
                {new Date(c.startsAt).toLocaleString("es-AR", {
                  timeZone: "America/Argentina/Buenos_Aires",
                })}{" "}
                —{" "}
                {new Date(c.endsAt).toLocaleString("es-AR", {
                  timeZone: "America/Argentina/Buenos_Aires",
                })}
              </p>
              {c.justification ? (
                <p>Excepción registrada: {c.justification}</p>
              ) : c.canExcept && !view.closed ? (
                <form action={justifyConflict} className="auth-form">
                  <input name="meetingId" type="hidden" value={id} />
                  <input
                    name="fingerprint"
                    type="hidden"
                    value={c.fingerprint}
                  />
                  <label className="field">
                    Motivo de excepción
                    <textarea
                      name="reason"
                      minLength={10}
                      maxLength={2000}
                      required
                    />
                  </label>
                  <Button>Registrar excepción</Button>
                </form>
              ) : (
                <p className="notice">
                  Requiere revisión por un responsable con acceso a ambas
                  asignaciones.
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel" style={{ marginTop: 24 }}>
        <h2>Responsables de actividades</h2>
        <p>
          Los reemplazos de actividades se guardan en el borrador. La persona
          publicada y su respuesta se conservan hasta que un planificador
          publique los cambios.
        </p>
        <ul className="member-list">
          {blockPeople.map((a) => (
            <li key={a.id}>
              <h3>
                {a.personName} · {a.roleName}
              </h3>
              <p>{labels[a.status]}</p>
              {!view.closed && (
                <details>
                  <summary>Proponer reemplazo en borrador</summary>
                  <form action={replaceBlockPerson} className="auth-form">
                    <input name="meetingId" type="hidden" value={id} />
                    <input name="assignmentId" type="hidden" value={a.id} />
                    <input name="version" type="hidden" value={view.version} />
                    <label className="field">
                      Nueva persona
                      <select name="personId" defaultValue="" required>
                        <option value="" disabled>
                          Elegir persona
                        </option>
                        {[
                          ...new Map(
                            (a.teamId === null
                              ? unscopedPeople
                              : view.teams
                                  .filter((t) => t.id === a.teamId)
                                  .flatMap((t) => t.people)
                            ).map((p) => [p.id, p]),
                          ).values(),
                        ]
                          .filter((p) => p.id !== a.personId)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      <input type="checkbox" name="ack" value="yes" required />{" "}
                      Confirmo el reemplazo en borrador; no transfiere
                      confirmación.
                    </label>
                    <Button>Proponer reemplazo</Button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>
      {view.teams.map((team) => (
        <section className="panel" key={team.id} style={{ marginTop: 24 }}>
          <h2>{team.name}</h2>
          {team.configure && !view.closed && (
            <details>
              <summary>Agregar puestos requeridos</summary>
              <form action={configurePosition} className="auth-form">
                <input type="hidden" name="meetingId" value={id} />
                <input type="hidden" name="version" value={view.version} />
                <input type="hidden" name="teamId" value={team.id} />
                <label className="field">
                  Rol
                  <select name="roleId" required>
                    {team.roles.map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Prioridad
                  <select name="priority" defaultValue="required">
                    <option value="critical">Crítico</option>
                    <option value="required">Requerido</option>
                    <option value="optional">Opcional</option>
                  </select>
                </label>
                <label className="field">
                  Cantidad
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    max="20"
                    defaultValue="1"
                    required
                  />
                </label>
                <Button>Agregar puestos</Button>
              </form>
            </details>
          )}
          {!team.positions.length && (
            <p className="muted">Sin puestos definidos.</p>
          )}
          <ul className="member-list">
            {team.positions.map((p) => (
              <li key={p.id}>
                <h3>
                  {p.role} #{p.index} ·{" "}
                  {p.priority === "critical"
                    ? "Crítico"
                    : p.priority === "required"
                      ? "Requerido"
                      : "Opcional"}
                </h3>
                <p>
                  {p.assignment
                    ? `${p.assignment.personName} · ${labels[p.assignment.status]}`
                    : "Vacante"}
                </p>
                {team.configure && !view.closed && (
                  <details>
                    <summary>Ajustar puesto</summary>
                    <form action={adjustPosition} className="auth-form">
                      <input name="meetingId" type="hidden" value={id} />
                      <input name="positionId" type="hidden" value={p.id} />
                      <input
                        name="version"
                        type="hidden"
                        value={view.version}
                      />
                      <label className="field">
                        Prioridad
                        <select name="priority" defaultValue={p.priority}>
                          <option value="critical">Crítico</option>
                          <option value="required">Requerido</option>
                          <option value="optional">Opcional</option>
                        </select>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          name="ack"
                          value="yes"
                          required
                        />{" "}
                        Confirmo el cambio operativo.
                      </label>
                      <Button name="operation" value="priority">
                        Cambiar prioridad
                      </Button>
                      {!p.history.length && (
                        <Button
                          name="operation"
                          value="remove"
                          variant="outline"
                        >
                          Eliminar puesto sin historial
                        </Button>
                      )}
                    </form>
                  </details>
                )}
                {!view.closed && (
                  <details>
                    <summary>
                      {p.assignment ? "Reemplazar persona" : "Asignar persona"}
                    </summary>
                    <form action={staffPosition} className="auth-form">
                      <input type="hidden" name="meetingId" value={id} />
                      <input
                        type="hidden"
                        name="version"
                        value={view.version}
                      />
                      <input type="hidden" name="positionId" value={p.id} />
                      <input
                        type="hidden"
                        name="expected"
                        value={p.assignment?.id ?? ""}
                      />
                      <input
                        type="hidden"
                        name="status"
                        value={p.assignment?.status ?? ""}
                      />
                      <input
                        type="hidden"
                        name="respondedAt"
                        value={p.assignment?.respondedAt ?? ""}
                      />
                      <label className="field">
                        Persona del equipo
                        <select name="personId" required defaultValue="">
                          <option value="" disabled>
                            Elegir persona
                          </option>
                          {team.people
                            .filter((pe) => pe.id !== p.assignment?.personId)
                            .map((pe) => (
                              <option value={pe.id} key={pe.id}>
                                {pe.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          name="ack"
                          value="yes"
                          required
                        />{" "}
                        Confirmo la asignación en pendiente
                        {p.assignment
                          ? " y el reemplazo de la persona actual"
                          : ""}
                        .
                      </label>
                      <Button>Guardar asignación</Button>
                    </form>
                  </details>
                )}
                {!!p.history.length && (
                  <details>
                    <summary>Historial de personas</summary>
                    <ul>
                      {p.history.map((h, i) => (
                        <li key={i}>
                          {h.personName} · {labels[h.status]}
                          {h.replaced ? " · Reemplazado" : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

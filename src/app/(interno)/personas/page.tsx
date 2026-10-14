import { requireAccess } from "@/lib/auth";
export default async function People() {
  const a = await requireAccess();
  if (a.state !== "approved") return null;
  const { data, error } = await a.client
    .from("people")
    .select("id,first_name,last_name,active")
    .eq("org_id", a.orgId)
    .order("first_name");
  if (error) throw new Error("No se pudo cargar el directorio.");
  const { data: teams, error: teamError } = await a.client
    .from("teams")
    .select("id,name")
    .eq("org_id", a.orgId)
    .order("name");
  if (teamError) throw new Error("No se pudieron cargar los equipos.");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Personas y equipos</h1>
          <p className="muted">Información visible según tus permisos.</p>
        </div>
      </div>
      <div className="grid">
        <section className="panel">
          <h2>Personas</h2>
          <ul className="member-list">
            {data?.map((p) => (
              <li key={p.id}>
                {p.first_name} {p.last_name}
                {!p.active && " (inactiva)"}
              </li>
            ))}
          </ul>
          {!data?.length && (
            <p className="muted">No hay personas disponibles para tu cuenta.</p>
          )}
        </section>
        <section className="panel">
          <h2>Equipos</h2>
          <ul className="member-list">
            {teams?.map((t) => (
              <li key={t.id}>{t.name}</li>
            ))}
          </ul>
          {!teams?.length && (
            <p className="muted">No hay equipos disponibles para tu cuenta.</p>
          )}
        </section>
      </div>
    </>
  );
}

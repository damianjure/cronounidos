import { requireAccess } from "@/lib/auth";
import { SubmitButton } from "@/components/submit-button";
import {
  approveMember,
  provisionUser,
  linkPerson,
  suspendMember,
  grantPermission,
  revokePermission,
} from "./actions";
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const a = await requireAccess();
  if (a.state !== "approved") return null;
  const { data: allowed, error: permError } = await a.client.rpc(
    "has_permission",
    { p_org: a.orgId, p_permission: "administer", p_team: null },
  );
  if (permError) throw new Error("No se pudieron verificar los permisos.");
  if (!allowed)
    return (
      <section className="panel">
        <h1>Administración</h1>
        <p>Tu cuenta no tiene permiso para administrar accesos.</p>
      </section>
    );
  const { data, error } = await a.client
    .from("memberships")
    .select("id,user_id,status,profiles(display_name,email)")
    .eq("org_id", a.orgId)
    .eq("status", "pending");
  if (error) throw new Error("No se pudieron consultar las solicitudes.");
  const { data: teams, error: teamsError } = await a.client
    .from("teams")
    .select("id,name")
    .eq("org_id", a.orgId);
  if (teamsError) throw new Error("No se pudieron consultar los equipos.");
  const [
    { data: members, error: membersError },
    { data: people, error: peopleError },
    { data: grants, error: grantsError },
  ] = await Promise.all([
    a.client
      .from("memberships")
      .select("user_id,status,profiles(display_name,person_id,email)")
      .eq("org_id", a.orgId)
      .neq("status", "pending"),
    a.client
      .from("people")
      .select("id,first_name,last_name")
      .eq("org_id", a.orgId),
    a.client
      .from("permission_grants")
      .select("id,subject_user_id,permission,team_id")
      .eq("org_id", a.orgId),
  ]);
  if (membersError || peopleError || grantsError)
    throw new Error("No se pudieron cargar los accesos.");
  const params = await searchParams;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Accesos al equipo</h1>
          <p className="muted">Aprobá cuentas y asigná permisos iniciales.</p>
        </div>
      </div>
      {params.error && (
        <p role="alert" className="notice error">
          No se completó la operación ({params.error}). Revisá los datos y la
          configuración.
          {params.error === "membresia" &&
            " Falló la membresía; la cuenta creada se eliminó y podés reintentar con el mismo correo."}
          {params.error === "membresia-huerfana" &&
            " Falló la membresía y no se pudo eliminar la cuenta creada: eliminala desde Supabase Auth antes de reintentar."}
        </p>
      )}
      {params.ok && (
        <p role="status" className="notice">
          Operación completada.
        </p>
      )}
      <div className="grid">
        <section className="panel">
          <h2>Solicitudes pendientes</h2>
          <ul className="member-list">
            {data?.map((m) => (
              <li key={m.id}>
                <strong>
                  {(m.profiles as unknown as { display_name: string } | null)
                    ?.display_name || m.user_id}
                </strong>
                <p className="muted">
                  {(m.profiles as unknown as { email: string | null })?.email ||
                    "Correo no disponible"}
                </p>
                <p className="footer-note">Cuenta: {m.user_id}</p>
                <form action={approveMember}>
                  <input type="hidden" name="orgId" value={a.orgId} />
                  <input type="hidden" name="userId" value={m.user_id} />
                  <label>
                    Permiso inicial{" "}
                    <select name="role" aria-label="Permiso inicial">
                      <option value="member">Integrante</option>
                      <option value="leader">Responsable de equipo</option>
                      <option value="planner">Planificador</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </label>
                  <label>
                    Equipo{" "}
                    <select name="teamId" aria-label="Equipo">
                      <option value="">
                        Sin equipo (solo integrante, planificador o admin)
                      </option>
                      {teams?.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SubmitButton>Aprobar acceso</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          {!data?.length && (
            <p className="muted">No hay solicitudes pendientes.</p>
          )}
        </section>
        <section className="panel auth-form">
          <h2>Alta o invitación</h2>
          <p className="muted">
            La cuenta queda pendiente hasta que la apruebes.
          </p>
          <form action={provisionUser}>
            <input type="hidden" name="orgId" value={a.orgId} />
            <label className="field">
              Nombre visible
              <input
                name="displayName"
                required
                minLength={2}
                maxLength={100}
              />
            </label>
            <label className="field">
              Correo
              <input type="email" name="email" required />
            </label>
            <label className="field">
              Método
              <select name="mode">
                <option value="invite">Invitar por correo</option>
                <option value="create">Crear con contraseña temporal</option>
              </select>
            </label>
            <label className="field">
              Contraseña (solo para alta directa)
              <input
                type="password"
                name="password"
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <SubmitButton>Crear acceso pendiente</SubmitButton>
          </form>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 24 }}>
        <h2>Cuentas y permisos granulares</h2>
        <p className="muted">
          La aprobación agrega permisos iniciales. Acá podés vincular una
          persona y agregar o revocar acciones por equipo.
        </p>
        <ul className="member-list">
          {members?.map((m) => (
            <li key={m.user_id}>
              <h3>
                {(m.profiles as unknown as { display_name: string })
                  ?.display_name || m.user_id}{" "}
                <span className="pill">
                  {m.status === "approved" ? "Aprobado" : "Suspendido"}
                </span>
              </h3>
              <form action={linkPerson}>
                <input type="hidden" name="orgId" value={a.orgId} />
                <input type="hidden" name="userId" value={m.user_id} />
                <label>
                  Persona{" "}
                  <select
                    name="personId"
                    defaultValue={
                      (m.profiles as unknown as { person_id: string | null })
                        ?.person_id || ""
                    }
                  >
                    <option value="">Sin vincular</option>
                    {people?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.first_name} {p.last_name}
                      </option>
                    ))}
                  </select>
                </label>
                <SubmitButton variant="outline">Vincular persona</SubmitButton>
              </form>
              <form action={grantPermission}>
                <input type="hidden" name="orgId" value={a.orgId} />
                <input type="hidden" name="userId" value={m.user_id} />
                <label>
                  Acción{" "}
                  <select name="permission">
                    {[
                      ["read_agenda", "Consultar agenda"],
                      ["read_people", "Consultar personas"],
                      ["read_content", "Consultar notas y contenidos"],
                      ["plan", "Planificar"],
                      ["assign", "Asignar"],
                      ["edit_roles", "Editar roles"],
                      ["confirm", "Confirmar"],
                      ["operate_live", "Operar en vivo"],
                      ["administer", "Administrar"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ámbito{" "}
                  <select name="teamId">
                    <option value="">Toda la organización</option>
                    {teams?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <SubmitButton variant="outline">Agregar permiso</SubmitButton>
              </form>
              {grants
                ?.filter((g) => g.subject_user_id === m.user_id)
                .map((g) => (
                  <form key={g.id} action={revokePermission}>
                    <input type="hidden" name="orgId" value={a.orgId} />
                    <input type="hidden" name="grantId" value={g.id} />
                    <span>
                      {g.permission} /{" "}
                      {teams?.find((t) => t.id === g.team_id)?.name ||
                        "Organización"}
                    </span>
                    <SubmitButton variant="ghost">Revocar</SubmitButton>
                  </form>
                ))}
              {m.user_id !== a.user.id && m.status === "approved" && (
                <form action={suspendMember}>
                  <input type="hidden" name="orgId" value={a.orgId} />
                  <input type="hidden" name="userId" value={m.user_id} />
                  <SubmitButton variant="outline">Suspender acceso</SubmitButton>
                </form>
              )}
              {m.status === "suspended" && (
                <form action={approveMember}>
                  <input type="hidden" name="orgId" value={a.orgId} />
                  <input type="hidden" name="userId" value={m.user_id} />
                  <input type="hidden" name="role" value="member" />
                  <SubmitButton variant="outline">Reaprobar acceso</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

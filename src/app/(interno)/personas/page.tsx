import { requireAccess } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { addTeamMember, deleteDirectoryItem, removeTeamMember, saveDirectoryItem } from "./actions";

type Person = { id: string; first_name: string; last_name: string; active: boolean };
type Team = { id: string; name: string; active: boolean };
type Role = { id: string; team_id: string | null; name: string; active: boolean };
type Membership = { id: string; team_id: string; person_id: string };

function DirectoryForm({ kind, item, teamId }: {
  kind: "people" | "teams" | "roles";
  item?: Person | Team | Role;
  teamId?: string | null;
}) {
  const active = item?.active ?? true;
  return <form action={saveDirectoryItem} className="editor-fields">
    <input type="hidden" name="kind" value={kind} />
    <input type="hidden" name="id" value={item?.id ?? ""} />
    {kind === "people" ? <div className="field-grid">
      <label className="field">Nombre<input name="firstName" required maxLength={100} defaultValue={(item as Person | undefined)?.first_name ?? ""} /></label>
      <label className="field">Apellido<input name="lastName" required maxLength={100} defaultValue={(item as Person | undefined)?.last_name ?? ""} /></label>
    </div> : <>
      <label className="field">Nombre<input name="name" required maxLength={100} defaultValue={(item as Team | Role | undefined)?.name ?? ""} /></label>
      {kind === "roles" && <input type="hidden" name="teamId" value={teamId ?? ""} />}
    </>}
    <label><input type="checkbox" name="active" defaultChecked={active} /> Activo</label>
    <Button>{item ? "Guardar cambios" : "Agregar"}</Button>
  </form>;
}

function DeleteForm({ kind, id, teamId }: { kind: "people" | "teams" | "roles"; id: string; teamId?: string | null }) {
  return <details>
    <summary>Eliminar</summary>
    <p className="muted">No se puede deshacer. Si ya está en uso, desactivalo desde Editar.</p>
    <form action={deleteDirectoryItem}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="teamId" value={teamId ?? ""} />
      <Button variant="ghost">Confirmar eliminación</Button>
    </form>
  </details>;
}

export default async function People({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const a = await requireAccess();
  if (a.state !== "approved") return null;
  const [peopleResult, teamsResult, rolesResult, membersResult, assignResult, editResult, params] = await Promise.all([
    a.client.from("people").select("id,first_name,last_name,active").eq("org_id", a.orgId).order("first_name"),
    a.client.from("teams").select("id,name,active").eq("org_id", a.orgId).order("name"),
    a.client.from("roles").select("id,team_id,name,active").eq("org_id", a.orgId).order("name"),
    a.client.from("team_memberships").select("id,team_id,person_id").eq("org_id", a.orgId),
    a.client.rpc("has_permission", { p_org: a.orgId, p_permission: "assign", p_team: null }),
    a.client.rpc("has_permission", { p_org: a.orgId, p_permission: "edit_roles", p_team: null }),
    searchParams,
  ]);
  if (peopleResult.error || teamsResult.error || rolesResult.error || membersResult.error || assignResult.error || editResult.error)
    throw new Error("No se pudo cargar el directorio.");
  const people = (peopleResult.data ?? []) as Person[];
  const teams = (teamsResult.data ?? []) as Team[];
  const roles = (rolesResult.data ?? []) as Role[];
  const members = (membersResult.data ?? []) as Membership[];
  const permissions = await Promise.all(teams.map(async (team) => {
    const [assign, edit] = await Promise.all([
      a.client.rpc("has_permission", { p_org: a.orgId, p_permission: "assign", p_team: team.id }),
      a.client.rpc("has_permission", { p_org: a.orgId, p_permission: "edit_roles", p_team: team.id }),
    ]);
    if (assign.error || edit.error) throw new Error("No se pudieron verificar los permisos del equipo.");
    return { id: team.id, assign: Boolean(assign.data), edit: Boolean(edit.data) };
  }));
  const mayAssign = Boolean(assignResult.data);
  const mayEditTeams = Boolean(editResult.data);
  const can = (teamId: string, permission: "assign" | "edit") =>
    Boolean(permissions.find((entry) => entry.id === teamId)?.[permission]);
  return <>
    <div className="page-heading"><div><h1>Personas y equipos</h1><p className="muted">Directorio de la organización. Los permisos determinan qué podés ver y editar.</p></div></div>
    {params.error && <p className="notice error" role="alert">{params.error === "acceso" ? "No tenés permiso para ese cambio." : params.error === "datos" ? "Revisá los datos enviados." : params.error === "uso" ? "El registro está en uso o no se puede eliminar." : "No se pudo guardar. Revisá si ya existe o está en uso."}</p>}
    {params.ok && <p className="notice" role="status">Directorio actualizado.</p>}
    <div className="grid">
      <section className="panel">
        <h2>Personas</h2>
        {mayAssign && <details><summary>Agregar persona</summary><DirectoryForm kind="people" /></details>}
        <ul className="member-list">{people.map((person) => <li key={person.id}>
          <strong>{person.first_name} {person.last_name}</strong>{!person.active && " (inactiva)"}
          {mayAssign && <><details><summary>Editar</summary><DirectoryForm kind="people" item={person} /></details><DeleteForm kind="people" id={person.id} /></>}
        </li>)}</ul>
        {!people.length && <p className="muted">No hay personas disponibles para tu cuenta.</p>}
      </section>
      <section className="panel">
        <h2>Equipos</h2>
        {mayEditTeams && <details><summary>Agregar equipo</summary><DirectoryForm kind="teams" /></details>}
        <ul className="member-list">{teams.map((team) => <li key={team.id}>
          <h3>{team.name}{!team.active && " (inactivo)"}</h3>
          {mayEditTeams && <><details><summary>Editar equipo</summary><DirectoryForm kind="teams" item={team} /></details><DeleteForm kind="teams" id={team.id} /></>}
          <p className="muted">Roles</p>
          {roles.filter((role) => role.team_id === team.id).map((role) => <div key={role.id}>
            <strong>{role.name}</strong>{!role.active && " (inactivo)"}
            {can(team.id, "edit") && <><details><summary>Editar rol</summary><DirectoryForm kind="roles" item={role} teamId={team.id} /></details><DeleteForm kind="roles" id={role.id} teamId={team.id} /></>}
          </div>)}
          {can(team.id, "edit") && <details><summary>Agregar rol</summary><DirectoryForm kind="roles" teamId={team.id} /></details>}
          <p className="muted">Integrantes</p>
          {members.filter((entry) => entry.team_id === team.id).map((entry) => {
            const person = people.find((p) => p.id === entry.person_id);
            if (!person) return null;
            return <div key={entry.id}>{person.first_name} {person.last_name}
              {can(team.id, "assign") && <form action={removeTeamMember}>
                <input type="hidden" name="id" value={entry.id} /><input type="hidden" name="teamId" value={team.id} />
                <Button variant="ghost">Quitar del equipo</Button>
              </form>}
            </div>;
          })}
          {can(team.id, "assign") && <form action={addTeamMember} className="editor-fields">
            <input type="hidden" name="teamId" value={team.id} />
            <label className="field">Agregar integrante<select name="personId" required defaultValue="">
              <option value="" disabled>Elegí una persona</option>
              {people.filter((p) => p.active && !members.some((entry) => entry.team_id === team.id && entry.person_id === p.id)).map((p) =>
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
            </select></label><Button>Agregar al equipo</Button>
          </form>}
        </li>)}</ul>
        {!teams.length && <p className="muted">No hay equipos disponibles para tu cuenta.</p>}
        {roles.some((role) => role.team_id === null) && <div><h3>Roles generales</h3>{roles.filter((role) => role.team_id === null).map((role) => <div key={role.id}>
          {role.name}{!role.active && " (inactivo)"}
          {mayEditTeams && <><details><summary>Editar rol</summary><DirectoryForm kind="roles" item={role} teamId={null} /></details><DeleteForm kind="roles" id={role.id} /></>}
        </div>)}</div>}
        {mayEditTeams && <details><summary>Agregar rol general</summary><DirectoryForm kind="roles" teamId={null} /></details>}
      </section>
    </div>
  </>;
}

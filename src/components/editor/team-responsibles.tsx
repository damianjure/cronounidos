import { z } from "zod";
import { Button } from "@/components/ui/button";
import { editTeamResponsible } from "@/app/(interno)/cronograma/[id]/equipos/[teamId]/actions";

export const teamResponsiblesSchema = z.object({
  version: z.number().int().positive(),
  people: z.array(z.object({ id: z.uuid(), name: z.string() })),
  roles: z.array(z.object({ id: z.uuid(), name: z.string() })),
  blocks: z.array(z.object({ id: z.uuid(), responsibles: z.array(z.object({
    assignmentId: z.uuid(), personName: z.string(), roleName: z.string().nullable(),
    status: z.enum(["pending", "confirmed", "unavailable"]),
  })) })),
});
type Data = z.infer<typeof teamResponsiblesSchema>;
const statuses = { pending: "Pendiente", confirmed: "Confirmado", unavailable: "No disponible" };

export function TeamResponsibles({ meetingId, teamId, blockId, data }: {
  meetingId: string; teamId: string; blockId: string; data: Data;
}) {
  const block = data.blocks.find((entry) => entry.id === blockId);
  if (!block) return null;
  const fields = <>
    <input type="hidden" name="meetingId" value={meetingId} />
    <input type="hidden" name="teamId" value={teamId} />
    <input type="hidden" name="blockId" value={blockId} />
    <input type="hidden" name="version" value={data.version} />
  </>;
  return <section className="editor-fields" aria-label="Responsables del equipo">
    <h4>Responsables de tu equipo</h4>
    <p className="muted">Los cambios quedan en borrador. Agregar una persona crea una asignación pendiente; quitarla no borra su respuesta ni el plan publicado. No es un reemplazo ni una confirmación.</p>
    <ul className="member-list">{block.responsibles.map((assignment) => <li key={assignment.assignmentId}>
      <strong>{assignment.personName}</strong> — {assignment.roleName ?? "Sin rol"} — {statuses[assignment.status]}
      <details><summary>Quitar {assignment.personName} del borrador</summary>
        <form action={editTeamResponsible}>{fields}
          <input type="hidden" name="action" value="remove" />
          <input type="hidden" name="assignmentId" value={assignment.assignmentId} />
          <Button variant="outline">Confirmar quitar responsable</Button>
        </form>
      </details>
    </li>)}</ul>
    {!block.responsibles.length && <p className="muted">No hay responsables de este equipo en el bloque.</p>}
    <form action={editTeamResponsible} className="editor-fields">{fields}
      <input type="hidden" name="action" value="add" />
      <label className="field">Persona del equipo<select name="personId" required defaultValue="">
        <option value="" disabled>Elegí una persona</option>
        {data.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select></label>
      <label className="field">Rol del responsable<select name="roleId" defaultValue="">
        <option value="">Sin rol</option>
        {data.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
      </select></label>
      <Button variant="outline" disabled={!data.people.length}>Agregar responsable del equipo</Button>
    </form>
    {!data.people.length && <p className="muted">Agregá integrantes activos a este equipo desde Personas antes de asignarlos.</p>}
  </section>;
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { requireAccess } from "@/lib/auth";
import { fieldDefinition, safeUrl } from "@/lib/editor/model";
import { TeamCustomFields } from "@/components/editor/team-custom-fields";
import { TeamResponsibles, teamResponsiblesSchema } from "@/components/editor/team-responsibles";
import { addTeamLink, removeTeamLink, saveTeamNotes } from "./actions";

const responseSchema = z.object({
  meetingId: z.uuid(),
  version: z.number().int().positive(),
  title: z.string(),
  blocks: z.array(z.object({
    id: z.uuid(), name: z.string(), notes: z.string(),
    fieldSchema: z.array(fieldDefinition),
    customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    resources: z.array(z.object({ id: z.uuid(), title: z.string(), url: z.string().nullable() })),
  })),
});

export default async function TeamNotes({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; teamId: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const [{ id, teamId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(teamId).success) notFound();
  const a = await requireAccess();
  if (a.state !== "approved") notFound();
  const { data, error } = await a.client.rpc("get_team_block_notes", {
    p_meeting: id,
    p_team: teamId,
  });
  const parsed = responseSchema.safeParse(data);
  if (error || !parsed.success) notFound();
  const snapshot = parsed.data;
  const permissions = await Promise.all(["assign", "read_people"].map((permission) =>
    a.client.rpc("has_permission", { p_org: a.orgId, p_permission: permission, p_team: teamId })));
  if (permissions.some((result) => result.error)) throw new Error("No se pudieron verificar los permisos de asignación.");
  let responsibles = null;
  if (permissions.every((result) => result.data)) {
    const result = await a.client.rpc("get_team_block_responsibles", { p_meeting: id, p_team: teamId });
    if (result.error) throw new Error("No se pudieron cargar las asignaciones del equipo.");
    responsibles = teamResponsiblesSchema.parse(result.data);
    if (responsibles.version !== snapshot.version) throw new Error("La reunión cambió mientras se cargaba. Volvé a abrirla.");
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Contenido de tu equipo</h1>
          <p className="muted">{snapshot.title}. Solo se muestran y editan las notas, campos, enlaces y responsables autorizados de los bloques de este equipo.</p>
        </div>
        <Button asChild variant="outline"><Link href="/cronograma">Volver al cronograma</Link></Button>
      </div>
      {query.error && <p className="notice error" role="alert">{query.error === "conflicto" ? "La reunión cambió. Revisá el contenido actual antes de guardar otra vez." : "No se pudo guardar. Revisá los valores, tus permisos y el estado de la reunión."}</p>}
      {query.ok && <p className="notice" role="status">{query.ok === "responsables" ? "Responsables actualizados en borrador." : query.ok === "campos" ? "Campos guardados en borrador." : query.ok === "enlace" ? "Enlace agregado al borrador." : query.ok === "desvinculado" ? "Recurso desvinculado del borrador." : "Nota guardada en borrador."}</p>}
      <p className="notice">Guardar crea un borrador nuevo; si la reunión está publicada, su versión visible sigue intacta hasta que alguien con permiso global publique los cambios. No se envían datos de otros equipos a esta página.</p>
      <section className="panel">
        <h2>Bloques de tu equipo</h2>
        {!snapshot.blocks.length && <p className="muted">Esta reunión no tiene bloques asignados a tu equipo.</p>}
        <ul className="member-list">
          {snapshot.blocks.map((block) => (
            <li key={block.id}>
              <h3>{block.name}</h3>
              <form action={saveTeamNotes} className="editor-fields">
                <input type="hidden" name="meetingId" value={id} />
                <input type="hidden" name="teamId" value={teamId} />
                <input type="hidden" name="blockId" value={block.id} />
                <input type="hidden" name="version" value={snapshot.version} />
                <label className="field">Nota interna
                  <textarea name="notes" defaultValue={block.notes} maxLength={12000} rows={4} />
                </label>
                <Button variant="outline">Guardar nota</Button>
              </form>
              <TeamCustomFields key={`${block.id}-${snapshot.version}`} meetingId={id} teamId={teamId} blockId={block.id} version={snapshot.version} schema={block.fieldSchema} initialValues={block.customFields} />
              {responsibles && <TeamResponsibles meetingId={id} teamId={teamId} blockId={block.id} data={responsibles} />}
              <div className="editor-fields">
                <h4>Recursos y enlaces</h4>
                {!block.resources.length && <p className="muted">No hay recursos vinculados a este bloque.</p>}
                <ul className="member-list">
                  {block.resources.map((resource) => <li key={resource.id}>
                    {resource.url && safeUrl.safeParse(resource.url).success
                      ? <a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.title}</a>
                      : <span>{resource.title} (archivo privado)</span>}
                    <details>
                      <summary>Desvincular {resource.title}</summary>
                      <p className="muted">Se quita solo del borrador de este bloque; el recurso y la versión publicada se conservan.</p>
                      <form action={removeTeamLink}>
                        <input type="hidden" name="meetingId" value={id} />
                        <input type="hidden" name="teamId" value={teamId} />
                        <input type="hidden" name="blockId" value={block.id} />
                        <input type="hidden" name="resourceId" value={resource.id} />
                        <input type="hidden" name="version" value={snapshot.version} />
                        <Button variant="outline">Confirmar desvinculación</Button>
                      </form>
                    </details>
                  </li>)}
                </ul>
                <form action={addTeamLink} className="editor-fields">
                  <input type="hidden" name="meetingId" value={id} />
                  <input type="hidden" name="teamId" value={teamId} />
                  <input type="hidden" name="blockId" value={block.id} />
                  <input type="hidden" name="version" value={snapshot.version} />
                  <label className="field">Nombre del enlace<input name="title" required maxLength={200} /></label>
                  <label className="field">URL HTTPS<input name="url" type="url" required maxLength={2048} placeholder="https://..." /></label>
                  <Button variant="outline">Agregar enlace</Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

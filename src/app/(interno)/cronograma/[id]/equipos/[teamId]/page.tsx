import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { requireAccess } from "@/lib/auth";
import { saveTeamNotes } from "./actions";

const responseSchema = z.object({
  meetingId: z.uuid(),
  version: z.number().int().positive(),
  title: z.string(),
  blocks: z.array(z.object({ id: z.uuid(), name: z.string(), notes: z.string() })),
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
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Notas de tu equipo</h1>
          <p className="muted">{snapshot.title}. Solo se muestran y editan las notas de los bloques de este equipo.</p>
        </div>
        <Button asChild variant="outline"><Link href="/cronograma">Volver al cronograma</Link></Button>
      </div>
      {query.error && <p className="notice error" role="alert">{query.error === "conflicto" ? "La reunión cambió. Revisá la nota actual antes de guardar otra vez." : "No se pudo guardar. Revisá tus permisos y el estado de la reunión."}</p>}
      {query.ok && <p className="notice" role="status">Nota guardada en borrador.</p>}
      <p className="notice">Guardar crea un borrador nuevo; si la reunión está publicada, su versión visible sigue intacta hasta que alguien con permiso global publique los cambios. No se envían notas, personas ni relaciones de otros equipos a esta página.</p>
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
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

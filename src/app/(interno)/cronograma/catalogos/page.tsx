import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { BlockTypeForm } from "@/components/editor/block-type-form";
import { fieldDefinition } from "@/lib/editor/model";
import { editorContext } from "@/lib/editor/server";
import {
  applyTemplateSelected,
  deleteBlockType,
  deleteTemplate,
  renameTemplate,
  replaceTemplateDefinition,
} from "./actions";

const messages: Record<string, string> = {
  campos: "Revisá el nombre y los campos del tipo.",
  datos: "Los datos enviados no son válidos.",
  conflicto: "Otro cambio modificó este registro. Recargá e intentá de nuevo.",
  guardar: "No se pudo guardar el cambio.",
  uso: "No se puede borrar: puede estar en uso por una reunión.",
  reunion: "No se pudo cargar la reunión para la plantilla.",
};

export default async function Catalogos({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; tipo?: string; plantilla?: string }>;
}) {
  const a = await editorContext();
  const [types, templates, meetings, params] = await Promise.all([
    a.client.from("block_types").select("id,name,version,field_schema_json").eq("org_id", a.orgId).order("name"),
    a.client.from("meeting_templates").select("id,name,definition_version").eq("org_id", a.orgId).order("name"),
    a.client.from("meetings").select("id,title,date,version,status,published_revision_id,draft_revision_id").eq("org_id", a.orgId).order("date", { ascending: false }).limit(100),
    searchParams,
  ]);
  if (types.error || templates.error || meetings.error)
    throw new Error("No se pudieron consultar los tipos y plantillas.");
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Tipos y plantillas</h1>
          <p className="muted">Los cambios de definición afectan a nuevas instancias. Las reuniones existentes conservan su snapshot.</p>
        </div>
        <Button asChild variant="outline"><Link href="/cronograma">Volver al cronograma</Link></Button>
      </div>
      {params.error && <p className="notice error" role="alert">{messages[params.error] ?? "No se pudo completar la operación."}</p>}
      {(params.tipo || params.plantilla) && <p className="notice" role="status">Cambio guardado.</p>}
      <section className="panel">
        <h2>Tipos de actividad</h2>
        <p className="muted">Creá tipos reutilizables con campos propios. Editar un tipo incrementa su versión, sin reescribir bloques anteriores.</p>
        <details><summary>Crear tipo de actividad</summary><BlockTypeForm /></details>
        <ul className="member-list">
          {types.data?.map((row) => {
            const fields = z.array(fieldDefinition).parse(row.field_schema_json);
            return (
              <li key={row.id}>
                <h3>{row.name} <span className="pill">v{row.version}</span></h3>
                <p className="muted">{fields.length} campos definidos</p>
                <details><summary>Editar definición</summary><BlockTypeForm initial={{ id: row.id, name: row.name, version: row.version, fields }} /></details>
                <form action={deleteBlockType}>
                  <input type="hidden" name="id" value={row.id} />
                  <SubmitButton variant="ghost">Eliminar tipo</SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="panel" style={{ marginTop: 24 }}>
        <h2>Plantillas de reunión</h2>
        <p className="muted">Para crear una plantilla, guardá una reunión y elegí “Guardar como plantilla” desde el editor. Las copias nuevas reinician las confirmaciones.</p>
        <ul className="member-list">
          {templates.data?.map((row) => (
            <li key={row.id}>
              <h3>{row.name} <span className="pill">v{row.definition_version}</span></h3>
              <form action={renameTemplate} className="field-grid">
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="version" value={row.definition_version} />
                <label className="field">Nombre <input name="name" defaultValue={row.name} minLength={2} maxLength={120} required /></label>
                <SubmitButton variant="outline">Renombrar plantilla</SubmitButton>
              </form>
              <form action={replaceTemplateDefinition} className="field-grid">
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="version" value={row.definition_version} />
                <label className="field">
                  Reemplazar definición desde una reunión guardada
                  <select name="meetingId" required defaultValue="">
                    <option value="" disabled>Elegí una reunión</option>
                    {meetings.data?.map((meeting) => (
                      <option key={meeting.id} value={meeting.id}>{meeting.date} · {meeting.title}</option>
                    ))}
                  </select>
                </label>
                <SubmitButton variant="outline" className="catalog-template-action">Actualizar plantilla para futuras reuniones</SubmitButton>
              </form>
              <details>
                <summary>Aplicar v{row.definition_version} a reuniones existentes</summary>
                <form action={applyTemplateSelected} className="field-grid">
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="version" value={row.definition_version} />
                  <p className="muted">Elegí hasta 20 reuniones. La operación es atómica: si alguna cambió, no se modifica ninguna. Una reunión publicada conserva la versión pública y recibe un borrador nuevo. No se reemplazan borradores ya abiertos de reuniones publicadas.</p>
                  <p className="muted">Se reemplaza la estructura y el contenido de los bloques. Los responsables y sus confirmaciones se conservan solo en bloques con igual nombre y tipo; los bloques nuevos quedan sin responsables. Las asignaciones anteriores quedan en el historial. Revisá el borrador antes de publicarlo.</p>
                  <div role="group" aria-label="Reuniones para actualizar">
                    {meetings.data?.filter((meeting) =>
                      meeting.status !== "finished" && meeting.status !== "cancelled" &&
                      !(meeting.published_revision_id && meeting.draft_revision_id),
                    ).map((meeting) => (
                      <label className="field" key={meeting.id}>
                        <span><input type="checkbox" name="targets" value={`${meeting.id}:${meeting.version}`} /> {meeting.date} · {meeting.title} {meeting.published_revision_id ? "(publicada; crea borrador)" : "(borrador)"}</span>
                      </label>
                    ))}
                  </div>
                  <label className="field"><span><input type="checkbox" name="confirm" value="yes" required /> Confirmo que seleccioné estas reuniones y revisaré los borradores antes de publicarlos.</span></label>
                  <SubmitButton variant="outline">Crear borradores desde esta plantilla</SubmitButton>
                </form>
              </details>
              <form action={deleteTemplate}>
                <input type="hidden" name="id" value={row.id} />
                <SubmitButton variant="ghost">Eliminar plantilla</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
        {!templates.data?.length && <p className="muted">Todavía no hay plantillas.</p>}
      </section>
    </>
  );
}

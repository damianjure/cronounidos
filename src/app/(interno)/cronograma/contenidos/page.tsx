import Link from "next/link";
import { Button } from "@/components/ui/button";
import { editorContext } from "@/lib/editor/server";
import type { CatalogKind } from "@/lib/editor/catalog-input";
import { saveCatalogItem, deleteCatalogItem } from "./actions";
import { uploadResource, replaceResourceFile, deleteResourceFile, retryResourceFileCleanup } from "./upload";

type Item = Record<string, unknown> & { id: string; title: string };
type Option = { id: string; title: string };
const sections: { kind: CatalogKind; label: string }[] = [
  { kind: "series", label: "Series" },
  { kind: "songs", label: "Canciones" },
  { kind: "announcements", label: "Anuncios" },
  { kind: "messages", label: "Mensajes" },
  { kind: "resources", label: "Recursos" },
];

function ItemForm({ kind, item, series, people }: {
  kind: CatalogKind;
  item?: Item;
  series: Option[];
  people: Option[];
}) {
  const value = (key: string) => String(item?.[key] ?? "");
  return (
    <form action={saveCatalogItem} className="editor-fields">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <label className="field">
        Título
        <input name="title" defaultValue={item?.title ?? ""} required maxLength={200} />
      </label>
      {kind === "songs" && <label className="field">Artista <input name="artist" defaultValue={value("artist")} maxLength={12000} /></label>}
      {kind === "announcements" && <label className="field">Descripción <textarea name="description" defaultValue={value("description")} maxLength={12000} rows={3} /></label>}
      {(kind === "songs" || kind === "announcements") && (
        <label><input type="checkbox" name="active" defaultChecked={item ? item.active === true : true} /> Activo en el catálogo</label>
      )}
      {kind === "messages" && (
        <div className="field-grid">
          <label className="field">
            Serie
            <select name="seriesId" defaultValue={value("series_id")}>
              <option value="">Sin serie</option>
              {series.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
            </select>
          </label>
          <label className="field">
            Predicador
            <select name="preacherPersonId" defaultValue={value("preacher_person_id")}>
              <option value="">Sin predicador</option>
              {people.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
            </select>
          </label>
        </div>
      )}
      {kind === "resources" && (
        <div className="field-grid">
          <label className="field">URL HTTPS <input type="url" name="url" defaultValue={value("url")} required maxLength={2048} /></label>
          <label className="field">
            Tipo de recurso
            <select name="resourceType" defaultValue={value("resource_type") || "link"}>
              <option value="link">Enlace</option>
              <option value="image">Imagen</option>
              <option value="slide">Placa</option>
              <option value="document">Documento</option>
            </select>
          </label>
        </div>
      )}
      <Button>{item ? "Guardar cambios" : "Agregar al catálogo"}</Button>
    </form>
  );
}

export default async function Contents({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; cleanup?: string }>;
}) {
  const a = await editorContext();
  const queries = await Promise.all([
    ...sections.map(({ kind }) => a.client.from(kind).select("*").eq("org_id", a.orgId).order("title")),
    a.client.from("people").select("id,first_name,last_name").eq("org_id", a.orgId).eq("active", true).order("first_name"),
    searchParams,
  ]);
  const params = queries[6] as { error?: string; ok?: string; cleanup?: string };
  if (queries.slice(0, 6).some((result) => "error" in result && result.error))
    throw new Error("No se pudieron cargar los contenidos.");
  const rows = queries.slice(0, 5) as { data: Item[] | null }[];
  const peopleResult = queries[5] as { data: { id: string; first_name: string; last_name: string }[] | null };
  const series = (rows[0].data ?? []).map((entry) => ({ id: entry.id, title: entry.title }));
  const people = (peopleResult.data ?? []).map((person) => ({ id: person.id, title: `${person.first_name} ${person.last_name}` }));
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Contenidos reutilizables</h1>
          <p className="muted">Administrá canciones, anuncios, mensajes, series y enlaces que el editor puede seleccionar.</p>
        </div>
        <Button asChild variant="outline"><Link href="/cronograma">Volver al cronograma</Link></Button>
      </div>
      {params.error && <p className="notice error" role="alert">{params.error === "uso" ? "El recurso está en uso. Cambiá primero sus vínculos en un borrador." : params.error === "conflicto" ? "El recurso cambió. Recargá la página antes de intentar de nuevo." : params.error === "datos" ? "Revisá los datos enviados." : params.error === "archivo" ? "Elegí una imagen PNG/JPEG/WebP o PDF de hasta 5 MB." : params.error === "subida" ? "No se pudo subir el archivo privado." : "No se pudo guardar el cambio."}</p>}
      {params.ok && <p className="notice" role="status">Catálogo actualizado.</p>}
      {params.cleanup && <div className="notice" role="status">El catálogo se actualizó, pero quedó una limpieza de archivo pendiente. Podés reintentar sin perder el cambio.<form action={retryResourceFileCleanup}><Button variant="outline">Reintentar limpieza</Button></form></div>}
      {sections.map(({ kind, label }, index) => (
        <section className="panel" style={{ marginBottom: 24 }} key={kind}>
          <h2>{label}</h2>
          <details><summary>Agregar {label.toLowerCase()}</summary><ItemForm kind={kind} series={series} people={people} /></details>
          {kind === "resources" && (
            <details>
              <summary>Subir archivo privado</summary>
              <form action={uploadResource} className="editor-fields">
                <label className="field">Título <input name="title" required maxLength={200} /></label>
                <label className="field">Imagen o PDF (máximo 5 MB)
                  <input name="file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required />
                </label>
                <Button>Subir recurso</Button>
              </form>
            </details>
          )}
          <ul className="member-list">
            {(rows[index].data ?? []).map((item) => (
              <li key={item.id}>
                <h3>{item.title}</h3>
                {kind === "resources" && item.storage_path ? (
                  <>
                    <p><Link href={`/recursos/${item.id}`}>Abrir archivo privado</Link></p>
                    <details><summary>Reemplazar archivo privado</summary>
                      <p className="muted">Solo si el recurso aún no está vinculado a ninguna actividad o anuncio. El nuevo archivo usa otra ruta privada; el anterior se limpia después de confirmar el cambio.</p>
                      <form action={replaceResourceFile} className="editor-fields">
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="oldPath" value={String(item.storage_path)} />
                        <label className="field">Título <input name="title" defaultValue={item.title} required maxLength={200} /></label>
                        <label className="field">Archivo nuevo (máximo 5 MB)<input name="file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required /></label>
                        <Button variant="outline">Reemplazar archivo</Button>
                      </form>
                    </details>
                    <details><summary>Eliminar archivo privado</summary>
                      <p className="muted">Solo si no está en uso. Se quitará del catálogo y se limpiará el archivo.</p>
                      <form action={deleteResourceFile} className="editor-fields">
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="oldPath" value={String(item.storage_path)} />
                        <label><input type="checkbox" name="confirm" value="yes" required /> Confirmo que quiero eliminar este recurso</label>
                        <Button variant="ghost">Eliminar archivo privado</Button>
                      </form>
                    </details>
                  </>
                ) : (
                  <>
                    <details><summary>Editar</summary><ItemForm kind={kind} item={item} series={series} people={people} /></details>
                    <form action={deleteCatalogItem}>
                      <input type="hidden" name="kind" value={kind} />
                      <input type="hidden" name="id" value={item.id} />
                      <Button variant="ghost">Eliminar</Button>
                    </form>
                  </>
                )}
              </li>
            ))}
          </ul>
          {!rows[index].data?.length && <p className="muted">Todavía no hay registros.</p>}
        </section>
      ))}
    </>
  );
}

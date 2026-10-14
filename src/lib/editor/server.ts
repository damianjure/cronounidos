import "server-only";
import { cache } from "react";
import { accessContext } from "@/lib/auth";
import { snapshotSchema, type Catalog, fieldDefinition } from "./model";
import { z } from "zod";
export const editorContext = cache(async function editorContext() {
  const a = await accessContext();
  if (a.state !== "approved") throw new Error("Acceso no autorizado.");
  const { data, error } = await a.client.rpc("can_edit_meetings", {
    p_org: a.orgId,
  });
  if (error || !data)
    throw new Error(
      "El editor requiere permisos de planificación, contenidos, personas y asignación.",
    );
  return a;
});
export async function loadSnapshot(meetingId: string) {
  const a = await editorContext();
  const { data, error } = await a.client.rpc("get_editor_snapshot", {
    p_meeting: meetingId,
  });
  if (error)
    throw new Error(
      "No se pudo cargar el borrador. Verificá tus permisos y las migraciones.",
    );
  return snapshotSchema.parse(data);
}
export async function loadCatalog(): Promise<Catalog> {
  const a = await editorContext();
  const specs = [
    ["teams", "id,name"],
    ["people", "id,first_name,last_name"],
    ["roles", "id,name,team_id"],
    ["block_types", "id,name,field_schema_json"],
    ["songs", "id,title"],
    ["announcements", "id,title"],
    ["messages", "id,title"],
    ["resources", "id,title,url"],
    ["meeting_types", "id,name"],
    ["series", "id,title"],
  ] as const;
  const results = await Promise.all(
    specs.map(async ([table, columns]) => {
      let query = a.client.from(table).select(columns).eq("org_id", a.orgId);
      if (
        ["teams", "people", "roles", "songs", "announcements"].includes(table)
      )
        query = query.eq("active", true);
      const { data, error } = await query;
      if (error) throw new Error(`No se pudo cargar el catálogo ${table}.`);
      return (data ?? []) as unknown as Record<string, unknown>[];
    }),
  );
  const items = (i: number) =>
    results[i].map((r) => ({
      id: String(r.id),
      name: String(r.name ?? r.title ?? `${r.first_name} ${r.last_name}`),
    }));
  const roles = items(2),
    blockTypes = items(3),
    resources = items(7);
  return {
    teams: items(0),
    people: items(1),
    roles: results[2].map((r, i) => ({
      ...roles[i],
      teamId: r.team_id as string | null,
    })),
    blockTypes: results[3].map((r, i) => ({
      ...blockTypes[i],
      fieldSchema: z.array(fieldDefinition).parse(r.field_schema_json),
    })),
    songs: items(4),
    announcements: items(5),
    messages: items(6),
    resources: results[7].map((r, i) => ({
      ...resources[i],
      url: r.url as string | null,
    })),
    meetingTypes: items(8),
    series: items(9),
  };
}

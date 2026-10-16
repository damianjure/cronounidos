import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import {
  snapshotSchema,
  emptyBlock,
  defaultCopyOptions,
  type EditorSnapshot,
} from "@/lib/editor/model";
let db: PGlite;
let current: EditorSnapshot;
let canonical: string;
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1),
  other = id(2),
  admin = id(9001),
  pending = id(9002),
  member = id(9003),
  otherAdmin = id(9004);
const metadata = {
  title: "Encuentro ficticio",
  date: "2026-10-18",
  startLocalTime: "10:00",
  timezone: "America/Argentina/Buenos_Aires",
  meetingTypeId: id(401),
  seriesId: null,
};
async function actor(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(
    `set role ${user ? "authenticated" : "anon"};select set_config('request.jwt.claim.sub','${user ?? ""}',false)`,
  );
  try {
    return await db.query<{ result: unknown }>(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
async function rpc(user: string, name: string, params: unknown[]) {
  const placeholders = params.map((_, i) => `$${i + 1}`).join(",");
  const result = await actor(
    user,
    `select public.${name}(${placeholders}) result`,
    params,
  );
  return result.rows[0]?.result;
}
async function save(s: EditorSnapshot, blocks = s.blocks, meta = s.metadata) {
  return snapshotSchema.parse(
    await rpc(admin, "save_editor_snapshot", [
      s.meetingId,
      s.version,
      meta,
      blocks,
    ]),
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  for (const f of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  await db.exec(
    `insert into public.organizations(id,name,slug) values('${other}','Otra org ficticia','otra-org');insert into auth.users(id,email,raw_user_meta_data) values('${admin}','admin@example.invalid','{}'),('${pending}','pendiente@example.invalid','{"admin":true}'),('${member}','miembro@example.invalid','{}'),('${otherAdmin}','otro@example.invalid','{}');update public.profiles set approved_at=now() where user_id<>'${pending}';update public.profiles set org_id='${org}',person_id='${id(101)}' where user_id='${member}';insert into public.memberships(org_id,user_id,status) values('${org}','${admin}','approved'),('${org}','${pending}','pending'),('${org}','${member}','approved'),('${other}','${otherAdmin}','approved');insert into public.permission_grants(org_id,subject_user_id,permission) values('${org}','${admin}','administer'),('${org}','${member}','read_agenda'),('${other}','${otherAdmin}','administer');insert into public.resources(id,org_id,title,url,resource_type) values('${id(901)}','${org}','Enlace ficticio','https://example.invalid','link');insert into public.songs(id,org_id,title) values('${id(902)}','${other}','Canción de otra org');`,
  );
});
afterAll(async () => db.close());
it("editor exige aprobación y permisos completos", async () => {
  expect(await rpc(pending, "can_edit_meetings", [org])).toBe(false);
  expect(await rpc(member, "can_edit_meetings", [org])).toBe(false);
  expect(await rpc(admin, "can_edit_meetings", [org])).toBe(true);
  await expect(
    rpc(member, "create_editor_meeting", [org, metadata, null]),
  ).rejects.toThrow(/Forbidden/);
});
it("crear reunión calcula UTC desde fecha local y zona IANA", async () => {
  current = snapshotSchema.parse(
    await rpc(admin, "create_editor_meeting", [org, metadata, null]),
  );
  expect(current.version).toBe(1);
  expect(current.blocks).toEqual([]);
  const r = await db.query<{ utc: Date }>(
    "select scheduled_start utc from public.meeting_revisions where id=$1",
    [current.revisionId],
  );
  expect(new Date(r.rows[0].utc).toISOString()).toBe(
    "2026-10-18T13:00:00.000Z",
  );
});
it("guardar snapshot persiste entidades y participantes pendientes", async () => {
  const b = emptyBlock("Alabanza ficticia");
  b.notes = "Nota interna";
  b.songIds = [id(601)];
  b.resourceIds = [id(901)];
  b.fieldSchema = [{ key: "enlace", label: "Enlace", type: "url" }];
  b.customFields = { enlace: "https://example.invalid/nota" };
  b.responsibles = [
    { assignmentId: null, personId: id(101), teamId: id(201), roleId: id(301) },
  ];
  b.subactivities = [
    {
      clientKey: crypto.randomUUID(),
      title: "Actividad paralela",
      teamId: id(202),
      personId: id(101),
      offsetSeconds: 10,
      durationSeconds: 50,
      notes: "Nota paralela",
      customFields: {},
      fieldSchema: [],
    },
  ];
  current = await save(current, [b]);
  expect(current.version).toBe(2);
  expect(current.blocks[0].songIds).toEqual([id(601)]);
  expect(current.blocks[0].subactivities[0].personId).toBe(id(101));
  canonical = current.blocks[0].responsibles[0].assignmentId!;
  expect(
    (
      await db.query(
        "select status,responded_at from public.assignments where id=$1",
        [canonical],
      )
    ).rows,
  ).toEqual([{ status: "pending", responded_at: null }]);
});
it("borrador no entrega asignaciones ni notas al integrante", async () => {
  expect(
    (await actor(member, "select * from public.assignments")).rows,
  ).toEqual([]);
  await expect(
    rpc(member, "get_editor_snapshot", [current.meetingId]),
  ).rejects.toThrow(/Forbidden/);
  expect(
    (await actor(null, "select * from public.public_agenda(null)")).rows,
  ).toEqual([]);
});
it("publicar guarda y publica atómicamente sin duplicar confirmaciones", async () => {
  const previous = canonical;
  current = snapshotSchema.parse(
    await rpc(admin, "publish_editor_snapshot", [
      current.meetingId,
      current.version,
      current.metadata,
      current.blocks,
    ]),
  );
  expect(current.revisionId).toBe(current.publishedRevisionId);
  expect(current.blocks[0].responsibles[0].assignmentId).toBe(previous);
  expect(
    (
      await db.query(
        "select count(*)::int n from public.assignments where meeting_id=$1",
        [current.meetingId],
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
  expect(
    (await actor(null, "select activity from public.public_agenda(null)")).rows,
  ).toEqual([{ activity: "Alabanza ficticia" }]);
});
it("asignación canónica se confirma desde la revisión publicada", async () => {
  await rpc(member, "confirm_assignment", [canonical, "confirmed"]);
  expect(
    (
      await db.query("select status from public.assignments where id=$1", [
        canonical,
      ])
    ).rows,
  ).toEqual([{ status: "confirmed" }]);
});
it("editar metadatos no modifica fecha ni título publicado", async () => {
  current = await save(
    current,
    current.blocks.map((b) => ({ ...b, name: "Nombre de borrador" })),
    {
      ...current.metadata,
      title: "Título privado nuevo",
      date: "2026-10-25",
      startLocalTime: "11:00",
    },
  );
  expect(current.metadata.title).toBe("Título privado nuevo");
  const m = await actor(
    member,
    "select title,date from public.meetings where id=$1",
    [current.meetingId],
  );
  expect(m.rows[0]).toMatchObject({ title: "Encuentro ficticio" });
  expect(
    (await actor(null, "select activity from public.public_agenda(null)")).rows,
  ).toEqual([{ activity: "Alabanza ficticia" }]);
  expect(
    (
      await db.query("select status from public.assignments where id=$1", [
        canonical,
      ])
    ).rows,
  ).toEqual([{ status: "confirmed" }]);
});
it("versión obsoleta no crea snapshots ni efectos laterales", async () => {
  const count = (
    await db.query("select count(*)::int n from public.meeting_revisions")
  ).rows;
  await expect(
    rpc(admin, "save_editor_snapshot", [
      current.meetingId,
      current.version - 1,
      current.metadata,
      current.blocks,
    ]),
  ).rejects.toThrow(/Version conflict/);
  expect(
    (await db.query("select count(*)::int n from public.meeting_revisions"))
      .rows,
  ).toEqual(count);
});
it("fallo de FK revierte toda la transacción", async () => {
  const before = (
    await db.query("select count(*)::int n from public.meeting_revisions")
  ).rows;
  await expect(
    save(
      current,
      current.blocks.map((b) => ({ ...b, songIds: [id(902)] })),
    ),
  ).rejects.toThrow(/foreign key/);
  expect(
    (await db.query("select count(*)::int n from public.meeting_revisions"))
      .rows,
  ).toEqual(before);
  expect(
    snapshotSchema.parse(
      await rpc(admin, "get_editor_snapshot", [current.meetingId]),
    ).version,
  ).toBe(current.version);
});
it("duplicar selecciona grupos y reinicia confirmaciones reales", async () => {
  const duplicate = snapshotSchema.parse(
    await rpc(admin, "duplicate_editor_meeting", [
      current.meetingId,
      { ...current.metadata, title: "Copia ficticia" },
      { ...defaultCopyOptions, songs: false, resources: false },
    ]),
  );
  expect(duplicate.meetingId).not.toBe(current.meetingId);
  expect(duplicate.publishedRevisionId).toBeNull();
  expect(duplicate.blocks[0].notes).toBe("");
  expect(duplicate.blocks[0].customFields).toEqual({});
  expect(duplicate.blocks[0].songIds).toEqual([]);
  expect(duplicate.blocks[0].resourceIds).toEqual([]);
  expect(duplicate.blocks[0].subactivities[0].notes).toBe("");
  const copiedId = duplicate.blocks[0].responsibles[0].assignmentId!;
  expect(copiedId).not.toBe(canonical);
  expect(
    (
      await db.query(
        "select status,responded_at from public.assignments where id=$1",
        [copiedId],
      )
    ).rows,
  ).toEqual([{ status: "pending", responded_at: null }]);
  expect(
    (
      await db.query("select status from public.assignments where id=$1", [
        canonical,
      ])
    ).rows,
  ).toEqual([{ status: "confirmed" }]);
});
it("duplicación sin estructura no copia bloques ni responsables", async () => {
  const duplicate = snapshotSchema.parse(
    await rpc(admin, "duplicate_editor_meeting", [
      current.meetingId,
      current.metadata,
      { ...defaultCopyOptions, structure: false },
    ]),
  );
  expect(duplicate.blocks).toEqual([]);
  expect(
    (
      await db.query(
        "select count(*)::int n from public.assignments where meeting_id=$1",
        [duplicate.meetingId],
      )
    ).rows,
  ).toEqual([{ n: 0 }]);
});
it("otro administrador y anon no pueden acceder al snapshot", async () => {
  await expect(
    rpc(otherAdmin, "get_editor_snapshot", [current.meetingId]),
  ).rejects.toThrow(/Forbidden/);
  await expect(
    actor(null, "select public.get_editor_snapshot($1)", [current.meetingId]),
  ).rejects.toThrow(/permission denied/);
});
it("ni administrador puede modificar snapshot con UPDATE directo", async () => {
  await expect(
    actor(admin, "update public.meeting_blocks set name='Hack' where id=$1", [
      current.blocks[0].id,
    ]),
  ).rejects.toThrow(/permission denied/);
});
it("API SQL rechaza enlaces inseguros sin confiar en frontend", async () => {
  const b = {
    ...current.blocks[0],
    customFields: { enlace: "javascript:alert(1)" },
  };
  await expect(save(current, [b])).rejects.toThrow(/Unsafe URL/);
});
it("API SQL rechaza paralelas fuera de duración del padre", async () => {
  const b = {
    ...current.blocks[0],
    subactivities: current.blocks[0].subactivities.map((s) => ({
      ...s,
      offsetSeconds: 299,
      durationSeconds: 20,
    })),
  };
  await expect(save(current, [b])).rejects.toThrow(/parallel activity/);
});
it("reordenar y publicar mantiene horas y privacidad mínimas", async () => {
  const a = current.blocks[0];
  const b = emptyBlock("Cierre público");
  current = await save(current, [b, a]);
  current = snapshotSchema.parse(
    await rpc(admin, "publish_editor_snapshot", [
      current.meetingId,
      current.version,
      current.metadata,
      current.blocks,
    ]),
  );
  const rows = (
    await actor(null, "select * from public.public_agenda($1)", [
      current.meetingId,
    ])
  ).rows as unknown as { activity: string; starts_at: Date }[];
  expect(rows.map((r) => r.activity)).toEqual([
    "Cierre público",
    "Nombre de borrador",
  ]);
  expect(
    new Date(rows[1].starts_at).getTime() -
      new Date(rows[0].starts_at).getTime(),
  ).toBe(300000);
  expect(JSON.stringify(rows)).not.toMatch(
    /Nota interna|enlace|personId|Nota paralela/,
  );
});
it("duplicación sin opciones explícitas se rechaza", async () => {
  await expect(
    rpc(admin, "duplicate_editor_meeting", [
      current.meetingId,
      current.metadata,
      {},
    ]),
  ).rejects.toThrow(/Invalid copy options/);
});
it("crear desde plantilla copia una definición sin alterar instancias anteriores", async () => {
  const templateId = id(950);
  const block = emptyBlock("Plantilla inicial");
  await db.query(
    "insert into public.meeting_templates(id,org_id,name,definition_json) values($1,$2,$3,$4)",
    [templateId, org, "Plantilla ficticia", { blocks: [block] }],
  );
  const original = snapshotSchema.parse(
    await rpc(admin, "create_editor_meeting", [org, metadata, templateId]),
  );
  block.name = "Plantilla actualizada";
  await db.query(
    "update public.meeting_templates set definition_version=2,definition_json=$2 where id=$1",
    [templateId, { blocks: [block] }],
  );
  const next = snapshotSchema.parse(
    await rpc(admin, "create_editor_meeting", [org, metadata, templateId]),
  );
  expect(original.blocks[0].name).toBe("Plantilla inicial");
  expect(
    snapshotSchema.parse(
      await rpc(admin, "get_editor_snapshot", [original.meetingId]),
    ).blocks[0].name,
  ).toBe("Plantilla inicial");
  expect(next.blocks[0].name).toBe("Plantilla actualizada");
});
it("aplicar plantilla a reuniones seleccionadas crea borradores atómicos y conserva confirmaciones", async () => {
  const templateId = id(951);
  const block = emptyBlock("Bloque compartido");
  block.durationSeconds = 300;
  await db.query(
    "insert into public.meeting_templates(id,org_id,name,definition_json) values($1,$2,$3,$4)",
    [templateId, org, "Plantilla selectiva", { blocks: [block] }],
  );
  let published = snapshotSchema.parse(await rpc(admin, "create_editor_meeting", [org, metadata, templateId]));
  let draft = snapshotSchema.parse(await rpc(admin, "create_editor_meeting", [org, metadata, templateId]));
  published.blocks[0].responsibles = [
    { assignmentId: null, personId: id(101), teamId: id(201), roleId: id(301) },
  ];
  published = snapshotSchema.parse(await rpc(admin, "publish_editor_snapshot", [
    published.meetingId, published.version, published.metadata, published.blocks,
  ]));
  const originalRevision = published.publishedRevisionId;
  const assignmentId = published.blocks[0].responsibles[0].assignmentId;
  await db.query("update public.assignments set status='confirmed',responded_at=now() where id=$1", [assignmentId]);
  block.durationSeconds = 540;
  await db.query("update public.meeting_templates set definition_version=2,definition_json=$2 where id=$1", [templateId, { blocks: [block] }]);
  const targets = [
    { id: published.meetingId, version: published.version },
    { id: draft.meetingId, version: draft.version },
  ];
  await expect(rpc(member, "apply_template_selected", [templateId, 2, targets])).rejects.toThrow(/Forbidden/);
  await expect(rpc(admin, "apply_template_selected", [templateId, 1, targets])).rejects.toThrow(/Template version conflict/);
  await expect(rpc(admin, "apply_template_selected", [templateId, null, targets])).rejects.toThrow(/Template version conflict/);
  await expect(rpc(admin, "apply_template_selected", [templateId, 2, [targets[0], targets[0]]])).rejects.toThrow(/repeated targets/);
  await rpc(admin, "apply_template_selected", [templateId, 2, targets]);
  published = snapshotSchema.parse(await rpc(admin, "get_editor_snapshot", [published.meetingId]));
  draft = snapshotSchema.parse(await rpc(admin, "get_editor_snapshot", [draft.meetingId]));
  expect(published.publishedRevisionId).toBe(originalRevision);
  expect(published.revisionId).not.toBe(originalRevision);
  expect(published.blocks[0].durationSeconds).toBe(540);
  expect(draft.blocks[0].durationSeconds).toBe(540);
  expect(published.blocks[0].responsibles[0].assignmentId).toBe(assignmentId);
  expect((await db.query("select status from public.assignments where id=$1", [assignmentId])).rows[0]).toEqual({ status: "confirmed" });
  const publicRows = (await actor(null, "select activity,duration_seconds from public.public_agenda($1)", [published.meetingId])).rows;
  expect(publicRows).toEqual([{ activity: "Bloque compartido", duration_seconds: 300 }]);
  await expect(rpc(admin, "apply_template_selected", [templateId, 2, [
    { id: draft.meetingId, version: draft.version },
    { id: published.meetingId, version: published.version },
  ]])).rejects.toThrow(/Existing draft/);
  expect(snapshotSchema.parse(await rpc(admin, "get_editor_snapshot", [draft.meetingId])).version).toBe(draft.version);
});
it("reemplazar o eliminar archivo privado encola limpieza y protege referencias", async () => {
  const resource = id(981);
  const oldPath = `${org}/${id(982)}.png`;
  const nextPath = `${org}/${id(983)}.pdf`;
  await db.query(
    "insert into public.resources(id,org_id,title,storage_path,resource_type) values($1,$2,$3,$4,$5)",
    [resource, org, "Archivo ficticio", oldPath, "image"],
  );
  await expect(rpc(member, "replace_unlinked_resource_file", [resource, oldPath, nextPath, "Nuevo", "document"]))
    .rejects.toThrow(/Forbidden/);
  await expect(rpc(admin, "replace_unlinked_resource_file", [resource, oldPath, `${other}/${id(984)}.pdf`, "Nuevo", "document"]))
    .rejects.toThrow(/Invalid resource path/);
  await rpc(admin, "replace_unlinked_resource_file", [resource, oldPath, nextPath, "Documento ficticio", "document"]);
  expect((await db.query("select title,storage_path from public.resources where id=$1", [resource])).rows[0])
    .toEqual({ title: "Documento ficticio", storage_path: nextPath });
  expect((await actor(admin, "select path from public.pending_resource_file_cleanup($1)", [org])).rows)
    .toEqual([{ path: oldPath }]);
  await expect(actor(null, "select * from public.pending_resource_file_cleanup($1)", [org]))
    .rejects.toThrow(/permission denied/);
  await rpc(admin, "ack_resource_file_cleanup", [org, oldPath]);
  expect((await actor(admin, "select path from public.pending_resource_file_cleanup($1)", [org])).rows).toEqual([]);

  const meeting = snapshotSchema.parse(await rpc(admin, "create_editor_meeting", [org, metadata, null]));
  const linked = snapshotSchema.parse(await rpc(admin, "save_editor_snapshot", [
    meeting.meetingId, meeting.version, meeting.metadata, [emptyBlock("Borrador ficticio")],
  ]));
  await db.query("insert into public.resource_links(org_id,resource_id,block_id) values($1,$2,$3)", [org, resource, linked.blocks[0].id]);
  await expect(rpc(admin, "delete_unlinked_resource_file", [resource, nextPath])).rejects.toThrow(/Resource in use/);
  await db.query("delete from public.resource_links where resource_id=$1", [resource]);
  await rpc(admin, "delete_unlinked_resource_file", [resource, nextPath]);
  expect((await actor(admin, "select path from public.pending_resource_file_cleanup($1)", [org])).rows)
    .toEqual([{ path: nextPath }]);
  expect((await db.query("select id from public.resources where id=$1", [resource])).rows).toEqual([]);
});
it("editor parcial de equipo modifica solo su nota y preserva el borrador oculto", async () => {
  const own = emptyBlock("Media ficticia");
  own.teamId = id(201);
  own.notes = "Nota inicial de Media";
  own.fieldSchema = [{ key: "url_guion", label: "Guion", type: "url" }];
  own.customFields = { url_guion: "https://example.invalid/inicial" };
  own.resourceIds = [id(901)];
  const hidden = emptyBlock("Otro equipo ficticio");
  hidden.teamId = id(202);
  hidden.notes = "Nota privada de otro equipo";
  hidden.fieldSchema = [{ key: "dato_oculto", label: "Oculto", type: "text" }];
  hidden.customFields = { dato_oculto: "Valor secreto del otro equipo" };
  hidden.songIds = [id(601)];
  const hiddenResource = id(903);
  await db.query("insert into public.resources(id,org_id,title,url,resource_type) values($1,$2,'Recurso oculto','https://example.invalid/oculto','link')", [hiddenResource, org]);
  hidden.resourceIds = [hiddenResource];
  let meeting = snapshotSchema.parse(await rpc(admin, "create_editor_meeting", [org, metadata, null]));
  meeting = snapshotSchema.parse(await rpc(admin, "publish_editor_snapshot", [
    meeting.meetingId, meeting.version, meeting.metadata, [own, hidden],
  ]));
  const publishedRevision = meeting.publishedRevisionId;
  await expect(rpc(member, "get_team_block_notes", [meeting.meetingId, id(201)])).rejects.toThrow(/Forbidden/);
  await expect(rpc(member, "save_team_block_fields", [meeting.meetingId, id(201), meeting.blocks[0].id, meeting.version, own.customFields]))
    .rejects.toThrow(/Forbidden/);
  await expect(rpc(member, "add_team_block_url", [meeting.meetingId, id(201), meeting.blocks[0].id, meeting.version, "Sin permiso", "https://example.invalid/no"]))
    .rejects.toThrow(/Forbidden/);
  await expect(rpc(otherAdmin, "remove_team_block_resource", [meeting.meetingId, id(201), meeting.blocks[0].id, meeting.version, id(901)]))
    .rejects.toThrow(/Forbidden/);
  await expect(rpc(otherAdmin, "save_team_block_fields", [meeting.meetingId, id(201), meeting.blocks[0].id, meeting.version, own.customFields]))
    .rejects.toThrow(/Forbidden/);
  await expect(actor(null, "select public.save_team_block_fields($1,$2,$3,$4,$5) result", [meeting.meetingId, id(201), meeting.blocks[0].id, meeting.version, own.customFields]))
    .rejects.toThrow(/permission denied/);
  await expect(actor(null, "select public.add_team_block_url($1,$2,$3,$4,$5,$6) result", [meeting.meetingId, id(201), meeting.blocks[0].id, meeting.version, "Sin sesión", "https://example.invalid/no"]))
    .rejects.toThrow(/permission denied/);
  await db.query(
    "insert into public.permission_grants(org_id,subject_user_id,team_id,permission) values($1,$2,$3,'plan'),($1,$2,$3,'read_content')",
    [org, member, id(201)],
  );
  await expect(rpc(member, "get_editor_snapshot", [meeting.meetingId])).rejects.toThrow(/Forbidden/);
  expect((await actor(member, "select id from public.team_note_editor_teams($1)", [org])).rows)
    .toEqual([{ id: id(201) }]);
  const visible = await rpc(member, "get_team_block_notes", [meeting.meetingId, id(201)]) as { version: number; blocks: { id: string; name: string; notes: string; fieldSchema: unknown[]; customFields: Record<string, unknown>; resources: { id: string; title: string; url: string | null }[] }[] };
  expect(visible.blocks).toEqual([{ id: meeting.blocks[0].id, name: "Media ficticia", notes: "Nota inicial de Media", fieldSchema: own.fieldSchema, customFields: own.customFields, resources: [{ id: id(901), title: "Enlace ficticio", url: "https://example.invalid" }] }]);
  expect(JSON.stringify(visible)).not.toContain("Nota privada de otro equipo");
  expect(JSON.stringify(visible)).not.toContain("Valor secreto del otro equipo");
  expect(JSON.stringify(visible)).not.toContain("Recurso oculto");
  expect(JSON.stringify(visible)).not.toContain(id(601));
  await expect(rpc(member, "get_team_block_notes", [meeting.meetingId, id(202)])).rejects.toThrow(/Forbidden/);
  await expect(rpc(member, "save_team_block_notes", [meeting.meetingId, id(201), meeting.blocks[1].id, visible.version, "Intrusión"]))
    .rejects.toThrow(/Forbidden/);
  const saved = await rpc(member, "save_team_block_notes", [meeting.meetingId, id(201), meeting.blocks[0].id, visible.version, "Nueva nota de Media"]) as { version: number; blocks: { id: string; notes: string }[] };
  expect(saved.blocks[0].notes).toBe("Nueva nota de Media");
  await expect(rpc(member, "save_team_block_notes", [meeting.meetingId, id(201), meeting.blocks[0].id, visible.version, "Stale"]))
    .rejects.toThrow(/Version conflict/);
  const full = snapshotSchema.parse(await rpc(admin, "get_editor_snapshot", [meeting.meetingId]));
  expect(full.publishedRevisionId).toBe(publishedRevision);
  expect(full.revisionId).not.toBe(publishedRevision);
  expect(full.blocks[1].notes).toBe("Nota privada de otro equipo");
  expect(full.blocks[1].songIds).toEqual([id(601)]);
  expect(full.blocks[0].notes).toBe("Nueva nota de Media");
  const beforeFields = saved.version;
  for (const [name, tail] of [
    ["save_team_block_notes", ["Sin versión"]],
    ["save_team_block_fields", [{}]],
    ["add_team_block_url", ["Sin versión", "https://example.invalid/no"]],
    ["remove_team_block_resource", [id(901)]],
  ] as const) {
    await expect(rpc(member, name, [meeting.meetingId, id(201), saved.blocks[0].id, null, ...tail]))
      .rejects.toThrow(/Version conflict/);
  }
  await expect(rpc(member, "save_team_block_fields", [meeting.meetingId, id(201), meeting.blocks[1].id, beforeFields, { dato_oculto: "Intrusión" }]))
    .rejects.toThrow(/Forbidden/);
  await expect(rpc(member, "save_team_block_fields", [meeting.meetingId, id(201), saved.blocks[0].id, beforeFields, { dato_oculto: "Intrusión" }]))
    .rejects.toThrow(/Unknown custom field/);
  await expect(rpc(member, "save_team_block_fields", [meeting.meetingId, id(201), saved.blocks[0].id, beforeFields, { url_guion: "http://inseguro.invalid" }]))
    .rejects.toThrow(/Unsafe URL/);
  const fieldsSaved = await rpc(member, "save_team_block_fields", [meeting.meetingId, id(201), saved.blocks[0].id, beforeFields, { url_guion: "https://example.invalid/nuevo" }]) as { version: number; blocks: { id: string; customFields: Record<string, unknown> }[] };
  expect(fieldsSaved.blocks[0].customFields).toEqual({ url_guion: "https://example.invalid/nuevo" });
  await expect(rpc(member, "save_team_block_fields", [meeting.meetingId, id(201), meeting.blocks[0].id, beforeFields, {}]))
    .rejects.toThrow(/Version conflict/);
  const afterFields = snapshotSchema.parse(await rpc(admin, "get_editor_snapshot", [meeting.meetingId]));
  expect(afterFields.publishedRevisionId).toBe(publishedRevision);
  expect(afterFields.blocks[0].notes).toBe("Nueva nota de Media");
  expect(afterFields.blocks[1].customFields).toEqual(hidden.customFields);
  const fieldsBlock = fieldsSaved.blocks[0].id;
  await expect(rpc(member, "add_team_block_url", [meeting.meetingId, id(201), fieldsBlock, fieldsSaved.version, "Inseguro", "http://example.invalid/no"]))
    .rejects.toThrow(/Invalid URL/);
  await expect(rpc(member, "add_team_block_url", [meeting.meetingId, id(201), afterFields.blocks[1].id, fieldsSaved.version, "Intrusión", "https://example.invalid/no"]))
    .rejects.toThrow(/Forbidden/);
  const linked = await rpc(member, "add_team_block_url", [meeting.meetingId, id(201), fieldsBlock, fieldsSaved.version, "Guion nuevo", "https://example.invalid/nuevo-guion"]) as { version: number; blocks: { id: string; resources: { id: string; title: string }[] }[] };
  expect(linked.blocks[0].resources.map((r) => r.title)).toEqual(["Enlace ficticio", "Guion nuevo"]);
  await expect(rpc(member, "remove_team_block_resource", [meeting.meetingId, id(201), linked.blocks[0].id, linked.version, hiddenResource]))
    .rejects.toThrow(/Resource not linked/);
  const unlinked = await rpc(member, "remove_team_block_resource", [meeting.meetingId, id(201), linked.blocks[0].id, linked.version, id(901)]) as { version: number; blocks: { resources: { title: string }[] }[] };
  expect(unlinked.blocks[0].resources.map((r) => r.title)).toEqual(["Guion nuevo"]);
  await expect(rpc(member, "remove_team_block_resource", [meeting.meetingId, id(201), linked.blocks[0].id, linked.version, id(901)]))
    .rejects.toThrow(/Version conflict/);
  const afterLinks = snapshotSchema.parse(await rpc(admin, "get_editor_snapshot", [meeting.meetingId]));
  expect(afterLinks.publishedRevisionId).toBe(publishedRevision);
  expect(afterLinks.blocks[1].resourceIds).toEqual([hiddenResource]);
  expect(afterLinks.blocks[0].resourceIds).toHaveLength(1);
});
it("asignación acotada preserva confirmaciones y responsables de otro equipo", async () => {
  const own = emptyBlock("Bloque Media");
  own.teamId = id(201);
  own.responsibles = [
    { assignmentId: null, personId: id(101), teamId: id(201), roleId: id(301) },
    { assignmentId: null, personId: id(102), teamId: id(202), roleId: null },
  ];
  let meeting = snapshotSchema.parse(await rpc(admin, "create_editor_meeting", [org, metadata, null]));
  meeting = snapshotSchema.parse(await rpc(admin, "publish_editor_snapshot", [meeting.meetingId, meeting.version, meeting.metadata, [own]]));
  const confirmed = meeting.blocks[0].responsibles[0].assignmentId!;
  const hidden = meeting.blocks[0].responsibles[1].assignmentId!;
  await rpc(admin, "confirm_assignment", [confirmed, "confirmed"]);
  await expect(rpc(member, "get_team_block_responsibles", [meeting.meetingId, id(201)])).rejects.toThrow(/Forbidden/);
  await db.query("insert into public.permission_grants(org_id,subject_user_id,team_id,permission) values($1,$2,$3,'assign'),($1,$2,$3,'read_people') on conflict do nothing", [org, member, id(201)]);
  type TeamAssignments = { version: number; people: { name: string }[]; blocks: { id: string; responsibles: { assignmentId: string; personName: string; status: string }[] }[] };
  const visible = await rpc(member, "get_team_block_responsibles", [meeting.meetingId, id(201)]) as TeamAssignments;
  expect(visible.people.map((p) => p.name)).toEqual(["Alex Ejemplo"]);
  expect(visible.blocks[0].responsibles.map((a) => a.assignmentId)).toEqual([confirmed]);
  expect(JSON.stringify(visible)).not.toContain("Sam Ficticio");
  await expect(rpc(otherAdmin, "get_team_block_responsibles", [meeting.meetingId, id(201)])).rejects.toThrow(/Forbidden/);
  await expect(actor(null, "select public.get_team_block_responsibles($1,$2)", [meeting.meetingId, id(201)])).rejects.toThrow(/permission denied/);
  const args = [meeting.meetingId, id(201), visible.blocks[0].id, visible.version];
  await expect(rpc(member, "edit_team_block_responsible", [...args, "add", id(102), null, null])).rejects.toThrow(/Invalid team person/);
  await expect(rpc(member, "edit_team_block_responsible", [...args, "add", id(101), id(301), null])).rejects.toThrow(/Duplicate responsible/);
  await expect(rpc(member, "edit_team_block_responsible", [...args, "remove", null, null, hidden])).rejects.toThrow(/Invalid assignment/);
  await expect(rpc(member, "edit_team_block_responsible", [meeting.meetingId, id(201), visible.blocks[0].id, null, "add", id(101), id(302), null])).rejects.toThrow(/Version conflict/);
  const added = await rpc(member, "edit_team_block_responsible", [...args, "add", id(101), id(302), null]) as TeamAssignments;
  expect(added.blocks[0].responsibles.map((a) => a.status).sort()).toEqual(["confirmed", "pending"]);
  const removed = await rpc(member, "edit_team_block_responsible", [meeting.meetingId, id(201), added.blocks[0].id, added.version, "remove", null, null, confirmed]) as TeamAssignments;
  expect(removed.blocks[0].responsibles).toHaveLength(1);
  const full = snapshotSchema.parse(await rpc(admin, "get_editor_snapshot", [meeting.meetingId]));
  expect(full.publishedRevisionId).toBe(meeting.publishedRevisionId);
  expect(full.blocks[0].responsibles.map((a) => a.assignmentId)).toContain(hidden);
  expect((await db.query<{ status: string }>("select status from public.assignments where id=$1", [confirmed])).rows[0].status).toBe("confirmed");
  expect((await db.query("select id from public.block_assignment_links where block_id=$1 and assignment_id=$2", [meeting.blocks[0].id, confirmed])).rows).toHaveLength(1);
  await expect(rpc(member, "edit_team_block_responsible", [...args, "add", id(101), null, null])).rejects.toThrow(/Version conflict/);
});
it("puestos duplicados reinician confirmado y conservan historial del origen", async () => {
  const pos = id(960);
  const originalAssignment = id(961);
  await db.query(
    "insert into public.meeting_required_positions(id,org_id,meeting_id,team_id,role_id,priority) values($1,$2,$3,$4,$5,$6)",
    [pos, org, current.meetingId, id(201), id(301), "critical"],
  );
  await db.query(
    "insert into public.assignments(id,org_id,meeting_id,position_id,person_id,status,responded_at) values($1,$2,$3,$4,$5,$6,now())",
    [originalAssignment, org, current.meetingId, pos, id(101), "confirmed"],
  );
  const copy = snapshotSchema.parse(
    await rpc(admin, "duplicate_editor_meeting", [
      current.meetingId,
      metadata,
      { ...defaultCopyOptions, responsibles: true },
    ]),
  );
  const values = (
    await db.query(
      "select a.status,a.responded_at,p.priority from public.assignments a join public.meeting_required_positions p on p.id=a.position_id where a.meeting_id=$1",
      [copy.meetingId],
    )
  ).rows;
  expect(values).toEqual([
    { status: "pending", responded_at: null, priority: "critical" },
  ]);
  expect(
    (
      await db.query("select status from public.assignments where id=$1", [
        originalAssignment,
      ])
    ).rows,
  ).toEqual([{ status: "confirmed" }]);
});
it("remover responsable de publicado audita sin borrar su confirmación histórica", async () => {
  const previous = canonical;
  const next = current.blocks.map((b) => ({ ...b, responsibles: [] }));
  current = snapshotSchema.parse(
    await rpc(admin, "publish_editor_snapshot", [
      current.meetingId,
      current.version,
      current.metadata,
      next,
    ]),
  );
  expect(
    (
      await db.query("select status from public.assignments where id=$1", [
        previous,
      ])
    ).rows,
  ).toEqual([{ status: "confirmed" }]);
  expect(
    (
      await db.query(
        "select event from public.assignment_events where assignment_id=$1 and event='removed_from_published_plan'",
        [previous],
      )
    ).rows,
  ).toEqual([{ event: "removed_from_published_plan" }]);
});
it("permiso de administración no permite transferir persona/confirmación por UPDATE de asignación", async () => {
  await expect(
    actor(
      admin,
      "update public.assignments set person_id=$2,status=$3 where id=$1",
      [canonical, id(102), "confirmed"],
    ),
  ).rejects.toThrow(/permission denied/);
  expect(
    (
      await db.query(
        "select person_id,status from public.assignments where id=$1",
        [canonical],
      )
    ).rows,
  ).toEqual([{ person_id: id(101), status: "confirmed" }]);
});
it("tipo versionado solo actualiza una instancia elegida explícitamente", async () => {
  const typeId = id(501);
  const meeting = snapshotSchema.parse(
    await rpc(admin, "create_editor_meeting", [org, metadata, null]),
  );
  const block = emptyBlock("Prueba de sonido", {
    id: typeId,
    name: "Prueba de sonido",
    fieldSchema: [],
  });
  const first = await save(meeting, [block]);
  const original = first.blocks[0];
  const versionBefore = await db.query<{ type_version: number }>(
    "select type_version from public.meeting_blocks where id=$1",
    [original.id],
  );
  expect(versionBefore.rows[0].type_version).toBe(1);
  const newFields = [{ key: "indicacion", label: "Indicación", type: "text" }];
  await db.query(
    "update public.block_types set version=2,field_schema_json=$2 where id=$1",
    [typeId, newFields],
  );
  const unchanged = await save(first);
  const oldRow = await db.query<{ type_version: number }>(
    "select type_version from public.meeting_blocks where id=$1",
    [unchanged.blocks[0].id],
  );
  expect(oldRow.rows[0].type_version).toBe(1);
  const refreshed = await save(unchanged, [
    { ...unchanged.blocks[0], fieldSchema: newFields as typeof block.fieldSchema },
  ]);
  const updated = await db.query<{ type_version: number }>(
    "select type_version from public.meeting_blocks where id=$1",
    [refreshed.blocks[0].id],
  );
  expect(updated.rows[0].type_version).toBe(2);
});
it("cancelar requiere plan y versión vigente; oculta agenda sin borrar historial", async () => {
  const meeting = snapshotSchema.parse(await rpc(admin, "create_editor_meeting", [org, metadata, null]));
  const published = snapshotSchema.parse(await rpc(admin, "publish_editor_snapshot", [
    meeting.meetingId, meeting.version, meeting.metadata, [emptyBlock("Actividad publicada")],
  ]));
  expect((await actor(null, "select * from public.public_agenda($1)", [meeting.meetingId])).rows).toHaveLength(1);
  await expect(rpc(member, "cancel_editor_meeting", [meeting.meetingId, published.version])).rejects.toThrow(/Forbidden/);
  await expect(rpc(admin, "cancel_editor_meeting", [meeting.meetingId, meeting.version])).rejects.toThrow(/Version conflict/);
  await rpc(admin, "cancel_editor_meeting", [meeting.meetingId, published.version]);
  expect((await actor(null, "select * from public.public_agenda($1)", [meeting.meetingId])).rows).toEqual([]);
  expect((await db.query("select count(*)::int as count from public.meeting_revisions where meeting_id=$1", [meeting.meetingId])).rows).toEqual([{ count: 2 }]);
  await expect(rpc(admin, "cancel_editor_meeting", [meeting.meetingId, published.version + 1])).rejects.toThrow(/Meeting closed/);
});

it("rechaza versiones nulas en editor, publicación, cancelación y plantilla", async () => {
  const meeting = snapshotSchema.parse(await rpc(admin, "create_editor_meeting", [org, metadata, null]));
  await expect(rpc(admin, "save_editor_snapshot", [meeting.meetingId, null, metadata, []])).rejects.toThrow(/Version conflict/);
  await expect(rpc(admin, "publish_revision", [meeting.meetingId, meeting.revisionId, null])).rejects.toThrow(/Version conflict/);
  await expect(rpc(admin, "cancel_editor_meeting", [meeting.meetingId, null])).rejects.toThrow(/Version conflict/);
});

it("ninguna RPC de equipo permite editar un bloque sin equipo", async () => {
  const block = emptyBlock("Bloque general protegido");
  block.resourceIds = [id(901)];
  const meeting = snapshotSchema.parse(await rpc(admin, "create_editor_meeting", [org, metadata, null]));
  const saved = snapshotSchema.parse(await rpc(admin, "save_editor_snapshot", [meeting.meetingId, meeting.version, metadata, [block]]));
  await db.query("insert into public.permission_grants(org_id,subject_user_id,team_id,permission) values($1,$2,$3,'plan'),($1,$2,$3,'read_content'),($1,$2,$3,'assign'),($1,$2,$3,'read_people') on conflict do nothing", [org, member, id(201)]);
  const args = [saved.meetingId, id(201), saved.blocks[0].id, saved.version];
  await expect(rpc(member, "save_team_block_notes", [...args, "No permitido"])).rejects.toThrow(/Forbidden/);
  await expect(rpc(member, "save_team_block_fields", [...args, {}])).rejects.toThrow(/Forbidden/);
  await expect(rpc(member, "add_team_block_url", [...args, "Link", "https://example.invalid"])).rejects.toThrow(/Forbidden/);
  await expect(rpc(member, "remove_team_block_resource", [...args, id(901)])).rejects.toThrow(/Forbidden/);
  await expect(rpc(member, "edit_team_block_responsible", [...args, "add", id(101), null, null])).rejects.toThrow(/Forbidden/);
  expect(snapshotSchema.parse(await rpc(admin, "get_editor_snapshot", [saved.meetingId])).version).toBe(saved.version);
});

it("Data API no puede modificar ni eliminar un recurso ligado a revisión", async () => {
  const resource = id(990);
  const path = `${org}/${id(991)}.png`;
  await db.query("insert into public.resources(id,org_id,title,storage_path,resource_type) values($1,$2,'Archivo ficticio',$3,'image')", [resource, org, path]);
  const block = emptyBlock("Archivo publicado");
  block.resourceIds = [resource];
  const meeting = snapshotSchema.parse(await rpc(admin, "create_editor_meeting", [org, metadata, null]));
  await rpc(admin, "publish_editor_snapshot", [meeting.meetingId, meeting.version, metadata, [block]]);
  await expect(actor(admin, "update public.resources set storage_path=$2 where id=$1", [resource, `${org}/${id(992)}.png`])).rejects.toThrow(/permission denied/);
  await expect(actor(admin, "delete from public.resources where id=$1", [resource])).rejects.toThrow(/permission denied/);
  await expect(rpc(admin, "update_unlinked_url_resource", [resource, "Nuevo", "https://example.invalid", "link"])).rejects.toThrow(/Resource in use/);
  expect((await db.query<{storage_path:string}>("select storage_path from public.resources where id=$1", [resource])).rows[0].storage_path).toBe(path);
});

it("duplicar sin responsables quita también persona de paralela", async () => {
  const block = emptyBlock("Paralela sin copiar persona");
  block.subactivities = [{clientKey: crypto.randomUUID(), title: "Paralela", teamId: id(201), personId: id(101), offsetSeconds: 0, durationSeconds: 60, notes: "", fieldSchema: [], customFields: {}}];
  const meeting = snapshotSchema.parse(await rpc(admin, "create_editor_meeting", [org, metadata, null]));
  const saved = snapshotSchema.parse(await rpc(admin, "save_editor_snapshot", [meeting.meetingId, meeting.version, metadata, [block]]));
  const copy = snapshotSchema.parse(await rpc(admin, "duplicate_editor_meeting", [saved.meetingId, metadata, {...defaultCopyOptions, responsibles: false}]));
  expect(copy.blocks[0].subactivities[0].personId).toBeNull();
  expect(copy.blocks[0].subactivities[0].teamId).toBe(id(201));
  expect(saved.blocks[0].subactivities[0].personId).toBe(id(101));
});
it("un enlace sin uso se actualiza y elimina solo mediante RPC estrecha", async () => {
  const resource = id(993);
  await db.query("insert into public.resources(id,org_id,title,url,resource_type) values($1,$2,'Antes','https://example.invalid','link')", [resource, org]);
  await expect(actor(admin, "update public.resources set title='Mutado' where id=$1", [resource])).rejects.toThrow(/permission denied/);
  await rpc(admin, "update_unlinked_url_resource", [resource, "Después", "https://example.invalid/nuevo", "link"]);
  expect((await db.query<{title:string}>("select title from public.resources where id=$1", [resource])).rows[0].title).toBe("Después");
  await expect(rpc(admin, "update_unlinked_url_resource", [resource, "Malo", "https://user@example.invalid", "link"])).rejects.toThrow(/Invalid resource/);
  await rpc(admin, "delete_unlinked_url_resource", [resource]);
  expect((await db.query("select id from public.resources where id=$1", [resource])).rows).toHaveLength(0);
});

it("confirmaciones masivas son por persona, con scope de equipo, atomicidad e historial", async () => {
  const leader = id(977);
  await db.query("insert into auth.users(id,email) values($1,'leader-confirm@example.invalid')", [leader]);
  await db.query("update public.profiles set approved_at=now() where user_id=$1", [leader]);
  await db.query("insert into public.memberships(org_id,user_id,status) values($1,$2,'approved')", [org,leader]);
  await db.query("insert into public.permission_grants(org_id,subject_user_id,team_id,permission) values($1,$2,$3,'confirm'),($1,$2,$3,'read_people')", [org,leader,id(201)]);
  const own = emptyBlock("Bloque confirmación A"); own.teamId=id(201);
  own.notes="Nota que no debe filtrarse";
  own.responsibles=[{assignmentId:null,personId:id(101),teamId:id(201),roleId:id(301)}];
  const second=emptyBlock("Bloque confirmación B"); second.teamId=id(202);
  second.responsibles=[{assignmentId:null,personId:id(101),teamId:id(202),roleId:null}];
  let meeting=snapshotSchema.parse(await rpc(admin,"create_editor_meeting",[org,metadata,null]));
  meeting=snapshotSchema.parse(await rpc(admin,"publish_editor_snapshot",[meeting.meetingId,meeting.version,metadata,[own,second]]));
  type Response={assignments:{id:string;personId:string;status:string;respondedAt:string|null;history:unknown[]}[]};
  const initial=await rpc(member,"get_meeting_confirmations",[meeting.meetingId]) as Response;
  expect(initial.assignments).toHaveLength(2);
  expect(JSON.stringify(initial)).not.toContain(own.notes);
  const expected=initial.assignments.map(({id,status,respondedAt})=>({id,status,respondedAt}));
  const scoped=await rpc(leader,"get_meeting_confirmations",[meeting.meetingId]) as Response;
  expect(scoped.assignments).toHaveLength(1);
  await expect(rpc(leader,"respond_assignments",[meeting.meetingId,id(101),"confirmed",expected])).rejects.toThrow(/Forbidden/);
  await expect(rpc(otherAdmin,"respond_assignments",[meeting.meetingId,id(101),"confirmed",expected])).rejects.toThrow(/Forbidden/);
  expect((await rpc(member,"get_meeting_confirmations",[meeting.meetingId]) as Response).assignments.every(a=>a.status==='pending')).toBe(true);
  expect(await rpc(member,"respond_assignments",[meeting.meetingId,id(101),"confirmed",expected])).toBe(2);
  await expect(rpc(member,"respond_assignments",[meeting.meetingId,id(101),"unavailable",expected])).rejects.toThrow(/Confirmation conflict/);
  const confirmed=await rpc(member,"get_meeting_confirmations",[meeting.meetingId]) as Response;
  const current=confirmed.assignments.map(({id,status,respondedAt})=>({id,status,respondedAt}));
  expect(await rpc(member,"respond_assignments",[meeting.meetingId,id(101),"confirmed",current])).toBe(0);
  expect(await rpc(member,"respond_assignments",[meeting.meetingId,id(101),"unavailable",current])).toBe(2);
  const rejected=await rpc(member,"get_meeting_confirmations",[meeting.meetingId]) as Response;
  expect(rejected.assignments.every(a=>a.status==='unavailable' && a.history.length===3)).toBe(true);
  await expect(actor(null,"select public.get_meeting_confirmations($1) result",[meeting.meetingId])).rejects.toThrow(/permission denied/);
  await expect(rpc(member,"respond_assignments",[meeting.meetingId,id(102),"confirmed",current])).rejects.toThrow(/Forbidden/);
  await expect(rpc(admin,"respond_assignments",[meeting.meetingId,id(101),null,current])).rejects.toThrow(/Invalid confirmations/);
});

it("confirmar no filtra borradores ni acepta asignaciones retiradas del plan publicado", async () => {
  const block=emptyBlock("Confirmación publicada");
  block.teamId=id(201);
  block.responsibles=[{assignmentId:null,personId:id(101),teamId:id(201),roleId:id(301)}];
  let meeting=snapshotSchema.parse(await rpc(admin,"create_editor_meeting",[org,metadata,null]));
  meeting=snapshotSchema.parse(await rpc(admin,"save_editor_snapshot",[meeting.meetingId,meeting.version,metadata,[block]]));
  const assignmentId=meeting.blocks[0].responsibles[0].assignmentId!;
  await expect(rpc(member,"get_meeting_confirmations",[meeting.meetingId])).rejects.toThrow(/Forbidden/);
  await expect(rpc(member,"confirm_assignment",[assignmentId,"confirmed"])).rejects.toThrow(/Forbidden/);
  expect(await rpc(admin,"get_meeting_confirmations",[meeting.meetingId])).toHaveProperty("assignments");
  meeting=snapshotSchema.parse(await rpc(admin,"publish_editor_snapshot",[meeting.meetingId,meeting.version,metadata,meeting.blocks]));
  const without=meeting.blocks.map(b=>({...b,responsibles:[]}));
  const draft=await save(meeting,without);
  // Published remains operational while editing a draft that removes the person.
  await rpc(member,"confirm_assignment",[assignmentId,"confirmed"]);
  await rpc(admin,"publish_editor_snapshot",[draft.meetingId,draft.version,metadata,draft.blocks]);
  await expect(rpc(member,"confirm_assignment",[assignmentId,"unavailable"])).rejects.toThrow(/Forbidden/);
  expect((await db.query<{status:string}>("select status from public.assignments where id=$1",[assignmentId])).rows[0].status).toBe("confirmed");
});

it("validación de lotes rechaza duplicados, valores ausentes y reuniones canceladas", async () => {
  const block=emptyBlock("Lote de validación"); block.responsibles=[{assignmentId:null,personId:id(101),teamId:id(201),roleId:null}];
  let meeting=snapshotSchema.parse(await rpc(admin,"create_editor_meeting",[org,metadata,null]));
  meeting=snapshotSchema.parse(await rpc(admin,"publish_editor_snapshot",[meeting.meetingId,meeting.version,metadata,[block]]));
  const expected={id:meeting.blocks[0].responsibles[0].assignmentId,status:"pending",respondedAt:null};
  for(const invalid of [null,[],[expected,expected],[{id:expected.id,status:"pending"}]]) {
    await expect(rpc(member,"respond_assignments",[meeting.meetingId,id(101),"confirmed",invalid])).rejects.toThrow(/Invalid confirmations/);
  }
  await rpc(admin,"cancel_editor_meeting",[meeting.meetingId,meeting.version]);
  await expect(rpc(member,"respond_assignments",[meeting.meetingId,id(101),"confirmed",[expected]])).rejects.toThrow(/Meeting closed/);
});

it("calendario interno proyecta cobertura agregada, excluye opcionales y conserva publicación", async()=>{
  const meta={...metadata,title:"Calendario publicado",date:"2029-02-04"};
  let meeting=snapshotSchema.parse(await rpc(admin,"create_editor_meeting",[org,meta,null]));
  const block=emptyBlock("Actividad calendario");block.notes="Nota secreta calendario";
  meeting=snapshotSchema.parse(await rpc(admin,"publish_editor_snapshot",[meeting.meetingId,meeting.version,meta,[block]]));
  for(let n=0;n<11;n++) {
    const position=crypto.randomUUID();
    await db.query("insert into public.meeting_required_positions(id,org_id,meeting_id,team_id,role_id,priority,quantity_index) values($1,$2,$3,$4,$5,$6,$7)",[position,org,meeting.meetingId,id(201),id(301),n===0?"critical":n===10?"optional":"required",n+1]);
    await db.query("insert into public.assignments(org_id,meeting_id,position_id,person_id,status,responded_at) values($1,$2,$3,$4,$5,now())",[org,meeting.meetingId,position,id(101),n===0?"unavailable":"confirmed"]);
  }
  type Calendar={meetings:{id:string;title:string;date:string;total:number;confirmed:number;unavailable:number;criticalMissing:boolean}[];upcoming:unknown[]};
  const args=[org,"2029-02-01","2029-03-01"];
  const visible=await rpc(member,"calendar_overview",args) as Calendar;
  expect(visible.meetings).toHaveLength(1);
  expect(visible.meetings[0]).toMatchObject({total:10,confirmed:9,unavailable:1,criticalMissing:true});
  expect(JSON.stringify(visible)).not.toMatch(/Nota secreta|personId|person_id|assignmentId/);
  expect(visible.upcoming.length).toBeLessThanOrEqual(3);
  const draft=snapshotSchema.parse(await rpc(admin,"create_editor_meeting",[org,{...meta,title:"Borrador oculto",date:"2029-02-05"},null]));
  expect((await rpc(admin,"calendar_overview",args) as Calendar).meetings).toHaveLength(2);
  expect((await rpc(member,"calendar_overview",args) as Calendar).meetings).toHaveLength(1);
  meeting=await save(meeting,meeting.blocks,{...meta,title:"Título nuevo oculto",date:"2029-03-06"});
  expect((await rpc(member,"calendar_overview",args) as Calendar).meetings[0]).toMatchObject({title:meta.title,date:meta.date});
  expect((await rpc(admin,"calendar_overview",args) as Calendar).meetings.find(row=>row.id===meeting.meetingId)).toMatchObject({title:meta.title,date:meta.date});
  await expect(rpc(otherAdmin,"calendar_overview",args)).rejects.toThrow(/Forbidden/);
  await expect(rpc(pending,"calendar_overview",args)).rejects.toThrow(/Forbidden/);
  await expect(actor(null,"select public.calendar_overview($1,$2,$3) result",args)).rejects.toThrow(/permission denied/);
  await expect(rpc(admin,"calendar_overview",[org,null,"2029-03-01"])).rejects.toThrow(/Invalid calendar range/);
  await rpc(admin,"cancel_editor_meeting",[draft.meetingId,draft.version]);
  expect((await rpc(admin,"calendar_overview",args) as Calendar).meetings).toHaveLength(1);
});

it("puestos: permisos, cantidades, concurrencia y reemplazo sin transferir respuesta", async () => {
  const s = snapshotSchema.parse(
    await rpc(admin, "create_editor_meeting", [org, metadata, null]),
  );
  await expect(
    rpc(member, "configure_meeting_position", [
      s.meetingId,
      s.version,
      id(201),
      id(301),
      "critical",
      2,
    ]),
  ).rejects.toThrow(/Forbidden/);
  await expect(
    rpc(admin, "configure_meeting_position", [
      s.meetingId,
      null,
      id(201),
      id(301),
      "critical",
      2,
    ]),
  ).rejects.toThrow(/conflict/);
  await expect(
    rpc(admin, "configure_meeting_position", [
      s.meetingId,
      s.version,
      id(201),
      id(301),
      "critical",
      0,
    ]),
  ).rejects.toThrow(/quantity/);
  await rpc(admin, "configure_meeting_position", [
    s.meetingId,
    s.version,
    id(201),
    id(301),
    "critical",
    2,
  ]);
  const view = (await rpc(admin, "get_meeting_staffing", [s.meetingId])) as {
    version: number;
    teams: { positions: { id: string }[] }[];
  };
  const positions = view.teams.flatMap((t) => t.positions);
  expect(positions).toHaveLength(2);
  const position = positions[0].id;
  const first = (await rpc(admin, "staff_meeting_position", [
    position,
    view.version,
    id(101),
    null,
    null,
    null,
  ])) as string;
  await expect(
    rpc(admin, "staff_meeting_position", [
      position,
      view.version,
      id(102),
      null,
      null,
      null,
    ]),
  ).rejects.toThrow(/conflict/);
  await db.exec(
    `update public.assignments set status='unavailable',responded_at='2026-10-16T10:00:00Z' where id='${first}'`,
  );
  // Use another fictitious team member, never real data.
  await db.exec(
    `insert into public.team_memberships(org_id,team_id,person_id) values('${org}','${id(201)}','${id(102)}') on conflict do nothing`,
  );
  const second = (await rpc(admin, "staff_meeting_position", [
    position,
    view.version + 1,
    id(102),
    first,
    "unavailable",
    "2026-10-16T10:00:00Z",
  ])) as string;
  const rows = await db.query<{
    id: string;
    status: string;
    replaced_by_id: string | null;
    responded_at: string | null;
  }>(
    "select id,status,replaced_by_id,responded_at from public.assignments where position_id=$1",
    [position],
  );
  expect(rows.rows.find((r) => r.id === first)).toMatchObject({
    status: "unavailable",
    replaced_by_id: second,
  });
  expect(rows.rows.find((r) => r.id === second)).toMatchObject({
    status: "pending",
    responded_at: null,
    replaced_by_id: null,
  });
  await expect(
    rpc(pending, "get_meeting_staffing", [s.meetingId]),
  ).rejects.toThrow(/Forbidden/);
  await expect(
    actor(null, "select public.get_meeting_staffing($1) result", [s.meetingId]),
  ).rejects.toThrow(/permission/);
  await expect(
    actor(
      admin,
      `insert into public.meeting_required_positions(org_id,meeting_id,team_id,role_id,priority,quantity_index) values($1,$2,$3,$4,'required',99) returning id result`,
      [org, s.meetingId, id(201), id(301)],
    ),
  ).rejects.toThrow(/permission/);
  await expect(
    db.exec(
      `begin;update public.assignments set replaced_by_id='${first}' where id='${second}';commit`,
    ),
  ).rejects.toThrow(/cycle/);
  await db.exec("rollback");
});

it("plantillas copian requisitos solo a nuevas reuniones y matriz no expone personas", async () => {
  const s = snapshotSchema.parse(
    await rpc(admin, "create_editor_meeting", [org, metadata, null]),
  );
  await rpc(admin, "configure_meeting_position", [
    s.meetingId,
    s.version,
    id(201),
    id(301),
    "required",
    2,
  ]);
  const positions = await rpc(admin, "template_position_definition", [
    s.meetingId,
    s.version + 1,
  ]);
  const template = id(9901);
  await db.query(
    "insert into public.meeting_templates(id,org_id,name,definition_json) values($1,$2,$3,$4)",
    [
      template,
      org,
      "Puestos ficticios",
      { blocks: [], requiredPositions: positions },
    ],
  );
  const first = snapshotSchema.parse(
    await rpc(admin, "create_editor_meeting", [org, metadata, template]),
  );
  await db.query(
    `update public.meeting_templates set definition_json='{"blocks":[],"requiredPositions":[]}' where id=$1`,
    [template],
  );
  const second = snapshotSchema.parse(
    await rpc(admin, "create_editor_meeting", [org, metadata, template]),
  );
  const count = await db.query<{ meeting_id: string; n: number }>(
    "select meeting_id,count(*)::int n from public.meeting_required_positions where meeting_id in ($1,$2) group by meeting_id",
    [first.meetingId, second.meetingId],
  );
  expect(count.rows).toEqual([{ meeting_id: first.meetingId, n: 2 }]);
  const matrix = (await rpc(admin, "coverage_matrix", [
    org,
    "2026-10-01",
    "2026-11-01",
  ])) as Record<string, unknown>[];
  expect(matrix.filter((r) => r.meetingId === first.meetingId)).toHaveLength(2);
  expect(JSON.stringify(matrix)).not.toMatch(
    /personId|personName|notes|respondedAt/,
  );
  await expect(
    rpc(pending, "coverage_matrix", [org, "2026-10-01", "2026-11-01"]),
  ).rejects.toThrow(/Forbidden/);
  await expect(
    rpc(admin, "coverage_matrix", [org, "2026-01-01", "2026-11-01"]),
  ).rejects.toThrow(/range/);
});

it("solapamientos principales/paralelos: límites, excepción y caducidad al reprogramar", async () => {
  let s = snapshotSchema.parse(
    await rpc(admin, "create_editor_meeting", [
      org,
      { ...metadata, date: "2029-01-18" },
      null,
    ]),
  );
  const b = emptyBlock("Actividad ficticia");
  b.durationSeconds = 600;
  b.responsibles = [
    { personId: id(101), teamId: id(201), roleId: id(301), assignmentId: null },
  ];
  b.subactivities = [
    {
      clientKey: crypto.randomUUID(),
      title: "Paralela ficticia",
      teamId: id(201),
      personId: id(101),
      offsetSeconds: 300,
      durationSeconds: 300,
      notes: "No filtrar",
      fieldSchema: [],
      customFields: {},
    },
  ];
  s = await save(s, [b]);
  type Conflict = {
    fingerprint: string;
    justification: string | null;
    personName: string;
  };
  let conflicts = (await rpc(admin, "get_staffing_conflicts", [
    s.meetingId,
  ])) as Conflict[];
  expect(conflicts).toHaveLength(1);
  expect(JSON.stringify(conflicts)).not.toContain("No filtrar");
  const fingerprint = conflicts[0].fingerprint;
  await expect(
    rpc(pending, "get_staffing_conflicts", [s.meetingId]),
  ).rejects.toThrow(/Forbidden/);
  await expect(
    rpc(admin, "justify_staffing_conflict", [
      s.meetingId,
      fingerprint,
      "corto",
    ]),
  ).rejects.toThrow(/justification/);
  await rpc(admin, "justify_staffing_conflict", [
    s.meetingId,
    fingerprint,
    "Excepción ficticia autorizada",
  ]);
  conflicts = (await rpc(admin, "get_staffing_conflicts", [
    s.meetingId,
  ])) as Conflict[];
  expect(conflicts[0].justification).toBe("Excepción ficticia autorizada");
  s = await save(s, s.blocks, { ...s.metadata, startLocalTime: "11:00" });
  conflicts = (await rpc(admin, "get_staffing_conflicts", [
    s.meetingId,
  ])) as Conflict[];
  expect(conflicts[0].fingerprint).not.toBe(fingerprint);
  expect(conflicts[0].justification).toBeNull();
  await expect(
    rpc(admin, "justify_staffing_conflict", [
      s.meetingId,
      fingerprint,
      "Excepción ficticia autorizada",
    ]),
  ).rejects.toThrow(/changed/);
  // Sequential main blocks sharing a person touch at the boundary, not overlap.
  const sequential = emptyBlock("Secuencial ficticia");
  sequential.durationSeconds = 600;
  sequential.responsibles = b.responsibles;
  s = await save(s, [{ ...s.blocks[0], subactivities: [] }, sequential]);
  expect(await rpc(admin, "get_staffing_conflicts", [s.meetingId])).toEqual([]);
});

it("reemplazo de actividad mantiene al publicado hasta publicar y conserva su respuesta", async () => {
  let s = snapshotSchema.parse(
    await rpc(admin, "create_editor_meeting", [
      org,
      { ...metadata, date: "2029-02-18" },
      null,
    ]),
  );
  const b = emptyBlock("Responsable ficticio");
  b.durationSeconds = 600;
  b.responsibles = [
    { personId: id(101), teamId: id(201), roleId: id(301), assignmentId: null },
  ];
  s = snapshotSchema.parse(
    await rpc(admin, "publish_editor_snapshot", [
      s.meetingId,
      s.version,
      s.metadata,
      [b],
    ]),
  );
  const old = s.blocks[0].responsibles[0].assignmentId!;
  await rpc(admin, "confirm_assignment", [old, "confirmed"]);
  await rpc(admin, "replace_block_person", [
    s.meetingId,
    s.version,
    old,
    id(102),
  ]);
  let state = await db.query<{ status: string; replaced_by_id: string | null }>(
    "select status,replaced_by_id from public.assignments where id=$1",
    [old],
  );
  expect(state.rows[0]).toEqual({ status: "confirmed", replaced_by_id: null });
  s = snapshotSchema.parse(
    await rpc(admin, "get_editor_snapshot", [s.meetingId]),
  );
  const replacement = s.blocks[0].responsibles[0].assignmentId!;
  expect(replacement).not.toBe(old);
  expect(
    await db.query(
      "select id from public.assignments where id=$1 and status='pending'",
      [replacement],
    ),
  ).toHaveProperty("rows.length", 1);
  await expect(
    rpc(admin, "replace_block_person", [
      s.meetingId,
      s.version - 1,
      replacement,
      id(101),
    ]),
  ).rejects.toThrow(/conflict/);
  s = snapshotSchema.parse(
    await rpc(admin, "publish_editor_snapshot", [
      s.meetingId,
      s.version,
      s.metadata,
      s.blocks,
    ]),
  );
  state = await db.query(
    "select status,replaced_by_id from public.assignments where id=$1",
    [old],
  );
  expect(state.rows[0]).toEqual({
    status: "confirmed",
    replaced_by_id: replacement,
  });
  await expect(
    rpc(admin, "confirm_assignment", [old, "pending"]),
  ).rejects.toThrow();
});

it("puestos: ajustes conservan historial y permisos de otro equipo no alcanzan", async () => {
  const leader = id(9950);
  await db.exec(
    `insert into auth.users(id,email) values('${leader}','leader-staff@example.invalid');update public.profiles set approved_at=now() where user_id='${leader}';insert into public.memberships(org_id,user_id,status) values('${org}','${leader}','approved');insert into public.permission_grants(org_id,subject_user_id,team_id,permission) values('${org}','${leader}','${id(202)}','assign'),('${org}','${leader}','${id(202)}','read_people');`,
  );
  const s = snapshotSchema.parse(
    await rpc(admin, "create_editor_meeting", [
      org,
      { ...metadata, date: "2029-04-18" },
      null,
    ]),
  );
  await rpc(admin, "configure_meeting_position", [
    s.meetingId,
    s.version,
    id(201),
    id(301),
    "critical",
    2,
  ]);
  const view = (await rpc(admin, "get_meeting_staffing", [s.meetingId])) as {
    version: number;
    teams: { positions: { id: string }[] }[];
  };
  const [a, b] = view.teams.flatMap((t) => t.positions);
  await expect(
    rpc(leader, "staff_meeting_position", [
      a.id,
      view.version,
      id(101),
      null,
      null,
      null,
    ]),
  ).rejects.toThrow(/Forbidden/);
  await rpc(admin, "adjust_meeting_position", [
    b.id,
    view.version,
    "optional",
    false,
  ]);
  await rpc(admin, "adjust_meeting_position", [
    b.id,
    view.version + 1,
    "optional",
    true,
  ]);
  await rpc(admin, "staff_meeting_position", [
    a.id,
    view.version + 2,
    id(101),
    null,
    null,
    null,
  ]);
  await expect(
    rpc(admin, "adjust_meeting_position", [
      a.id,
      view.version + 3,
      "optional",
      true,
    ]),
  ).rejects.toThrow(/history/);
  const rows = await db.query(
    "select id from public.meeting_required_positions where meeting_id=$1",
    [s.meetingId],
  );
  expect(rows.rows).toHaveLength(1);
});

it("conflictos de otro equipo avisan sin revelar contenido ni autorizar excepción", async () => {
  const leader = id(9951);
  await db.exec(
    `insert into auth.users(id,email) values('${leader}','leader-conflict@example.invalid');update public.profiles set approved_at=now() where user_id='${leader}';insert into public.memberships(org_id,user_id,status) values('${org}','${leader}','approved');insert into public.permission_grants(org_id,subject_user_id,team_id,permission) values('${org}','${leader}','${id(201)}','assign'),('${org}','${leader}','${id(201)}','read_people');`,
  );
  let s = snapshotSchema.parse(
    await rpc(admin, "create_editor_meeting", [
      org,
      { ...metadata, date: "2029-05-18" },
      null,
    ]),
  );
  const b = emptyBlock("Bloque ficticio");
  b.durationSeconds = 600;
  b.responsibles = [
    { assignmentId: null, personId: id(101), teamId: id(201), roleId: id(301) },
  ];
  b.subactivities = [
    {
      clientKey: crypto.randomUUID(),
      title: "Título privado otro equipo",
      teamId: id(202),
      personId: id(101),
      offsetSeconds: 0,
      durationSeconds: 600,
      notes: "Nota secreta",
      fieldSchema: [],
      customFields: {},
    },
  ];
  s = await save(s, [b]);
  const result = (await rpc(leader, "get_staffing_conflicts", [
    s.meetingId,
  ])) as { fingerprint: string; canExcept: boolean; description: string }[];
  expect(result).toHaveLength(1);
  expect(result[0].canExcept).toBe(false);
  expect(result[0].description).toContain("no visible");
  expect(JSON.stringify(result)).not.toMatch(/Título privado|Nota secreta/);
  await expect(
    rpc(leader, "justify_staffing_conflict", [
      s.meetingId,
      result[0].fingerprint,
      "Justificación fuera de alcance",
    ]),
  ).rejects.toThrow(/Forbidden/);
});

it('varias propuestas antes de publicar enlazan al reemplazo final sin heredar confirmación',async()=>{
 let s=snapshotSchema.parse(await rpc(admin,'create_editor_meeting',[org,{...metadata,date:'2029-06-18'},null]));
 const b=emptyBlock('Responsable ficticio');b.durationSeconds=600;b.responsibles=[{personId:id(101),teamId:id(201),roleId:id(301),assignmentId:null}];
 s=snapshotSchema.parse(await rpc(admin,'publish_editor_snapshot',[s.meetingId,s.version,s.metadata,[b]]));const first=s.blocks[0].responsibles[0].assignmentId!;
 await rpc(admin,'confirm_assignment',[first,'confirmed']);
 await rpc(admin,'replace_block_person',[s.meetingId,s.version,first,id(102)]);
 s=snapshotSchema.parse(await rpc(admin,'get_editor_snapshot',[s.meetingId]));const middle=s.blocks[0].responsibles[0].assignmentId!;
 await rpc(admin,'replace_block_person',[s.meetingId,s.version,middle,id(101)]);
 s=snapshotSchema.parse(await rpc(admin,'get_editor_snapshot',[s.meetingId]));const final=s.blocks[0].responsibles[0].assignmentId!;
 expect(final).not.toBe(first);
 s=snapshotSchema.parse(await rpc(admin,'publish_editor_snapshot',[s.meetingId,s.version,s.metadata,s.blocks]));
 const old=await db.query<{replaced_by_id:string;status:string}>('select replaced_by_id,status from public.assignments where id in($1,$2) order by status',[first,middle]);
 expect(old.rows.every(a=>a.replaced_by_id===final)).toBe(true);expect(old.rows.map(a=>a.status).sort()).toEqual(['confirmed','pending']);
 const current=await db.query<{status:string}>('select status from public.assignments where id=$1',[final]);expect(current.rows[0].status).toBe('pending');
});

it('solapamientos entre reuniones publicadas excluyen rechazos y otros borradores para responsables',async()=>{
 const meta={...metadata,date:'2029-07-18'};
 const b=emptyBlock('Actividad ficticia');b.durationSeconds=600;b.responsibles=[{personId:id(101),teamId:id(201),roleId:id(301),assignmentId:null}];
 let a=snapshotSchema.parse(await rpc(admin,'create_editor_meeting',[org,meta,null]));a=snapshotSchema.parse(await rpc(admin,'publish_editor_snapshot',[a.meetingId,a.version,meta,[b]]));
 let c=snapshotSchema.parse(await rpc(admin,'create_editor_meeting',[org,{...meta,startLocalTime:'10:05'},null]));c=snapshotSchema.parse(await rpc(admin,'publish_editor_snapshot',[c.meetingId,c.version,c.metadata,[b]]));
 expect(await rpc(admin,'get_staffing_conflicts',[a.meetingId])).toHaveLength(1);
 await rpc(admin,'confirm_assignment',[c.blocks[0].responsibles[0].assignmentId!,'unavailable']);
 expect(await rpc(admin,'get_staffing_conflicts',[a.meetingId])).toEqual([]);
 const leader=id(9951);
 let draft=snapshotSchema.parse(await rpc(admin,'create_editor_meeting',[org,meta,null]));draft=await save(draft,[b]);
 expect(await rpc(admin,'get_staffing_conflicts',[a.meetingId])).toHaveLength(1);
 expect(await rpc(leader,'get_staffing_conflicts',[a.meetingId])).toEqual([]);
});

it('un snapshot histórico no revive asignaciones reemplazadas ni sus confirmaciones',async()=>{
 let s=snapshotSchema.parse(await rpc(admin,'create_editor_meeting',[org,{...metadata,date:'2029-08-18'},null]));
 const b=emptyBlock('Responsable ficticio');b.durationSeconds=600;b.responsibles=[{personId:id(101),teamId:id(201),roleId:id(301),assignmentId:null}];
 s=snapshotSchema.parse(await rpc(admin,'publish_editor_snapshot',[s.meetingId,s.version,s.metadata,[b]]));
 const historic=s;const first=s.blocks[0].responsibles[0].assignmentId!;
 await rpc(admin,'confirm_assignment',[first,'confirmed']);
 await rpc(admin,'replace_block_person',[s.meetingId,s.version,first,id(102)]);
 s=snapshotSchema.parse(await rpc(admin,'get_editor_snapshot',[s.meetingId]));
 s=snapshotSchema.parse(await rpc(admin,'publish_editor_snapshot',[s.meetingId,s.version,s.metadata,s.blocks]));
 await expect(save(s,historic.blocks)).rejects.toThrow(/replaced canonical/);
 const latest=snapshotSchema.parse(await rpc(admin,'get_editor_snapshot',[s.meetingId]));expect(latest.version).toBe(s.version);expect(latest.blocks[0].responsibles[0].personId).toBe(id(102));
});

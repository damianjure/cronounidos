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

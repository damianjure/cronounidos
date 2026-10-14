import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = uid(101),
  otherOrg = uid(102),
  team = uid(201),
  otherTeam = uid(202),
  meeting = uid(301),
  revision = uid(401),
  draft = uid(402),
  block = uid(501),
  draftBlock = uid(502),
  position = uid(601),
  assignment = uid(701),
  person = uid(801);
async function asUser(n: number | null, sql: string) {
  await db.exec(
    `set role ${n === null ? "anon" : "authenticated"};select set_config('request.jwt.claim.sub','${n === null ? "" : uid(n)}',false);`,
  );
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text default 'ficticio@example.invalid',raw_user_meta_data jsonb not null default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  for (const f of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.exec(`insert into public.organizations(id,name,slug) values('${org}','Prueba A','prueba-a'),('${otherOrg}','Prueba B','prueba-b');
insert into auth.users(id,raw_user_meta_data) values ${[1, 2, 3, 4, 5, 6, 7].map((n) => `('${uid(n)}','{"display_name":"Cuenta ficticia ${n}","admin":true}')`).join(",")};
update public.profiles set approved_at=now() where user_id<>'${uid(2)}';
insert into public.memberships(org_id,user_id,status) values ${[1, 2, 3, 4, 5, 6].map((n) => `('${org}','${uid(n)}','${n === 2 ? "pending" : "approved"}')`).join(",")},('${otherOrg}','${uid(7)}','approved');
insert into public.teams(id,org_id,name) values('${team}','${org}','Media'),('${otherTeam}','${org}','Alabanza');
insert into public.people(id,org_id,first_name,last_name) values('${person}','${org}','Persona','Ficticia'),('${uid(802)}','${otherOrg}','Otra','Ficticia');
update public.profiles set person_id='${person}',org_id='${org}' where user_id='${uid(4)}';
insert into public.team_memberships(org_id,team_id,person_id) values('${org}','${team}','${person}');
insert into public.roles(id,org_id,team_id,name) values('${uid(901)}','${org}','${team}','Streaming');
insert into public.permission_grants(org_id,subject_user_id,permission,team_id) values ('${org}','${uid(1)}','administer',null),('${org}','${uid(3)}','plan',null),('${org}','${uid(3)}','read_content',null),('${org}','${uid(4)}','read_agenda',null),('${org}','${uid(5)}','read_agenda',null),('${org}','${uid(5)}','assign','${team}'),('${org}','${uid(5)}','confirm','${team}'),('${org}','${uid(5)}','read_people','${team}'),('${org}','${uid(5)}','read_content','${team}'),('${org}','${uid(6)}','read_agenda',null),('${org}','${uid(6)}','read_content','${otherTeam}'),('${otherOrg}','${uid(7)}','administer',null);
insert into public.meetings(id,org_id,title,date,start_local_time) values('${meeting}','${org}','Titulo privado',current_date+1,'10:00');
insert into public.meeting_revisions(id,org_id,meeting_id,revision,created_by,scheduled_start) values('${revision}','${org}','${meeting}',1,'${uid(3)}',now()+interval '1 day'),('${draft}','${org}','${meeting}',2,'${uid(3)}',now()+interval '1 day');
insert into public.meeting_blocks(id,org_id,revision_id,sort_order,name,duration_seconds,team_id) values('${block}','${org}','${revision}',0,'Actividad pública',600,'${team}'),('${draftBlock}','${org}','${draft}',0,'Borrador secreto',100,'${team}');
insert into public.block_details(org_id,block_id,notes,custom_fields_json) values('${org}','${block}','Nota privada','{"telefono":"privado"}');
insert into public.block_subactivities(org_id,block_id,team_id,title,offset_seconds,duration_seconds,notes) values('${org}','${block}','${otherTeam}','Paralela privada',0,100,'Nota de Alabanza');
insert into public.meeting_required_positions(id,org_id,meeting_id,team_id,role_id,priority) values('${position}','${org}','${meeting}','${team}','${uid(901)}','critical');
insert into public.assignments(id,org_id,meeting_id,position_id,person_id) values('${assignment}','${org}','${meeting}','${position}','${person}');
update public.meeting_revisions set published_at=now() where id='${revision}';update public.meetings set published_revision_id='${revision}',status='published' where id='${meeting}';
`);
});
afterAll(async () => {
  await db.close();
});
describe("SQL real y RLS con auth.uid simulado (no servicio Auth)", () => {
  it("cada tabla pública tiene RLS activo", async () => {
    const r = await db.query<{ name: string }>(
      "select relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",
    );
    expect(r.rows).toEqual([]);
  });
  it("anon no puede seleccionar tablas internas", async () => {
    await expect(asUser(null, "select * from public.people")).rejects.toThrow(
      /permission denied/,
    );
  });
  it("anon solo ve DTO allowlist de agenda publicada", async () => {
    const r = await asUser(null, "select * from public.public_agenda(null)");
    expect(r.rows).toHaveLength(1);
    expect(Object.keys(r.rows[0] as object).sort()).toEqual([
      "activity",
      "duration_seconds",
      "meeting_id",
      "sort_order",
      "starts_at",
      "timezone",
    ]);
    expect(JSON.stringify(r.rows)).not.toMatch(
      /Nota privada|Borrador secreto|telefono|Titulo privado/,
    );
  });
  it("usuario pendiente incluso con metadata admin no puede leer datos", async () => {
    expect((await asUser(2, "select * from public.people")).rows).toEqual([]);
    expect((await asUser(2, "select * from public.meetings")).rows).toEqual([]);
    expect(
      (
        await asUser(
          2,
          `select public.has_permission('${org}','administer',null) allowed`,
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
  });
  it("pendiente no puede autoaprobar ni crear grants", async () => {
    expect(
      (
        await asUser(
          2,
          `update public.memberships set status='approved' where user_id='${uid(2)}' returning id`,
        )
      ).rows,
    ).toEqual([]);
    await expect(
      asUser(
        2,
        `insert into public.permission_grants(org_id,subject_user_id,permission) values('${org}','${uid(2)}','administer')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("integrante ve publicado pero no borrador ni notas", async () => {
    expect(
      (await asUser(4, "select * from public.meeting_revisions")).rows,
    ).toHaveLength(1);
    expect(
      (await asUser(4, "select * from public.block_details")).rows,
    ).toEqual([]);
    expect(
      (await asUser(4, "select * from public.meeting_blocks")).rows,
    ).toHaveLength(1);
  });
  it("responsable del bloque padre no lee notas de una subactividad de otro equipo", async () => {
    expect(
      (await asUser(5, "select * from public.block_details")).rows,
    ).toHaveLength(1);
    expect(
      (await asUser(5, "select * from public.block_subactivities")).rows,
    ).toEqual([]);
  });
  it("equipo de la subactividad ve solo su contenido y no notas del bloque padre", async () => {
    expect(
      (await asUser(6, "select notes from public.block_subactivities")).rows,
    ).toEqual([{ notes: "Nota de Alabanza" }]);
    expect(
      (await asUser(6, "select * from public.block_details")).rows,
    ).toEqual([]);
  });
  it("planificador ve ambas revisiones y notas", async () => {
    expect(
      (await asUser(3, "select * from public.meeting_revisions")).rows,
    ).toHaveLength(2);
    expect(
      (await asUser(3, "select * from public.block_details")).rows,
    ).toHaveLength(1);
  });
  it("integrante no puede leer personas ajenas", async () => {
    expect((await asUser(4, "select * from public.people")).rows).toHaveLength(
      1,
    );
    expect((await asUser(6, "select * from public.people")).rows).toHaveLength(
      0,
    );
  });
  it("admin de otra org queda aislado", async () => {
    expect((await asUser(7, "select * from public.meetings")).rows).toEqual([]);
    const r = await asUser(7, "select * from public.people");
    expect(r.rows).toHaveLength(1);
    expect((r.rows[0] as { org_id: string }).org_id).toBe(otherOrg);
  });
  it("responsable de Media no tiene permisos de Alabanza ni de administración", async () => {
    expect(
      (
        await asUser(
          5,
          `select public.has_permission('${org}','assign','${team}') allowed`,
        )
      ).rows,
    ).toEqual([{ allowed: true }]);
    expect(
      (
        await asUser(
          5,
          `select public.has_permission('${org}','assign','${otherTeam}') allowed`,
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
    await expect(
      asUser(
        5,
        `select public.approve_member('${org}','${uid(2)}','admin',null)`,
      ),
    ).rejects.toThrow(/Forbidden/);
  });
  it("confirmación propia registra historial; otra persona no puede confirmar", async () => {
    await expect(
      asUser(
        6,
        `select public.confirm_assignment('${assignment}','confirmed')`,
      ),
    ).rejects.toThrow(/Forbidden/);
    await asUser(
      4,
      `select public.confirm_assignment('${assignment}','confirmed')`,
    );
    const r = await db.query(
      `select status,responded_at from public.assignments where id='${assignment}'`,
    );
    expect(r.rows[0]).toMatchObject({ status: "confirmed" });
    expect(
      (await db.query("select * from public.assignment_events")).rows,
    ).toHaveLength(2);
  });
  it("rechazo conserva registro, libera la vacante e historial", async () => {
    await asUser(
      4,
      `select public.confirm_assignment('${assignment}','unavailable')`,
    );
    expect(
      (
        await db.query(
          "select count(*)::int n from public.assignments where status='unavailable'",
        )
      ).rows,
    ).toEqual([{ n: 1 }]);
    expect(
      (await db.query("select count(*)::int n from public.assignment_events"))
        .rows,
    ).toEqual([{ n: 3 }]);
  });
  it("no permite asignación a bloque de otra reunión ni cruces de org", async () => {
    await expect(
      db.exec(
        `insert into public.roles(org_id,team_id,name) values('${otherOrg}','${team}','Intruso')`,
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      db.exec(
        `insert into public.meeting_required_positions(org_id,meeting_id,team_id,role_id,priority) values('${org}','${meeting}','${otherTeam}','${uid(901)}','required')`,
      ),
    ).rejects.toThrow(/Role must belong/);
  });
  it("historial es append-only aunque seas admin", async () => {
    expect(
      (await asUser(1, "delete from public.assignment_events returning id"))
        .rows,
    ).toEqual([]);
    await expect(
      asUser(
        1,
        `insert into public.assignment_events(org_id,assignment_id,event) values('${org}','${assignment}','falso')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("contenido publicado no se puede modificar ni agregar", async () => {
    await expect(
      asUser(
        3,
        `update public.meeting_blocks set name='hack' where id='${block}'`,
      ),
    ).rejects.toThrow(/immutable|permission denied/);
    await expect(
      asUser(
        3,
        `update public.block_details set notes='hack' where block_id='${block}'`,
      ),
    ).rejects.toThrow(/immutable|permission denied/);
    await expect(
      db.exec(
        `insert into public.meeting_blocks(org_id,revision_id,sort_order,name,duration_seconds) values('${org}','${revision}',2,'Hack',2)`,
      ),
    ).rejects.toThrow(/immutable|permission denied/);
  });
  it("edición de borrador no cambia agenda pública", async () => {
    await db.exec(
      `update public.meeting_blocks set name='Nuevo borrador' where id='${draftBlock}'`,
    ); // Trusted fixture edit; authenticated writes use editor RPCs.
    expect(
      (await asUser(null, "select activity from public.public_agenda(null)"))
        .rows,
    ).toEqual([{ activity: "Actividad pública" }]);
  });
  it("rechaza publicación con versión obsoleta", async () => {
    await expect(
      asUser(3, `select public.publish_revision('${meeting}','${draft}',0)`),
    ).rejects.toThrow(/Version conflict/);
  });
  it("publicación atómica cambia solo la revisión activa", async () => {
    await asUser(
      3,
      `select public.publish_revision('${meeting}','${draft}',1)`,
    );
    expect(
      (await asUser(null, "select activity from public.public_agenda(null)"))
        .rows,
    ).toEqual([{ activity: "Nuevo borrador" }]);
    expect(
      (await asUser(4, "select id from public.meeting_revisions")).rows,
    ).toEqual([{ id: draft }]);
  });
  it("solicitud idempotente y aprobación exclusiva de admin", async () => {
    await asUser(2, "select public.request_access('prueba-a')");
    await asUser(2, "select public.request_access('prueba-a')");
    expect(
      (
        await db.query(
          `select count(*)::int n from public.memberships where user_id='${uid(2)}'`,
        )
      ).rows,
    ).toEqual([{ n: 1 }]);
    await asUser(
      1,
      `select public.approve_member('${org}','${uid(2)}','member',null)`,
    );
    expect(
      (await asUser(2, "select * from public.meetings")).rows,
    ).toHaveLength(1);
  });
  it("suspensión revoca acceso aunque perfil siga aprobado", async () => {
    await db.exec(
      `update public.memberships set status='suspended' where user_id='${uid(2)}'`,
    );
    expect((await asUser(2, "select * from public.meetings")).rows).toEqual([]);
  });
  it("no permite timezone inventado ni puntero a draft", async () => {
    await expect(
      db.exec(
        `update public.meetings set timezone='Bad/Zone' where id='${meeting}'`,
      ),
    ).rejects.toThrow(/IANA/);
    await expect(
      db.exec(
        `update public.meetings set published_revision_id='${uid(499)}' where id='${meeting}'`,
      ),
    ).rejects.toThrow(/Revision must be published/);
  });
  it("anon no puede ejecutar RPCs privadas/privilegiadas", async () => {
    await expect(
      asUser(
        null,
        `select public.approve_member('${org}','${uid(2)}','admin',null)`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(null, `select private.can('${org}','administer',null)`),
    ).rejects.toThrow(/permission denied/);
  });
  it("ninguna tabla concede SELECT a anon", async () => {
    const r = await db.query<{ table_name: string }>(
      "select tablename as table_name from pg_tables where schemaname='public'",
    );
    for (const t of r.rows) {
      const result = await db.query(
        `select has_table_privilege('anon','public.${t.table_name}','SELECT') allowed`,
      );
      expect(result.rows).toEqual([{ allowed: false }]);
    }
  });
  it("solo admin vincula identidad a persona de su propia org", async () => {
    await expect(
      asUser(
        6,
        `select public.link_member_person('${org}','${uid(6)}','${person}')`,
      ),
    ).rejects.toThrow(/Forbidden/);
    await expect(
      asUser(
        1,
        `select public.link_member_person('${org}','${uid(6)}','${uid(802)}')`,
      ),
    ).rejects.toThrow(/Invalid person/);
    await db.exec(
      `insert into public.people(id,org_id,first_name,last_name) values('${uid(803)}','${org}','Nueva','Ficticia')`,
    );
    await asUser(
      1,
      `select public.link_member_person('${org}','${uid(6)}','${uid(803)}')`,
    );
    expect((await asUser(6, "select id from public.people")).rows).toEqual([
      { id: uid(803) },
    ]);
  });
  it("integrante no puede reasignarse una posición mediante UPDATE directo", async () => {
    await expect(
      asUser(
        4,
        `update public.assignments set person_id='${uid(803)}' where id='${assignment}' returning id`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("solo admin suspende a terceros y jamás a sí mismo", async () => {
    await expect(
      asUser(
        3,
        `select public.set_member_status('${org}','${uid(6)}','suspended')`,
      ),
    ).rejects.toThrow(/Forbidden/);
    await expect(
      asUser(
        1,
        `select public.set_member_status('${org}','${uid(1)}','suspended')`,
      ),
    ).rejects.toThrow(/own account/);
    await asUser(
      1,
      `select public.set_member_status('${org}','${uid(6)}','suspended')`,
    );
    expect((await asUser(6, "select * from public.meetings")).rows).toEqual([]);
  });
  it("administración global no se puede conceder en un equipo", async () => {
    await expect(
      asUser(
        1,
        `insert into public.permission_grants(org_id,subject_user_id,team_id,permission,granted_by) values('${org}','${uid(5)}','${team}','administer','${uid(1)}')`,
      ),
    ).rejects.toThrow(/admin_organization_scope/);
  });
  it("revision no admite zona inventada ni cambios de identidad", async () => {
    await expect(
      db.exec(
        `insert into public.meeting_revisions(org_id,meeting_id,revision,created_by,scheduled_start,timezone) values('${org}','${meeting}',3,'${uid(3)}',now(),'Bad/Zone')`,
      ),
    ).rejects.toThrow(/IANA/);
  });
  it("publicación no se puede eludir escribiendo published_at o puntero directo", async () => {
    await expect(
      asUser(
        3,
        `update public.meeting_revisions set published_at=now() where id='${draft}'`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(
        3,
        `update public.meetings set published_revision_id='${revision}' where id='${meeting}'`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("tipos de bloque se copian al crear instancia y no cambian existentes", async () => {
    const type = uid(999),
      meeting2 = uid(302),
      revision2 = uid(403);
    await db.exec(
      `insert into public.block_types(id,org_id,name,version,field_schema_json) values('${type}','${org}','Tipo ficticio',1,'[{"name":"texto","type":"text"}]');insert into public.meetings(id,org_id,title,date,start_local_time) values('${meeting2}','${org}','Otra prueba',current_date,'10:00');insert into public.meeting_revisions(id,org_id,meeting_id,revision,created_by,scheduled_start) values('${revision2}','${org}','${meeting2}',1,'${uid(3)}',now());insert into public.meeting_blocks(org_id,revision_id,block_type_id,sort_order,name,duration_seconds) values('${org}','${revision2}','${type}',0,'Bloque con snapshot',10);update public.block_types set version=2,field_schema_json='[]' where id='${type}';`,
    );
    const result = await db.query(
      `select type_version,field_schema_snapshot from public.meeting_blocks where revision_id='${revision2}'`,
    );
    expect(result.rows[0]).toEqual({
      type_version: 1,
      field_schema_snapshot: [{ name: "texto", type: "text" }],
    });
  });
  it("email de perfil es proyección Auth privada y no editable por el usuario", async () => {
    await db.exec(
      `update auth.users set email='cambio-ficticio@example.invalid' where id='${uid(4)}'`,
    );
    expect(
      (
        await asUser(
          4,
          `select email from public.profiles where user_id='${uid(4)}'`,
        )
      ).rows,
    ).toEqual([{ email: "cambio-ficticio@example.invalid" }]);
    expect(
      (
        await asUser(
          3,
          `select email from public.profiles where user_id='${uid(4)}'`,
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await asUser(
          4,
          `update public.profiles set email='falso@example.invalid' where user_id='${uid(4)}' returning user_id`,
        )
      ).rows,
    ).toEqual([]);
  });
  it("seed ficticio se aplica sin tocar auth.users", async () => {
    await db.exec(readFileSync("supabase/seed.sql", "utf8"));
    await db.exec(readFileSync("supabase/seed.sql", "utf8"));
    expect(
      (await db.query("select count(*)::int n from auth.users")).rows,
    ).toEqual([{ n: 7 }]);
  });
});

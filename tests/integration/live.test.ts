import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { emptyBlock, snapshotSchema } from "@/lib/editor/model";
import { liveSnapshot, type LiveSnapshot } from "@/lib/live/model";
let db: PGlite;
const id = (n: number) =>
  `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = "10000000-0000-4000-8000-000000000001",
  admin = id(1),
  reader = id(2),
  operator = id(3),
  scoped = id(4),
  pending = id(5),
  outsider = id(6),
  other = id(99);
async function rpc(user: string | null, name: string, args: unknown[]) {
  await db.exec(
    `set role ${user ? "authenticated" : "anon"};select set_config('request.jwt.claim.sub','${user ?? ""}',false)`,
  );
  try {
    const r = await db.query<{ result: unknown }>(
      `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) result`,
      args,
    );
    return r.rows[0].result;
  } finally {
    await db.exec("reset role");
  }
}
async function meeting(publish = true, empty = false) {
  const meta = {
    title: "Reunión ficticia en vivo",
    date: "2029-10-01",
    startLocalTime: "10:00",
    timezone: "America/Argentina/Buenos_Aires",
    meetingTypeId: null,
    seriesId: null,
  };
  let s = snapshotSchema.parse(
    await rpc(admin, "create_editor_meeting", [org, meta, null]),
  );
  if (publish)
    s = snapshotSchema.parse(
      await rpc(admin, "publish_editor_snapshot", [
        s.meetingId,
        s.version,
        meta,
        empty
          ? []
          : [
              {
                ...emptyBlock("Primera actividad"),
                durationSeconds: 600,
                notes: "Nota privada nunca pública",
              },
              { ...emptyBlock("Segunda actividad"), durationSeconds: 300 },
            ],
      ]),
    );
  return s;
}
async function snapshot(user: string, meetingId: string) {
  return liveSnapshot.parse(await rpc(user, "get_live_snapshot", [meetingId]));
}
async function transition(
  s: LiveSnapshot,
  command: string,
  user = operator,
  request = crypto.randomUUID(),
) {
  return liveSnapshot.parse(
    await rpc(user, "transition_live", [
      s.meetingId,
      s.version,
      request,
      command,
    ]),
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role supabase_realtime_admin nologin;create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  await db.exec(
    `insert into public.organizations(id,name,slug) values('${other}','Otra org ficticia','live-other');insert into auth.users(id,email) values ${[admin, reader, operator, scoped, pending, outsider].map((user, i) => `('${user}','live-${i}@example.invalid')`).join(",")};update public.profiles set approved_at=now() where user_id<>'${pending}';insert into public.memberships(org_id,user_id,status) values ${[admin, reader, operator, scoped, pending].map((user) => `('${org}','${user}','${user === pending ? "pending" : "approved"}')`).join(",")},('${other}','${outsider}','approved');insert into public.permission_grants(org_id,subject_user_id,permission,team_id) values('${org}','${admin}','administer',null),('${org}','${reader}','read_agenda',null),('${org}','${operator}','operate_live',null),('${org}','${scoped}','operate_live','10000000-0000-4000-8000-000000000201'),('${other}','${outsider}','administer',null);`,
  );
});
afterAll(async () => db.close());
it("solo publicados y operador global aprobado; snapshot sin datos privados", async () => {
  const m = await meeting();
  const s = await snapshot(reader, m.meetingId);
  expect(s.status).toBe("ready");
  expect(s.canOperate).toBe(false);
  expect(JSON.stringify(s)).not.toContain("Nota privada");
  for (const user of [null, pending, outsider, scoped])
    await expect(
      rpc(user, "get_live_snapshot", [m.meetingId]),
    ).rejects.toThrow();
  for (const user of [reader, pending, outsider, scoped])
    await expect(transition(s, "start", user)).rejects.toThrow(/Forbidden/);
  const draft = await meeting(false);
  await expect(snapshot(operator, draft.meetingId)).rejects.toThrow(
    /Published/,
  );
  const empty = await meeting(true, true);
  await expect(
    transition(await snapshot(operator, empty.meetingId), "start"),
  ).rejects.toThrow(/no activities/);
});
it("iniciar/avanzar/finalizar/cerrar: instantes reales y reintentos idempotentes", async () => {
  const m = await meeting();
  const initial = await snapshot(operator, m.meetingId);
  const request = crypto.randomUUID();
  let s = await transition(initial, "start", operator, request);
  expect(s.version).toBe(1);
  expect(s.activeBlockId).toBe(s.blocks[0].id);
  expect(s.blocks[0].actualStart).toBe(s.startedAt);
  const retry = await transition(initial, "start", operator, request);
  expect(retry.version).toBe(1);
  expect(retry.startedAt).toBe(s.startedAt);
  await expect(transition(initial, "next")).rejects.toThrow(/version conflict/);
  await expect(
    transition({ ...s, version: initial.version }, "next", operator, request),
  ).rejects.toThrow(/Request conflict/);
  s = await transition(s, "next");
  expect(s.blocks[0].actualEnd).toBe(s.blocks[1].actualStart);
  expect(s.blocks[0].status).toBe("finished");
  s = await transition(s, "finish_block");
  expect(s.activeBlockId).toBeNull();
  expect(s.status).toBe("running");
  expect(s.closedAt).toBeNull();
  await expect(transition(s, "next")).rejects.toThrow(/No pending/);
  s = await transition(s, "close");
  expect(s.status).toBe("finished");
  expect(s.closedAt).not.toBeNull();
  expect(s.activeBlockId).toBeNull();
  const row = await db.query<{ status: string; closed_at: Date }>(
    "select status,closed_at from public.meetings where id=$1",
    [m.meetingId],
  );
  expect(row.rows[0].status).toBe("finished");
  expect(new Date(row.rows[0].closed_at).toISOString()).toBe(
    new Date(s.closedAt!).toISOString(),
  );
  await expect(transition(s, "start")).rejects.toThrow();
  await expect(transition(s, "close")).rejects.toThrow(/not running/);
  const events = await db.query<{ n: number }>(
    "select count(*)::int n from private.meeting_live_events where meeting_id=$1",
    [m.meetingId],
  );
  expect(events.rows[0].n).toBe(4);
});
it("espera entre actividades y cierre anticipado no fabrican ejecuciones pendientes", async () => {
  const m = await meeting();
  let s = await transition(await snapshot(operator, m.meetingId), "start");
  s = await transition(s, "finish_block");
  expect(s.blocks[1].actualStart).toBeNull();
  s = await transition(s, "next");
  expect(s.blocks[1].status).toBe("running");
  const second = await meeting();
  let early = await transition(
    await snapshot(operator, second.meetingId),
    "start",
  );
  early = await transition(early, "close");
  expect(early.blocks[0].actualEnd).toBe(early.closedAt);
  expect(early.blocks[1].status).toBe("pending");
  expect(early.blocks[1].actualStart).toBeNull();
});
it("congela publicación/cancelación mientras permite guardar borrador sin alterar ejecución", async () => {
  let m = await meeting();
  const s = await transition(await snapshot(operator, m.meetingId), "start");
  m = snapshotSchema.parse(
    await rpc(admin, "get_editor_snapshot", [m.meetingId]),
  );
  const blocks = m.blocks.map((b) => ({ ...b, name: "Nombre en borrador" }));
  m = snapshotSchema.parse(
    await rpc(admin, "save_editor_snapshot", [
      m.meetingId,
      m.version,
      m.metadata,
      blocks,
    ]),
  );
  expect((await snapshot(operator, m.meetingId)).blocks[0].name).toBe(
    "Primera actividad",
  );
  await expect(
    rpc(admin, "publish_editor_snapshot", [
      m.meetingId,
      m.version,
      m.metadata,
      blocks,
    ]),
  ).rejects.toThrow(/frozen/);
  await expect(
    rpc(admin, "cancel_editor_meeting", [m.meetingId, m.version]),
  ).rejects.toThrow(/frozen/);
  expect((await snapshot(operator, m.meetingId)).revisionId).toBe(s.revisionId);
});
it("RLS y grants protegen tablas, incluso con un JWT válido de otra organización", async () => {
  const m = await meeting();
  await transition(await snapshot(operator, m.meetingId), "start");
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${outsider}',false)`,
  );
  try {
    expect(
      (await db.query("select * from public.meeting_live_state")).rows,
    ).toEqual([]);
    await expect(
      db.exec(
        `update public.meeting_live_state set version=900 where meeting_id='${m.meetingId}'`,
      ),
    ).rejects.toThrow(/permission/);
    await expect(
      db.exec("select * from private.block_executions"),
    ).rejects.toThrow(/permission/);
  } finally {
    await db.exec("reset role");
  }
  await expect(
    rpc(operator, "transition_live", [
      m.meetingId,
      null,
      crypto.randomUUID(),
      "next",
    ]),
  ).rejects.toThrow(/Invalid/);
  await expect(
    rpc(operator, "transition_live", [m.meetingId, 1, null, "next"]),
  ).rejects.toThrow(/Invalid/);
});

it('captura participantes del publicado y responsables sin duplicar roles ni perder reemplazados',async()=>{
 const meta={title:'Participantes ficticios',date:'2029-10-25',startLocalTime:'10:00',timezone:'America/Argentina/Buenos_Aires',meetingTypeId:null,seriesId:null};
 const person='10000000-0000-4000-8000-000000000101',replacement='10000000-0000-4000-8000-000000000102',hidden='10000000-0000-4000-8000-000000000103',team='10000000-0000-4000-8000-000000000201',role='10000000-0000-4000-8000-000000000301';
 await db.exec(`insert into public.people(id,org_id,first_name,last_name) values('${hidden}','${org}','Persona borrador','Ficticia');update public.profiles set org_id='${org}',person_id='${person}' where user_id='${scoped}';insert into public.team_memberships(org_id,team_id,person_id) values('${org}','${team}','${replacement}') on conflict do nothing;insert into public.permission_grants(org_id,subject_user_id,team_id,permission) values('${org}','${scoped}','${team}','assign'),('${org}','${scoped}','${team}','confirm') on conflict do nothing;`);
 let m=snapshotSchema.parse(await rpc(admin,'create_editor_meeting',[org,meta,null]));
 const block={...emptyBlock('Ficticia'),teamId:team,durationSeconds:600,responsibles:[{assignmentId:null,personId:person,teamId:team,roleId:role}]};
 m=snapshotSchema.parse(await rpc(admin,'publish_editor_snapshot',[m.meetingId,m.version,meta,[block,{...block,clientKey:crypto.randomUUID()}]]));
 await rpc(admin,'configure_meeting_position',[m.meetingId,m.version,team,role,'required',1]);
 const positions=await db.query<{id:string}>('select id from public.meeting_required_positions where meeting_id=$1',[m.meetingId]);
 await rpc(admin,'staff_meeting_position',[positions.rows[0].id,m.version+1,person,null,null,null]);
 m=snapshotSchema.parse(await rpc(admin,'get_editor_snapshot',[m.meetingId]));
 await rpc(admin,'save_editor_snapshot',[m.meetingId,m.version,meta,[{...block,responsibles:[{assignmentId:null,personId:hidden,teamId:team,roleId:role}]}]]);
 let live=await transition(await snapshot(operator,m.meetingId),'start');
 const before=await db.query<{person_id:string|null;user_id:string|null}>('select person_id,user_id from private.live_participants where meeting_id=$1',[m.meetingId]);
 expect(before.rows).toHaveLength(2);expect(before.rows.filter(p=>p.person_id===person)).toHaveLength(1);expect(before.rows.some(p=>p.person_id===hidden)).toBe(false);expect(before.rows.filter(p=>p.user_id===scoped)).toHaveLength(1);expect(before.rows.filter(p=>p.user_id===operator)).toHaveLength(1);
 const staffing=await db.query<{version:number;id:string;status:string}>('select m.version,a.id,a.status from public.meetings m join public.assignments a on a.meeting_id=m.id where m.id=$1 and a.position_id=$2 and a.replaced_by_id is null',[m.meetingId,positions.rows[0].id]);
 await rpc(admin,'staff_meeting_position',[positions.rows[0].id,staffing.rows[0].version,replacement,staffing.rows[0].id,staffing.rows[0].status,null]);
 live=await transition(live,'next');live=await transition(live,'close');
 const final=await db.query<{person_id:string|null;user_id:string|null}>('select person_id,user_id from private.live_participants where meeting_id=$1',[m.meetingId]);
 expect(final.rows.filter(p=>p.person_id===person)).toHaveLength(1);expect(final.rows.filter(p=>p.person_id===replacement)).toHaveLength(1);expect(final.rows.filter(p=>p.user_id===operator)).toHaveLength(1);expect(final.rows.some(p=>p.person_id===hidden)).toBe(false);
});

it('Realtime puede descubrir la columna filtro sin obtener filas ni otras columnas',async()=>{
 const metadata=await db.query<{visible:boolean}>("select has_column_privilege('supabase_realtime_admin','public.meeting_live_state','meeting_id','SELECT') visible");expect(metadata.rows[0].visible).toBe(true);
 await db.exec('set role supabase_realtime_admin');try{
 expect((await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='meeting_live_state'")).rows).toEqual([{column_name:'meeting_id'}]);
 expect((await db.query('select meeting_id from public.meeting_live_state')).rows).toEqual([]);
 await expect(db.query('select org_id from public.meeting_live_state')).rejects.toThrow(/permission/);
 }finally{await db.exec('reset role');}
});

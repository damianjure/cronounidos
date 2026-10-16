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

it("captura participantes del publicado y responsables sin duplicar roles ni perder reemplazados", async () => {
  const meta = {
    title: "Participantes ficticios",
    date: "2029-10-25",
    startLocalTime: "10:00",
    timezone: "America/Argentina/Buenos_Aires",
    meetingTypeId: null,
    seriesId: null,
  };
  const person = "10000000-0000-4000-8000-000000000101",
    replacement = "10000000-0000-4000-8000-000000000102",
    hidden = "10000000-0000-4000-8000-000000000103",
    team = "10000000-0000-4000-8000-000000000201",
    role = "10000000-0000-4000-8000-000000000301";
  await db.exec(
    `insert into public.people(id,org_id,first_name,last_name) values('${hidden}','${org}','Persona borrador','Ficticia');update public.profiles set org_id='${org}',person_id='${person}' where user_id='${scoped}';insert into public.team_memberships(org_id,team_id,person_id) values('${org}','${team}','${replacement}') on conflict do nothing;insert into public.permission_grants(org_id,subject_user_id,team_id,permission) values('${org}','${scoped}','${team}','assign'),('${org}','${scoped}','${team}','confirm') on conflict do nothing;`,
  );
  let m = snapshotSchema.parse(
    await rpc(admin, "create_editor_meeting", [org, meta, null]),
  );
  const block = {
    ...emptyBlock("Ficticia"),
    teamId: team,
    durationSeconds: 600,
    responsibles: [
      { assignmentId: null, personId: person, teamId: team, roleId: role },
    ],
  };
  m = snapshotSchema.parse(
    await rpc(admin, "publish_editor_snapshot", [
      m.meetingId,
      m.version,
      meta,
      [block, { ...block, clientKey: crypto.randomUUID() }],
    ]),
  );
  await rpc(admin, "configure_meeting_position", [
    m.meetingId,
    m.version,
    team,
    role,
    "required",
    1,
  ]);
  const positions = await db.query<{ id: string }>(
    "select id from public.meeting_required_positions where meeting_id=$1",
    [m.meetingId],
  );
  await rpc(admin, "staff_meeting_position", [
    positions.rows[0].id,
    m.version + 1,
    person,
    null,
    null,
    null,
  ]);
  m = snapshotSchema.parse(
    await rpc(admin, "get_editor_snapshot", [m.meetingId]),
  );
  await rpc(admin, "save_editor_snapshot", [
    m.meetingId,
    m.version,
    meta,
    [
      {
        ...block,
        responsibles: [
          { assignmentId: null, personId: hidden, teamId: team, roleId: role },
        ],
      },
    ],
  ]);
  let live = await transition(await snapshot(operator, m.meetingId), "start");
  const before = await db.query<{
    person_id: string | null;
    user_id: string | null;
  }>(
    "select person_id,user_id from private.live_participants where meeting_id=$1",
    [m.meetingId],
  );
  expect(before.rows).toHaveLength(2);
  expect(before.rows.filter((p) => p.person_id === person)).toHaveLength(1);
  expect(before.rows.some((p) => p.person_id === hidden)).toBe(false);
  expect(before.rows.filter((p) => p.user_id === scoped)).toHaveLength(1);
  expect(before.rows.filter((p) => p.user_id === operator)).toHaveLength(1);
  const staffing = await db.query<{
    version: number;
    id: string;
    status: string;
  }>(
    "select m.version,a.id,a.status from public.meetings m join public.assignments a on a.meeting_id=m.id where m.id=$1 and a.position_id=$2 and a.replaced_by_id is null",
    [m.meetingId, positions.rows[0].id],
  );
  await rpc(admin, "staff_meeting_position", [
    positions.rows[0].id,
    staffing.rows[0].version,
    replacement,
    staffing.rows[0].id,
    staffing.rows[0].status,
    null,
  ]);
  live = await transition(live, "next");
  await transition(live, "close");
  const final = await db.query<{
    person_id: string | null;
    user_id: string | null;
  }>(
    "select person_id,user_id from private.live_participants where meeting_id=$1",
    [m.meetingId],
  );
  expect(final.rows.filter((p) => p.person_id === person)).toHaveLength(1);
  expect(final.rows.filter((p) => p.person_id === replacement)).toHaveLength(1);
  expect(final.rows.filter((p) => p.user_id === operator)).toHaveLength(1);
  expect(final.rows.some((p) => p.person_id === hidden)).toBe(false);
});

it("Realtime puede descubrir la columna filtro sin obtener filas ni otras columnas", async () => {
  const metadata = await db.query<{ visible: boolean }>(
    "select has_column_privilege('supabase_realtime_admin','public.meeting_live_state','meeting_id','SELECT') visible",
  );
  expect(metadata.rows[0].visible).toBe(true);
  await db.exec("set role supabase_realtime_admin");
  try {
    expect(
      (
        await db.query(
          "select column_name from information_schema.columns where table_schema='public' and table_name='meeting_live_state'",
        )
      ).rows,
    ).toEqual([{ column_name: "meeting_id" }]);
    expect(
      (await db.query("select meeting_id from public.meeting_live_state")).rows,
    ).toEqual([]);
    await expect(
      db.query("select org_id from public.meeting_live_state"),
    ).rejects.toThrow(/permission/);
  } finally {
    await db.exec("reset role");
  }
});

it("feedback: cierre efectivo +10 min, avisos idempotentes y comentarios solo admin", async () => {
  const m = await meeting();
  const s = await transition(await snapshot(operator, m.meetingId), "start");
  // The operator is captured automatically, without relying on any browser.
  await db.exec("select private.dispatch_due_feedback()");
  expect(await rpc(operator, "my_feedback_requests", [org])).toEqual([]);
  await transition(s, "close");
  await db.exec("select private.dispatch_due_feedback()");
  expect(await rpc(operator, "my_feedback_requests", [org])).toEqual([]);
  // SQL test time travel only, never exposed as a dispatcher argument/API.
  await db.query(
    "update public.meeting_live_state set closed_at=clock_timestamp()-interval '9 minutes 59 seconds' where meeting_id=$1",
    [m.meetingId],
  );
  await db.exec("select private.dispatch_due_feedback()");
  expect(await rpc(operator, "my_feedback_requests", [org])).toEqual([]);
  await db.query(
    "update public.meeting_live_state set closed_at=clock_timestamp()-interval '10 minutes 1 second' where meeting_id=$1",
    [m.meetingId],
  );
  await db.exec(
    "select private.dispatch_due_feedback();select private.dispatch_due_feedback()",
  );
  const requests = (await rpc(operator, "my_feedback_requests", [org])) as {
    id: string;
    meetingId: string;
    submittedAt: string | null;
  }[];
  const request = requests.find((r) => r.meetingId === m.meetingId)!;
  expect(request).toBeDefined();
  expect(Object.keys(request).sort()).toEqual([
    "dueAt",
    "id",
    "meetingId",
    "submittedAt",
    "title",
  ]);
  const notices = await db.query<{ n: number }>(
    "select count(*)::int n from public.personal_notifications where feedback_request_id=$1",
    [request.id],
  );
  expect(notices.rows[0].n).toBe(1);
  await expect(
    rpc(reader, "submit_meeting_feedback", [
      request.id,
      "problem",
      "Secreto ficticio",
    ]),
  ).rejects.toThrow(/Forbidden/);
  for (const user of [pending, outsider, scoped, reader, operator])
    await expect(
      rpc(user, "admin_meeting_feedback", [org, m.meetingId]),
    ).rejects.toThrow(/Forbidden/);
  await expect(rpc(null, "my_feedback_requests", [org])).rejects.toThrow(
    /permission denied/,
  );
  await expect(
    rpc(operator, "submit_meeting_feedback", [request.id, "other", null]),
  ).rejects.toThrow(/Invalid/);
  await expect(
    rpc(operator, "submit_meeting_feedback", [
      request.id,
      "problem",
      "x".repeat(501),
    ]),
  ).rejects.toThrow(/Invalid/);
  await rpc(operator, "submit_meeting_feedback", [
    request.id,
    "problem",
    "Secreto ficticio",
  ]);
  await rpc(operator, "submit_meeting_feedback", [
    request.id,
    "problem",
    "Secreto ficticio",
  ]);
  await expect(
    rpc(operator, "submit_meeting_feedback", [request.id, "all_good", null]),
  ).rejects.toThrow(/Already submitted/);
  const own = JSON.stringify(
    await rpc(operator, "my_feedback_requests", [org]),
  );
  expect(own).not.toMatch(/Secreto ficticio|problem|comment|category/);
  expect(
    (
      (await rpc(operator, "my_feedback_requests", [org])) as typeof requests
    ).find((r) => r.id === request.id)?.submittedAt,
  ).not.toBeNull();
  expect(
    JSON.stringify(
      await rpc(admin, "admin_meeting_feedback", [org, m.meetingId]),
    ),
  ).toContain("Secreto ficticio");
  for (const user of [operator, reader, pending, outsider]) {
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`,
    );
    try {
      await expect(
        db.exec("select * from private.meeting_feedback"),
      ).rejects.toThrow(/permission denied/);
      const n = await db.query<{ user_id: string }>(
        "select * from public.personal_notifications",
      );
      expect(n.rows.every((r) => r.user_id === user)).toBe(true);
      if (user !== operator) expect(n.rows).toHaveLength(0);
      await expect(
        db.exec("select private.dispatch_due_feedback()"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  }
  await db.query(
    "update public.memberships set status='suspended' where org_id=$1 and user_id=$2",
    [org, operator],
  );
  expect(await rpc(operator, "my_feedback_requests", [org])).toEqual([]);
  await expect(
    rpc(operator, "submit_meeting_feedback", [
      request.id,
      "problem",
      "Secreto ficticio",
    ]),
  ).rejects.toThrow(/Forbidden/);
  await db.query(
    "update public.memberships set status='approved' where org_id=$1 and user_id=$2",
    [org, operator],
  );
});

it("solicitudes sin cuenta se vinculan solo por identidad aprobada y no se transfieren", async () => {
  const m = await meeting();
  const s = await transition(await snapshot(operator, m.meetingId), "start");
  const person = crypto.randomUUID();
  await db.query(
    "insert into public.people(id,org_id,first_name,last_name) values($1,$2,'Feedback','Ficticio')",
    [person, org],
  );
  await db.query("select private.capture_live_participant($1,$2)", [
    m.meetingId,
    person,
  ]);
  await transition(s, "close");
  await db.query(
    "update public.meeting_live_state set closed_at=clock_timestamp()-interval '11 minutes' where meeting_id=$1",
    [m.meetingId],
  );
  await db.exec("select private.dispatch_due_feedback()");
  const original = await db.query<{ id: string; user_id: string | null }>(
    "select id,user_id from private.feedback_requests where meeting_id=$1 and person_id=$2",
    [m.meetingId, person],
  );
  expect(original.rows).toHaveLength(1);
  expect(original.rows[0].user_id).toBeNull();
  // Admin-owned identity link exists, but pending membership cannot receive it.
  await db.query(
    "update public.profiles set person_id=$1,org_id=$2 where user_id=$3",
    [person, org, pending],
  );
  await db.exec("select private.dispatch_due_feedback()");
  expect(await rpc(pending, "my_feedback_requests", [org])).toEqual([]);
  await db.query(
    "update public.profiles set approved_at=clock_timestamp() where user_id=$1",
    [pending],
  );
  await db.query(
    "update public.memberships set status='approved' where user_id=$1 and org_id=$2",
    [pending, org],
  );
  await db.exec(
    "select private.dispatch_due_feedback();select private.dispatch_due_feedback()",
  );
  const own = (await rpc(pending, "my_feedback_requests", [org])) as {
    id: string;
  }[];
  expect(own.map((r) => r.id)).toContain(original.rows[0].id);
  await db.query(
    "update public.profiles set person_id=null,org_id=null where user_id=$1",
    [pending],
  );
  await db.query(
    "update public.profiles set person_id=$1,org_id=$2 where user_id=$3",
    [person, org, reader],
  );
  await db.exec("select private.dispatch_due_feedback()");
  expect(
    (
      (await rpc(reader, "my_feedback_requests", [org])) as { id: string }[]
    ).map((r) => r.id),
  ).not.toContain(original.rows[0].id);
  expect(
    (
      (await rpc(pending, "my_feedback_requests", [org])) as { id: string }[]
    ).map((r) => r.id),
  ).toContain(original.rows[0].id);
  await db.exec(
    "begin;grant select on private.meeting_feedback to authenticated",
  );
  try {
    for (const user of [reader, operator, pending, outsider, scoped]) {
      await db.exec(
        `set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`,
      );
      expect(
        (await db.query("select * from private.meeting_feedback")).rows,
      ).toEqual([]);
      await db.exec("reset role");
    }
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false)`,
    );
    expect(
      (await db.query("select * from private.meeting_feedback")).rows.length,
    ).toBeGreaterThan(0);
  } finally {
    await db.exec("reset role;rollback");
  }
});

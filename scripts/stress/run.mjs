import pg from "pg";
import assert from "node:assert/strict";
import { checkBurst, checkFeedbackCounts } from "./checks.mjs";
import { randomUUID } from "node:crypto";
const pool = new pg.Pool({
  host: "127.0.0.1",
  port: 55432,
  user: "postgres",
  password: "pw",
  database: "postgres",
  max: 250,
});
pool.on("error", (error) => {
  console.error("Error inesperado del pool:", error.message);
  process.exitCode = 1;
});
const ORG = "10000000-0000-4000-8000-000000000001";
const uid = (n) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const N = Number(process.env.USERS || 200);
assert(
  Number.isSafeInteger(N) && N >= 100 && N <= 1000,
  "USERS debe ser un entero entre 100 y 1000",
);
const ADMIN = uid(0),
  OP1 = uid(1),
  OP2 = uid(2);
async function as(user, sql, params = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${user ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user ?? "",
    ]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return r.rows;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
const enc = (v) =>
  v !== null && typeof v === "object" ? JSON.stringify(v) : v;
const rpc = async (user, fn, args) =>
  (
    await as(
      user,
      `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) r`,
      args.map(enc),
    )
  )[0].r;
function stats(name, times, errors) {
  const s = [...times].sort((a, b) => a - b),
    p = (q) =>
      s.length
        ? s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(0)
        : "-";
  const errs = {};
  for (const e of errors) errs[e] = (errs[e] || 0) + 1;
  console.log(
    `\n## ${name}\n  ok=${times.length} errores=${errors.length} p50=${p(0.5)}ms p95=${p(0.95)}ms p99=${p(0.99)}ms max=${p(1)}ms`,
    Object.keys(errs).length ? JSON.stringify(errs) : "",
  );
}
async function timed(fn) {
  const t = performance.now();
  await fn();
  return performance.now() - t;
}
async function burst(name, count, fn, expected = { successes: count }) {
  const times = [],
    errors = [];
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: count }, (_, i) =>
      timed(() => fn(i)).then(
        (t) => times.push(t),
        (e) => errors.push(String(e.message)),
      ),
    ),
  );
  stats(
    `${name} (${count} simultáneas, total ${(performance.now() - t0).toFixed(0)}ms)`,
    times,
    errors,
  );
  checkBurst(count, times.length, errors, expected);
  return { times, errors };
}
const block = (name, d = 600) => ({
  id: null,
  clientKey: randomUUID(),
  blockTypeId: null,
  teamId: null,
  name,
  durationSeconds: d,
  visibility: "public",
  notes: "nota privada",
  fieldSchema: [],
  customFields: {},
  songIds: [],
  announcementIds: [],
  messageIds: [],
  resourceIds: [],
  responsibles: [],
  subactivities: [],
});
const meta = (t, date = "2029-10-07") => ({
  title: t,
  date,
  startLocalTime: "10:00",
  timezone: "America/Argentina/Buenos_Aires",
  meetingTypeId: null,
  seriesId: null,
});

try {
  // ---------- seed ----------
  const su = await pool.connect();
  await su.query(
    `insert into auth.users(id,email,email_confirmed_at) select ('90000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'stress'||g||'@example.invalid',now() from generate_series(0,${N}) g`,
  );
  await su.query(
    `insert into public.people(id,org_id,first_name,last_name) select ('80000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'${ORG}','Persona','Ficticia '||g from generate_series(0,${N}) g`,
  );
  await su.query(
    `update public.profiles p set approved_at=now(),org_id='${ORG}',person_id=('80000000-0000-4000-8000-'||right(p.user_id::text,12))::uuid where p.user_id::text like '90000000-%'`,
  );
  await su.query(
    `insert into public.memberships(org_id,user_id,status) select '${ORG}',user_id,'approved' from public.profiles where user_id::text like '90000000-%'`,
  );
  await su.query(
    `insert into public.permission_grants(org_id,subject_user_id,permission) select '${ORG}',user_id,'read_agenda' from public.profiles where user_id::text like '90000000-%'`,
  );
  await su.query(
    `insert into public.permission_grants(org_id,subject_user_id,permission) values('${ORG}','${ADMIN}','administer'),('${ORG}','${OP1}','operate_live'),('${ORG}','${OP2}','operate_live')`,
  );
  for (let i = 3; i <= 22; i++)
    for (const p of [
      "plan",
      "read_content",
      "read_people",
      "assign",
      "confirm",
    ])
      await su.query(
        `insert into public.permission_grants(org_id,subject_user_id,permission) values($1,$2,$3)`,
        [ORG, uid(i), p],
      );
  su.release();
  // published meeting with 12 blocks
  let s = await rpc(ADMIN, "create_editor_meeting", [
    ORG,
    meta("Reunión de estrés"),
    null,
  ]);
  s = await rpc(ADMIN, "publish_editor_snapshot", [
    s.meetingId,
    s.version,
    meta("Reunión de estrés"),
    Array.from({ length: 12 }, (_, i) => block("Actividad " + (i + 1))),
  ]);
  const MEETING = s.meetingId;
  // positions + assignments (one per person 1..N-50)
  const su2 = await pool.connect();
  const nAssign = N - 50;
  await su2.query(
    `insert into public.meeting_required_positions(org_id,meeting_id,team_id,role_id,priority,quantity_index) select '${ORG}','${MEETING}','10000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000301','required',g from generate_series(1,${nAssign}) g`,
  );
  await su2.query(
    `insert into public.assignments(org_id,meeting_id,position_id,person_id,team_id,role_id) select '${ORG}','${MEETING}',p.id,('80000000-0000-4000-8000-'||lpad((p.quantity_index+30)::text,12,'0'))::uuid,p.team_id,p.role_id from public.meeting_required_positions p where p.meeting_id='${MEETING}'`,
  );
  su2.release();
  console.log(
    `seed: ${N + 1} usuarios, reunión publicada con 12 bloques, ${nAssign} asignaciones`,
  );

  // ---------- S1 lectura masiva ----------
  await burst("S1a agenda pública anónima", 500, () =>
    as(null, "select * from public.public_agenda($1)", [MEETING]),
  );
  await burst("S1b snapshot en vivo, integrantes", N, (i) =>
    rpc(uid(i), "get_live_snapshot", [MEETING]),
  );
  await burst("S1c calendario/cobertura, integrantes", N, (i) =>
    rpc(uid(i), "calendar_overview", [ORG, "2029-10-01", "2029-10-31"]),
  );
  await burst("S1d confirmaciones de la reunión (planificadores)", 100, (i) =>
    rpc(uid(3 + (i % 20)), "get_meeting_confirmations", [MEETING]),
  );

  // ---------- S2 escritura concurrente del mismo borrador ----------
  {
    const base = await rpc(uid(3), "get_editor_snapshot", [MEETING]);
    const r = await burst(
      "S2 20 planificadores guardan el MISMO borrador a la vez",
      20,
      (i) =>
        rpc(uid(3 + i), "save_editor_snapshot", [
          MEETING,
          base.version,
          base.metadata,
          [...base.blocks, block("Agregada por " + i, 60)],
        ]),
      { successes: 1, error: /^Version conflict$/ },
    );
    const after = await rpc(uid(3), "get_editor_snapshot", [MEETING]);
    assert.equal(after.version, base.version + 1);
    assert.equal(after.blocks.length, base.blocks.length + 1);
    console.log(
      `  -> versión ${base.version}→${after.version}, bloques=${after.blocks.length} (esperado ${base.blocks.length + 1}), ganadores=${r.times.length}`,
    );
  }
  // S2b: 20 planificadores en 20 reuniones distintas a la vez
  {
    const ms = [];
    for (let i = 0; i < 20; i++)
      ms.push(
        await rpc(uid(3 + i), "create_editor_meeting", [
          ORG,
          meta("Paralela " + i, "2029-11-0" + ((i % 9) + 1)),
          null,
        ]),
      );
    await burst(
      "S2b 20 planificadores publican 20 reuniones distintas a la vez",
      20,
      (i) =>
        rpc(uid(3 + i), "publish_editor_snapshot", [
          ms[i].meetingId,
          ms[i].version,
          ms[i].metadata,
          Array.from({ length: 15 }, (_, k) => block("B" + k)),
        ]),
    );
  }
  // S2c: 30 guardados SQL secuenciales; NO prueba la cola de movimientos de la UI.
  {
    let cur = await rpc(uid(3), "get_editor_snapshot", [MEETING]);
    const times = [];
    for (let k = 0; k < 30; k++) {
      const t = performance.now();
      cur = await rpc(uid(3), "save_editor_snapshot", [
        MEETING,
        cur.version,
        cur.metadata,
        [...cur.blocks.slice(1), cur.blocks[0]],
      ]);
      times.push(performance.now() - t);
    }
    stats(
      "S2c 30 guardados secuenciales (reordenar) mismo borrador",
      times,
      [],
    );
    const rev = (
      await pool.query(
        `select count(*) n from public.meeting_revisions where meeting_id=$1`,
        [MEETING],
      )
    ).rows[0].n;
    console.log(`  -> revisiones acumuladas para la reunión: ${rev}`);
  }

  // ---------- S3 confirmaciones simultáneas ----------
  {
    const rows = (
      await pool.query(
        `select a.id,a.person_id,a.status,a.responded_at from public.assignments a where meeting_id=$1`,
        [MEETING],
      )
    ).rows;
    const byPerson = rows.map((a) => ({
      user: uid(Number(a.person_id.slice(-12))),
      person: a.person_id,
      exp: [{ id: a.id, status: a.status, respondedAt: a.responded_at }],
    }));
    await burst(
      `S3a ${byPerson.length} integrantes confirman a la vez`,
      byPerson.length,
      (i) =>
        rpc(byPerson[i].user, "respond_assignments", [
          MEETING,
          byPerson[i].person,
          i % 5 === 0 ? "unavailable" : "confirmed",
          JSON.stringify(byPerson[i].exp),
        ]),
    );
    const agg = (
      await pool.query(
        `select status,count(*) n from public.assignments where meeting_id=$1 group by 1`,
        [MEETING],
      )
    ).rows;
    assert.deepEqual(
      Object.fromEntries(agg.map((row) => [row.status, Number(row.n)])),
      {
        confirmed: byPerson.length - Math.ceil(byPerson.length / 5),
        unavailable: Math.ceil(byPerson.length / 5),
      },
    );
    console.log("  -> estado final:", JSON.stringify(agg));
    // S3b same person, two devices at once with same expected
    const a = (
      await pool.query(
        `select a.id,a.person_id,a.status,to_jsonb(a.responded_at) responded_at from public.assignments a where meeting_id=$1 and status='confirmed' limit 1`,
        [MEETING],
      )
    ).rows[0];
    const u = uid(Number(a.person_id.slice(-12)));
    const exp = JSON.stringify([
      { id: a.id, status: a.status, respondedAt: a.responded_at },
    ]);
    await burst(
      "S3b misma persona cambia su respuesta desde 2 dispositivos a la vez",
      2,
      (i) =>
        rpc(u, "respond_assignments", [
          MEETING,
          a.person_id,
          i ? "unavailable" : "pending",
          exp,
        ]),
      { successes: 1, error: /^Confirmation conflict$/ },
    );
    const ev = (
      await pool.query(
        `select count(*) n from public.assignment_events where assignment_id=$1`,
        [a.id],
      )
    ).rows[0].n;
    console.log(`  -> eventos de historial para esa asignación: ${ev}`);
  }

  // ---------- S4 modo en vivo ----------
  {
    let snap = await rpc(OP1, "get_live_snapshot", [MEETING]);
    const req = randomUUID();
    await burst(
      "S4a mismo 'iniciar' reintentado 10 veces en paralelo (mismo requestId)",
      10,
      () => rpc(OP1, "transition_live", [MEETING, snap.version, req, "start"]),
    );
    snap = await rpc(OP1, "get_live_snapshot", [MEETING]);
    assert.equal(snap.version, 1);
    assert.equal(snap.activeBlockId, snap.blocks[0].id);
    await burst(
      "S4b dos operadores pulsan 'siguiente' a la vez",
      2,
      (i) =>
        rpc(i ? OP2 : OP1, "transition_live", [
          MEETING,
          snap.version,
          randomUUID(),
          "next",
        ]),
      { successes: 1, error: /^Live version conflict$/ },
    );
    const after = await rpc(OP1, "get_live_snapshot", [MEETING]);
    assert.equal(after.version, snap.version + 1);
    assert.equal(
      after.blocks.findIndex((b) => b.id === after.activeBlockId),
      1,
    );
    console.log(
      `  -> activo=${after.blocks.findIndex((b) => b.id === after.activeBlockId) + 1} (esperado 2), versión ${snap.version}→${after.version}`,
    );
    // S4c: lectores masivos mientras operador avanza
    let cur = after;
    const opTimes = [];
    const readers = burst(
      `S4c ${N} lectores consultando en vivo mientras el operador avanza 8 bloques`,
      N * 5,
      (i) => rpc(uid(i % N), "get_live_snapshot", [MEETING]),
    );
    for (let k = 0; k < 8; k++) {
      const t = performance.now();
      cur = await rpc(OP1, "transition_live", [
        MEETING,
        cur.version,
        randomUUID(),
        "next",
      ]);
      opTimes.push(performance.now() - t);
    }
    await readers;
    assert.equal(cur.version, after.version + 8);
    assert.equal(
      cur.blocks.findIndex((b) => b.id === cur.activeBlockId),
      9,
    );
    stats("S4c tiempos del operador durante esa carga", opTimes, []);
  }
  // ---------- S5 interrupciones ----------
  {
    // S5a cliente se corta en medio de un guardado: matamos el backend durante la transacción
    const m = await rpc(uid(3), "create_editor_meeting", [
      ORG,
      meta("Corte"),
      null,
    ]);
    // Keep the intentionally killed backend OUT of the shared pool. A late
    // termination error must not masquerade as an unexpected idle-pool error.
    const c = new pg.Client({
      host: "127.0.0.1",
      port: 55432,
      user: "postgres",
      password: "pw",
      database: "postgres",
    });
    c.on("error", (error) => {
      if (error.code !== "57P01") {
        console.error(
          "Error inesperado en la conexión de corte:",
          error.message,
        );
        process.exitCode = 1;
      }
    });
    try {
      await c.connect();
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        uid(3),
      ]);
      await c.query("select public.save_editor_snapshot($1,$2,$3,$4)", [
        m.meetingId,
        m.version,
        m.metadata,
        JSON.stringify(Array.from({ length: 30 }, (_, k) => block("X" + k))),
      ]);
      const pidRow = (await c.query("select pg_backend_pid() p")).rows[0].p;
      const killed = await pool.query(
        "select pg_terminate_backend($1) killed",
        [pidRow],
      );
      assert.equal(killed.rows[0].killed, true);
    } finally {
      await c.end();
    }
    const after = await rpc(uid(3), "get_editor_snapshot", [m.meetingId]);
    assert.equal(after.version, m.version);
    assert.equal(after.blocks.length, 0);
    console.log(
      `\n## S5a corte de conexión a mitad de un guardado (sin COMMIT)\n  -> versión=${after.version} (esperado ${m.version}), bloques=${after.blocks.length} (esperado 0): ${after.version === m.version && after.blocks.length === 0 ? "ATÓMICO OK" : "FALLA"}`,
    );
    // S5b el operador envía 'siguiente', se corta antes de ver la respuesta, y reintenta con el mismo requestId
    const snap = await rpc(OP1, "get_live_snapshot", [MEETING]);
    const req = randomUUID();
    const first = await rpc(OP1, "transition_live", [
      MEETING,
      snap.version,
      req,
      "next",
    ]);
    const retry = await rpc(OP1, "transition_live", [
      MEETING,
      snap.version,
      req,
      "next",
    ]);
    assert.equal(first.version, snap.version + 1);
    assert.equal(retry.version, first.version);
    assert.equal(retry.activeBlockId, first.activeBlockId);
    console.log(
      `## S5b reintento tras perder la respuesta (mismo requestId)\n  -> primera v${first.version}, reintento v${retry.version}, mismo bloque=${first.activeBlockId === retry.activeBlockId}: ${first.version === retry.version ? "IDEMPOTENTE OK" : "FALLA (avanzó dos veces)"}`,
    );
    // S5c reintento con versión vieja y requestId nuevo (cliente que no sabe que se aplicó)
    await assert.rejects(
      () =>
        rpc(OP1, "transition_live", [
          MEETING,
          snap.version,
          randomUUID(),
          "next",
        ]),
      { message: "Live version conflict" },
    );
    console.log("## S5c versión vieja + requestId nuevo: rechazado, OK");
  }
  // ---------- S6 feedback dispatch concurrente ----------
  {
    let cur = await rpc(OP1, "get_live_snapshot", [MEETING]);
    await rpc(OP1, "transition_live", [
      MEETING,
      cur.version,
      randomUUID(),
      "close",
    ]);
    const expected = Number(
      (
        await pool.query(
          "select count(*) n from private.live_participants where meeting_id=$1",
          [MEETING],
        )
      ).rows[0].n,
    );
    assert(expected > 0, "Fixture sin participantes capturados");
    // adelantar el cierre 11 minutos para que venza
    const due = await pool.query(
      `update public.meeting_live_state set closed_at=closed_at-interval '11 minutes' where meeting_id=$1 returning meeting_id`,
      [MEETING],
    );
    assert.equal(due.rowCount, 1);
    const t0 = performance.now();
    await Promise.all(
      Array.from({ length: 8 }, () =>
        pool.query("select private.dispatch_due_feedback()"),
      ),
    );
    const n = (
      await pool.query(
        `select count(*) n, count(distinct user_id) u from private.feedback_requests where meeting_id=$1`,
        [MEETING],
      )
    ).rows[0];
    const notifications = Number(
      (
        await pool.query(
          "select count(*) n from public.personal_notifications n join private.feedback_requests r on r.id=n.feedback_request_id where r.meeting_id=$1",
          [MEETING],
        )
      ).rows[0].n,
    );
    checkFeedbackCounts(expected, Number(n.n), Number(n.u), notifications);
    console.log(
      `\n## S6 8 despachos de feedback simultáneos (${(performance.now() - t0).toFixed(0)}ms)\n  -> solicitudes=${n.n}, usuarios distintos=${n.u}: ${n.n === n.u ? "SIN DUPLICADOS" : "DUPLICADOS"}`,
    );
  }
} finally {
  await pool.end();
}
assert.equal(
  process.exitCode ?? 0,
  0,
  "Se registraron errores de infraestructura",
);
console.log("\nTodos los escenarios de estrés cumplieron sus aserciones.");

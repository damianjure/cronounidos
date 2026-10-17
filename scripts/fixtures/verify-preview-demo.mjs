// Local, in-memory validation only. Never connects to Supabase or reads credentials.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `create role service_role nologin;create role supabase_realtime_admin nologin;create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
);
for (const file of readdirSync("supabase/migrations").sort())
  await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
const sql = readFileSync(
  "scripts/fixtures/preview-demo-2026-10-17.sql",
  "utf8",
);
const d = JSON.parse(sql.split("$data$")[1]);
const actor = "00000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users(id) values($1)", [actor]);
await db.query(
  "insert into public.organizations(id,name,slug) values($1,'Fixture local','unidos')",
  [d.org],
);
for (const m of d.meetings) {
  await db.query(
    "insert into public.meetings(id,org_id,title,date,start_local_time) values($1,$2,$3,$4,$5)",
    [m.id, d.org, m.title, m.date, m.time],
  );
  const {
    rows: [r],
  } = await db.query(
    "insert into public.meeting_revisions(org_id,meeting_id,revision,created_by,scheduled_start,title,local_date,start_local_time) values($1,$2,1,$3,$4,$5,$6,$7) returning id",
    [
      d.org,
      m.id,
      actor,
      m.date + "T" + m.time + ":00-03:00",
      m.title,
      m.date,
      m.time,
    ],
  );
  await db.query(
    "update public.meetings set draft_revision_id=$1 where id=$2",
    [r.id, m.id],
  );
}
// Fail before inserting anything if the organization or draft state differs.
await db.query(
  "update public.organizations set slug='wrong-target' where id=$1",
  [d.org],
);
await assert.rejects(db.exec(sql), /Wrong organization/);
await db.exec("rollback");
await db.query("update public.organizations set slug='unidos' where id=$1", [
  d.org,
]);
await db.query("update public.meetings set version=2 where id=$1", [
  d.meetings[0].id,
]);
await assert.rejects(db.exec(sql), /already populated or edited/);
await db.exec("rollback");
assert.equal(
  (await db.query("select count(*)::int as n from people")).rows[0].n,
  0,
);
await db.query("update public.meetings set version=1 where id=$1", [
  d.meetings[0].id,
]);
await db.exec(sql);
let {
  rows: [counts],
} = await db.query(
  `select (select count(*)::int from people) people,(select count(*)::int from teams) teams,(select count(*)::int from roles) roles,(select count(*)::int from team_memberships) memberships,(select count(*)::int from meeting_blocks) blocks,(select count(*)::int from block_subactivities) parallel,(select count(*)::int from meeting_required_positions) positions,(select count(*)::int from assignments) assignments,(select count(*)::int from assignments where status<>'pending') nonpending,(select count(*)::int from meetings where published_revision_id is not null) published`,
);
assert.deepEqual(counts, {
  people: 20,
  teams: 6,
  roles: 20,
  memberships: 20,
  blocks: 24,
  parallel: 3,
  positions: 14,
  assignments: 51,
  nonpending: 0,
  published: 0,
});
const { rows: plans } = await db.query(
  "select m.title,count(b.id)::int as blocks,(sum(b.duration_seconds)/60)::int as minutes from meetings m join meeting_blocks b on b.revision_id=m.draft_revision_id group by m.id order by m.title",
);
assert.deepEqual(
  plans.map((p) => [p.blocks, p.minutes]),
  [
    [12, 120],
    [8, 75],
    [4, 45],
  ],
);
let failed = false;
try {
  await db.exec(sql);
} catch (e) {
  failed = /already populated or edited/.test(e.message);
  await db.exec("rollback");
}
assert.ok(failed, "rerun must fail closed");
assert.equal(
  (await db.query("select count(*)::int as n from people")).rows[0].n,
  20,
);
console.log(
  JSON.stringify(
    { counts, plans, rerun: "rejected without duplicates" },
    null,
    2,
  ),
);
await db.close();

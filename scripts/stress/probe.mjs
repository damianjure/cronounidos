import pg from "pg";
const c = new pg.Client({ host: "127.0.0.1", port: 55432, user: "postgres", password: "pw", database: "postgres" }); await c.connect();
const ORG = "10000000-0000-4000-8000-000000000001";
const M = (await c.query(`select id from public.meetings where title='Reunión de estrés'`)).rows[0].id;
for (const n of [50, 200, 950]) {
  await c.query("begin");
  await c.query(`delete from public.assignment_events where assignment_id in (select id from public.assignments where meeting_id=$1 and position_id in (select id from public.meeting_required_positions where meeting_id=$1 and quantity_index>$2))`, [M, n]);
  await c.query(`delete from public.block_assignment_links where assignment_id in (select id from public.assignments where meeting_id=$1 and position_id in (select id from public.meeting_required_positions where meeting_id=$1 and quantity_index>$2))`, [M, n]).catch(()=>{});
  await c.query(`delete from public.assignments where meeting_id=$1 and position_id in (select id from public.meeting_required_positions where meeting_id=$1 and quantity_index>$2)`, [M, n]);
  await c.query(`delete from public.meeting_required_positions where meeting_id=$1 and quantity_index>$2`, [M, n]);
  await c.query("set local role authenticated"); await c.query("select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000003',true)");
  for (const [name, sql, args] of [["calendar_overview", "select public.calendar_overview($1,'2029-10-01','2029-10-31')", [ORG]], ["get_meeting_confirmations", "select public.get_meeting_confirmations($1)", [M]], ["coverage_matrix", "select public.coverage_matrix($1,'2029-10-01','2029-10-31')", [ORG]], ["get_meeting_staffing", "select public.get_meeting_staffing($1)", [M]], ["get_staffing_conflicts", "select public.get_staffing_conflicts($1)", [M]]]) {
    await c.query('savepoint s'); const t = performance.now(); try { await c.query(sql, args); await c.query('release savepoint s'); console.log(`${n} puestos  ${name}: ${(performance.now() - t).toFixed(0)}ms`); } catch (e) { await c.query('rollback to savepoint s'); console.log(`${n} ${name}: ERR ${e.message.slice(0,60)}`); }
  }
  await c.query("rollback");
}
await c.end();

import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, readdirSync, rmSync } from "node:fs";
const ROOT = process.env.CRONO_ROOT || process.cwd();
const DIR = process.env.PGDATA_DIR || "/tmp/crono-stress-pgdata";
rmSync(DIR, { recursive: true, force: true });
const server = new EmbeddedPostgres({ databaseDir: DIR, user: "postgres", password: "pw", port: 55432, persistent: false,
  postgresFlags: ["-c", "max_connections=300", "-c", "shared_buffers=128MB"] });
await server.initialise(); await server.start();
const c = new pg.Client({ host: "127.0.0.1", port: 55432, user: "postgres", password: "pw", database: "postgres" });
await c.connect();
await c.query(`create role service_role nologin;create role supabase_realtime_admin nologin;create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
for (const f of readdirSync(ROOT + "/supabase/migrations").sort()) await c.query(readFileSync(ROOT + "/supabase/migrations/" + f, "utf8"));
await c.query(readFileSync(ROOT + "/supabase/seed.sql", "utf8"));
console.log("migraciones aplicadas");
await c.end();
process.on("SIGTERM", async () => { await server.stop(); process.exit(0); });
setInterval(() => {}, 1 << 30);

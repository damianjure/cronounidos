import { readFileSync, readdirSync } from "node:fs";
import { createStressDirectory } from "./safety.mjs";
const ROOT = process.env.CRONO_ROOT || process.cwd();
// Reject unsafe overrides BEFORE importing optional binaries or doing any I/O
// against PostgreSQL. Startup never deletes a pre-existing directory.
const directory = createStressDirectory();
let server;
let started = false;
let stopping;
function stop() {
  return (stopping ??= (async () => {
    if (started) await server.stop();
    // If stop fails, leave files for diagnosis rather than erase live PGDATA.
    directory.cleanup();
  })());
}
try {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const { default: pg } = await import("pg");
  server = new EmbeddedPostgres({
    databaseDir: directory.path,
    user: "postgres",
    password: "pw",
    port: 55432,
    persistent: false,
    postgresFlags: ["-c", "max_connections=300", "-c", "shared_buffers=128MB"],
  });
  await server.initialise();
  await server.start();
  started = true;
  const c = new pg.Client({
    host: "127.0.0.1",
    port: 55432,
    user: "postgres",
    password: "pw",
    database: "postgres",
  });
  try {
    await c.connect();
    await c.query(
      `create role service_role nologin;create role supabase_realtime_admin nologin;create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
    );
    for (const f of readdirSync(ROOT + "/supabase/migrations").sort())
      await c.query(readFileSync(ROOT + "/supabase/migrations/" + f, "utf8"));
    await c.query(readFileSync(ROOT + "/supabase/seed.sql", "utf8"));
  } finally {
    await c.end();
  }
} catch (error) {
  await stop();
  throw error;
}
console.log(
  "Migraciones aplicadas; PostgreSQL de estrés listo en 127.0.0.1:55432.",
);
const keepAlive = setInterval(() => {}, 1 << 30);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    void stop().then(
      () => {
        clearInterval(keepAlive);
      },
      (error) => {
        console.error(
          "No se pudo detener PostgreSQL de estrés:",
          error.message,
        );
        clearInterval(keepAlive);
        process.exitCode = 1;
      },
    );
  });

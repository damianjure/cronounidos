import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

// Contrato de seguridad: toda función SECURITY DEFINER expuesta en `public`
// debe fijar search_path vacío, no ser ejecutable por anon (salvo la agenda
// pública) y, si authenticated puede ejecutarla, contener una guarda explícita.
// Agregar una excepción exige justificarla aquí y en docs/DATABASE.md.
const anonAllowed = new Set(["public_agenda"]);
const guardExempt = new Map([
  ["public_agenda", "proyección pública mínima aprobada (DECISIONS 6)"],
]);
const guard = /private\.\w+\s*\(|auth\.uid\s*\(\s*\)/i;

let db: PGlite;
type Fn = {
  name: string;
  signature: string;
  config: string[] | null;
  src: string;
  anon: boolean;
  authenticated: boolean;
};
let fns: Fn[] = [];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role service_role nologin;create role supabase_realtime_admin nologin;create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
  );
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  const { rows } = await db.query<Fn>(
    `select p.proname as name, p.oid::regprocedure::text as signature, p.proconfig as config, p.prosrc as src,
            has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
      order by 2`,
  );
  fns = rows;
});
afterAll(async () => {
  await db.close();
});

describe("contrato SECURITY DEFINER en public", () => {
  it("encuentra las funciones a auditar", () => {
    expect(fns.length).toBeGreaterThan(0);
  });
  it("todas fijan search_path vacío", () => {
    const bad = fns
      .filter(
        (f) => !(f.config ?? []).some((c) => /^search_path=(""|)$/.test(c)),
      )
      .map((f) => f.signature);
    expect(bad).toEqual([]);
  });
  it("anon solo ejecuta las funciones públicas aprobadas", () => {
    const bad = fns
      .filter((f) => f.anon && !anonAllowed.has(f.name))
      .map((f) => f.signature);
    expect(bad).toEqual([]);
  });
  it("las ejecutables por authenticated tienen una guarda explícita", () => {
    const bad = fns
      .filter(
        (f) =>
          (f.authenticated || f.anon) &&
          !guardExempt.has(f.name) &&
          !guard.test(f.src),
      )
      .map((f) => f.signature);
    expect(bad).toEqual([]);
  });
});

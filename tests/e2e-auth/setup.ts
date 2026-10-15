import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const email = "e2e-admin@cronounidos.invalid";

export default async function setup() {
  const url = process.env.E2E_SUPABASE_URL!;
  const service = process.env.E2E_SERVICE_ROLE_KEY!;
  const password = process.env.E2E_TEST_PASSWORD!;
  const dbUrl = process.env.E2E_DB_URL!;
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: users, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  let userId = users.users.find((user) => user.email === email)?.id;
  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (error) throw error;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { display_name: "Admin E2E ficticio" },
    });
    if (error || !data.user) throw error ?? new Error("No se creó el usuario E2E.");
    userId = data.user.id;
  }
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("UUID Auth inválido.");
  const sql = `begin;
insert into public.organizations(name,slug,timezone) values('Organización E2E ficticia','crono-e2e','America/Argentina/Buenos_Aires') on conflict(slug) do nothing;
insert into public.memberships(org_id,user_id,status) select id,'${userId}'::uuid,'approved' from public.organizations where slug='crono-e2e' on conflict(org_id,user_id) do update set status='approved';
update public.profiles set approved_at=now() where user_id='${userId}'::uuid;
insert into public.permission_grants(org_id,subject_user_id,permission) select id,'${userId}'::uuid,'administer' from public.organizations where slug='crono-e2e' on conflict do nothing;
commit;`;
  try {
    execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], { stdio: "pipe" });
  } catch {
    throw new Error("No se pudo preparar la organización E2E local. Revisá que psql y las migraciones estén disponibles.");
  }
}

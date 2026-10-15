import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

export default async function cleanup() {
  const dbUrl = process.env.E2E_DB_URL!;
  let orgId: string;
  try {
    orgId = execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-Atc", "select id from public.organizations where slug='crono-e2e'"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("No se pudo identificar la organización E2E local con psql.");
  }
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) throw new Error("No se pudo identificar la organización E2E local.");
  const admin = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const storage = admin.storage.from("crono-resources");
  const { data: files, error: listError } = await storage.list(orgId, { limit: 1000 });
  if (listError) throw listError;
  if (files?.length) {
    const { error } = await storage.remove(files.map((file) => `${orgId}/${file.name}`));
    if (error) throw error;
  }
  const tables = [
    "assignment_conflict_exceptions", "assignment_events", "block_assignment_links",
    "assignments", "meeting_required_positions", "resource_links",
    "block_announcements", "block_messages", "block_songs", "block_subactivities", "block_details",
    "meeting_blocks", "meeting_revisions", "meetings", "meeting_templates",
    "messages", "resources", "songs", "announcements", "block_types", "series", "meeting_types",
    "team_memberships", "roles", "teams", "people",
  ];
  const sql = `begin;
update public.meetings set status='cancelled', published_revision_id=null, draft_revision_id=null where org_id='${orgId}'::uuid;
${tables.map((table) => `delete from public.${table} where org_id='${orgId}'::uuid;`).join("\n")}
commit;`;
  try {
    execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], { stdio: "pipe" });
  } catch {
    throw new Error("No se pudo limpiar el fixture E2E local; revisá las dependencias de los registros ficticios.");
  }
}

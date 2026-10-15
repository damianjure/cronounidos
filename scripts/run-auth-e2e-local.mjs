import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

let status;
try {
  status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" }));
} catch {
  throw new Error("No se pudo leer el estado de Supabase local. Iniciá el stack antes de correr la suite.");
}
const url = status.API_URL;
const db = status.DB_URL;
if (!/^http:\/\/127\.0\.0\.1:54321\/?$/.test(url) || !/^postgresql?:\/\/[^@]+@127\.0\.0\.1:54322\/postgres(?:\?.*)?$/.test(db))
  throw new Error("El stack Supabase local no está en los puertos esperados.");
const env = {
  ...process.env,
  E2E_SUPABASE_URL: url,
  E2E_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  E2E_DB_URL: db,
  E2E_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  E2E_TEST_PASSWORD: randomBytes(24).toString("base64url"),
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  APP_URL: "http://127.0.0.1:3101",
  NEXT_BUILD_DIR: ".next-auth-e2e",
};
for (const [command, args] of [["npm", ["run", "build"]], ["npx", ["playwright", "test", "--config", "playwright.authenticated.config.ts"]]]) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

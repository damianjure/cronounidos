import { defineConfig, devices } from "@playwright/test";

const url = process.env.E2E_SUPABASE_URL;
const key = process.env.E2E_PUBLISHABLE_KEY;
const db = process.env.E2E_DB_URL;
const service = process.env.E2E_SERVICE_ROLE_KEY;
const password = process.env.E2E_TEST_PASSWORD;
if (!url || !key || !db || !service || !password)
  throw new Error("Falta configuración E2E local de Supabase. Usá npm run test:e2e:auth:local.");
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(url) || !/^postgresql?:\/\/(postgres(?::[^@]+)?@)?(127\.0\.0\.1|localhost):54322\/postgres(?:\?.*)?$/.test(db))
  throw new Error("La suite autenticada solo admite el Supabase local en 54321/54322.");

const port = 3101;
export default defineConfig({
  testDir: "tests/e2e-auth",
  globalSetup: "./tests/e2e-auth/setup.ts",
  globalTeardown: "./tests/e2e-auth/cleanup.ts",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: process.env.E2E_REPORT_DIR || "/tmp/crono-auth-e2e-report" }]],
  outputDir: process.env.E2E_OUTPUT_DIR || "/tmp/crono-auth-e2e-results",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
  projects: [
    { name: "desktop-auth", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-auth", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: `npm run start -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      APP_URL: `http://127.0.0.1:${port}`,
    },
  },
});

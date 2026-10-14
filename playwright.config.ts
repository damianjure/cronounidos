import { defineConfig, devices } from "@playwright/test";
const e2ePort = Number(process.env.E2E_PORT || "3100");
if (!Number.isInteger(e2ePort) || e2ePort < 1 || e2ePort > 65535)
  throw new Error("E2E_PORT debe ser un puerto válido.");
const baseURL = `http://127.0.0.1:${e2ePort}`;
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: process.env.E2E_OUTPUT_DIR || "test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: process.env.E2E_REPORT_DIR || "playwright-report",
      },
    ],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: `npm run start -- --port ${e2ePort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    },
  },
});

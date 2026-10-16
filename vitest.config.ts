import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    fsModuleCache: false,
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      include: [
        "src/lib/domain.ts",
        "src/lib/confirmations/model.ts",
        "src/lib/calendar/model.ts",
        "src/lib/staffing/model.ts",
        "src/lib/staffing/coverage.ts",
        "src/lib/editor/model.ts",
        "src/lib/editor/transaction.ts",
        "src/lib/env.ts",
        "src/lib/auth.ts",
        "src/lib/auth-validation.ts",
        "src/app/auth/actions.ts",
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});

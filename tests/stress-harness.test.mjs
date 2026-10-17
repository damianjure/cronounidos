import { it, expect } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createStressDirectory } from "../scripts/stress/safety.mjs";
import { checkBurst, checkFeedbackCounts } from "../scripts/stress/checks.mjs";
it("rechaza PGDATA_DIR y nunca toca una carpeta ajena", () => {
  const dir = mkdtempSync(join(tmpdir(), "crono-test-preserve-"));
  try {
    writeFileSync(join(dir, "sentinel"), "preservar");
    expect(() => createStressDirectory({ PGDATA_DIR: dir })).toThrow(
      /PGDATA_DIR/,
    );
    expect(readFileSync(join(dir, "sentinel"), "utf8")).toBe("preservar");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("cada ejecución posee un directorio temporal distinto y limpia solo el propio", () => {
  const a = createStressDirectory({}),
    b = createStressDirectory({});
  try {
    expect(a.path).not.toBe(b.path);
    a.cleanup();
    a.cleanup();
    expect(existsSync(a.path)).toBe(false);
    expect(existsSync(b.path)).toBe(true);
  } finally {
    a.cleanup();
    b.cleanup();
  }
});
it("setup rechaza PGDATA_DIR antes de cargar PostgreSQL o borrar nada", () => {
  const dir = mkdtempSync(join(tmpdir(), "crono-test-setup-"));
  try {
    writeFileSync(join(dir, "sentinel"), "preservar");
    const run = spawnSync(process.execPath, ["scripts/stress/setup.mjs"], {
      encoding: "utf8",
      env: { ...process.env, PGDATA_DIR: dir },
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("PGDATA_DIR");
    expect(readFileSync(join(dir, "sentinel"), "utf8")).toBe("preservar");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("burst exige todos los éxitos salvo conflictos explícitamente previstos", () => {
  expect(() => checkBurst(2, 2, [])).not.toThrow();
  expect(() => checkBurst(2, 1, ["Forbidden"])).toThrow();
  expect(() => checkBurst(2, 0, ["network", "network"])).toThrow();
  expect(() =>
    checkBurst(20, 1, Array(19).fill("Version conflict"), {
      successes: 1,
      error: /^Version conflict$/,
    }),
  ).not.toThrow();
  expect(() =>
    checkBurst(20, 1, Array(19).fill("Forbidden"), {
      successes: 1,
      error: /^Version conflict$/,
    }),
  ).toThrow();
  expect(() =>
    checkBurst(20, 2, Array(18).fill("Version conflict"), {
      successes: 1,
      error: /^Version conflict$/,
    }),
  ).toThrow();
});
it("feedback requiere destinatarios positivos, completos y notificados", () => {
  expect(() => checkFeedbackCounts(3, 3, 3, 3)).not.toThrow();
  for (const counts of [
    [0, 0, 0, 0],
    [3, 0, 0, 0],
    [3, 2, 2, 2],
    [3, 4, 3, 3],
    [3, 3, 3, 2],
    [3, 3, 2, 3],
  ])
    expect(() => checkFeedbackCounts(...counts)).toThrow();
});
it("una aserción fallida produce exit code no cero, no solo un mensaje", () => {
  const script = `import {checkFeedbackCounts} from './scripts/stress/checks.mjs'; checkFeedbackCounts(3,0,0,0);`;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    { encoding: "utf8" },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("AssertionError");
});

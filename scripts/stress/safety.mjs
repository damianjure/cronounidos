import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Never interpret inherited PGDATA_DIR as permission to erase existing data.
export function createStressDirectory(env = process.env) {
  if (env.PGDATA_DIR !== undefined)
    throw new Error(
      "PGDATA_DIR no está permitido: el estrés usa un directorio temporal exclusivo.",
    );
  const path = mkdtempSync(join(tmpdir(), "crono-stress-"));
  return {
    path,
    // Closure owns this exact mkdtemp result; no caller-supplied cleanup path.
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
}

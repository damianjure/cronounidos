import type { EditorSnapshot } from "./model";
export async function optimisticSave(
  before: EditorSnapshot,
  next: EditorSnapshot,
  save: (s: EditorSnapshot) => Promise<EditorSnapshot>,
  commit: (s: EditorSnapshot) => void,
) {
  commit(next);
  try {
    const persisted = await save(next);
    commit(persisted);
    return { ok: true as const, snapshot: persisted };
  } catch (error) {
    commit(before);
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "No se pudo guardar.",
    };
  }
}

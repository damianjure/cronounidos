import { snapshotSchema, type EditorSnapshot } from "./model";

/** Template instances are detached from every revision and confirmation. */
export function templateBlocks(snapshot: EditorSnapshot) {
  const valid = snapshotSchema.parse(snapshot);
  return valid.blocks.map((block) => ({
    ...block,
    id: null,
    clientKey: crypto.randomUUID(),
    responsibles: block.responsibles.map((responsible) => ({
      ...responsible,
      assignmentId: null,
    })),
    subactivities: block.subactivities.map((sub) => ({
      ...sub,
      clientKey: crypto.randomUUID(),
    })),
  }));
}

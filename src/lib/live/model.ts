import { z } from "zod";
const instant = z.iso.datetime({ offset: true });
export const liveSnapshot = z.object({
  meetingId: z.uuid(),
  title: z.string(),
  revisionId: z.uuid(),
  timezone: z.string(),
  version: z.number().int().nonnegative(),
  status: z.enum(["ready", "running", "finished"]),
  canOperate: z.boolean(),
  startedAt: instant.nullable(),
  closedAt: instant.nullable(),
  activeBlockId: z.uuid().nullable(),
  serverNow: instant,
  blocks: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      durationSeconds: z.number().int().nonnegative(),
      plannedStart: instant,
      actualStart: instant.nullable(),
      actualEnd: instant.nullable(),
      status: z.enum(["pending", "running", "finished"]),
    }),
  ),
});
export type LiveSnapshot = z.infer<typeof liveSnapshot>;
export const liveCommand = z.object({
  meetingId: z.uuid(),
  version: z.number().int().nonnegative(),
  requestId: z.uuid(),
  command: z.enum(["start", "next", "finish_block", "close"]),
});
export function liveTiming(snapshot: LiveSnapshot, now: number) {
  if (!Number.isFinite(now)) throw new Error("Reloj inválido");
  let cursor = snapshot.closedAt
    ? Date.parse(snapshot.closedAt)
    : snapshot.status === "ready" && snapshot.blocks[0]
      ? Date.parse(snapshot.blocks[0].plannedStart)
      : now;
  const blocks = snapshot.blocks.map((block) => {
    const start = block.actualStart ? Date.parse(block.actualStart) : cursor;
    const elapsed = block.actualStart
      ? Math.max(
          0,
          ((block.actualEnd
            ? Date.parse(block.actualEnd)
            : snapshot.closedAt
              ? Date.parse(snapshot.closedAt)
              : now) -
            start) /
            1000,
        )
      : 0;
    const end = block.actualEnd
      ? Date.parse(block.actualEnd)
      : block.actualStart
        ? Math.max(cursor, start + block.durationSeconds * 1000)
        : start + block.durationSeconds * 1000;
    if (block.status !== "finished") cursor = end;
    return {
      ...block,
      elapsedSeconds: Math.floor(elapsed),
      deviationSeconds: Math.round(
        (start - Date.parse(block.plannedStart)) / 1000,
      ),
      estimatedStart: start,
      estimatedEnd: end,
    };
  });
  return {
    blocks,
    eta:
      snapshot.status === "finished" ? Date.parse(snapshot.closedAt!) : cursor,
  };
}
export function durationLabel(seconds: number) {
  const rounded = Math.floor(Math.abs(seconds));
  return `${seconds < 0 ? "−" : ""}${String(Math.floor(rounded / 3600)).padStart(2, "0")}:${String(Math.floor(rounded / 60) % 60).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

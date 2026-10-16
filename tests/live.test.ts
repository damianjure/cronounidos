import { it, expect } from "vitest";
import {
  durationLabel,
  liveTiming,
  type LiveSnapshot,
  liveCommand,
} from "@/lib/live/model";
const base = Date.parse("2026-10-18T13:00:00Z");
const time = (seconds: number) => new Date(base + seconds * 1000).toISOString();
function fixture(): LiveSnapshot {
  return {
    meetingId: crypto.randomUUID(),
    revisionId: crypto.randomUUID(),
    title: "Ficticia",
    timezone: "America/Argentina/Buenos_Aires",
    version: 0,
    status: "ready",
    canOperate: true,
    startedAt: null,
    closedAt: null,
    activeBlockId: null,
    serverNow: time(0),
    blocks: [600, 300].map((durationSeconds, i) => ({
      id: crypto.randomUUID(),
      name: "Actividad",
      durationSeconds,
      plannedStart: time(i * 600),
      actualStart: null,
      actualEnd: null,
      status: "pending",
    })),
  };
}
it("antes de iniciar conserva horarios planificados aunque el servidor consulte antes", () => {
  const s = fixture();
  const t = liveTiming(s, base - 3600000);
  expect(t.eta).toBe(base + 900000);
  expect(t.blocks[0].estimatedStart).toBe(base);
});
it("demora real recalcula ETA y no da por finalizada una actividad vencida", () => {
  const s = fixture();
  s.status = "running";
  s.startedAt = time(60);
  s.blocks[0].actualStart = time(60);
  s.blocks[0].status = "running";
  s.activeBlockId = s.blocks[0].id;
  const t = liveTiming(s, base + 700000);
  expect(t.blocks[0].elapsedSeconds).toBe(640);
  expect(t.blocks[0].deviationSeconds).toBe(60);
  expect(t.blocks[1].estimatedStart).toBe(base + 700000);
  expect(t.eta).toBe(base + 1000000);
});
it("adelanto y cierre usan instantes reales; el reloj no retrocede bajo cero", () => {
  const s = fixture();
  s.status = "finished";
  s.startedAt = time(-30);
  s.closedAt = time(500);
  s.blocks[0].actualStart = time(-30);
  s.blocks[0].actualEnd = time(500);
  s.blocks[0].status = "finished";
  const t = liveTiming(s, base + 9000000);
  expect(t.eta).toBe(base + 500000);
  expect(t.blocks[0].elapsedSeconds).toBe(530);
  expect(t.blocks[0].deviationSeconds).toBe(-30);
  expect(durationLabel(-65)).toBe("−00:01:05");
  expect(durationLabel(3661)).toBe("01:01:01");
  expect(() => liveTiming(s, NaN)).toThrow();
});
it("transiciones exigen token y versión válida", () => {
  expect(
    liveCommand.safeParse({
      meetingId: crypto.randomUUID(),
      version: 0,
      requestId: crypto.randomUUID(),
      command: "start",
    }).success,
  ).toBe(true);
  expect(
    liveCommand.safeParse({ version: -1, command: "rewind" }).success,
  ).toBe(false);
});

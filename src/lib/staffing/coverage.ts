import { z } from "zod";
export const matrixRows = z.array(
  z.object({
    meetingId: z.uuid(),
    teamId: z.uuid(),
    teamName: z.string(),
    roleId: z.uuid(),
    roleName: z.string(),
    priority: z.enum(["critical", "required", "optional"]),
    status: z.enum(["pending", "confirmed", "unavailable"]).nullable(),
  }),
);
export type MatrixRow = z.infer<typeof matrixRows>[number];
export function matrixSummary(rows: MatrixRow[]) {
  const required = rows.filter((r) => r.priority !== "optional");
  const confirmed = required.filter((r) => r.status === "confirmed").length;
  const criticalMissing = required.some(
    (r) => r.priority === "critical" && r.status !== "confirmed",
  );
  const percentage = required.length
    ? (confirmed / required.length) * 100
    : null;
  const color =
    percentage === null
      ? "gray"
      : percentage < 60
        ? "red"
        : percentage < 90 || criticalMissing
          ? "yellow"
          : "green";
  const label =
    percentage === null
      ? "Sin requeridos"
      : `${confirmed}/${required.length} confirmados${criticalMissing ? " · Falta crítico" : ""}`;
  return { label, color };
}

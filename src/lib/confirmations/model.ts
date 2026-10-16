import { z } from "zod";
export const confirmationStatus = z.enum(["pending", "confirmed", "unavailable"]);
export const confirmationLabels = {
  pending: "Pendiente", confirmed: "Confirmado", unavailable: "No disponible",
} as const;
export const expectedConfirmation = z.object({
  id: z.uuid(), status: confirmationStatus,
  respondedAt: z.string().datetime({ offset: true }).nullable(),
});
export const confirmationRequest = z.object({
  meetingId: z.uuid(), personId: z.uuid(), status: confirmationStatus,
  expected: z.array(expectedConfirmation).min(1).max(100),
}).superRefine((value, context) => {
  if (new Set(value.expected.map(row => row.id.toLowerCase())).size !== value.expected.length)
    context.addIssue({ code: "custom", path: ["expected"], message: "Hay asignaciones repetidas." });
});
export const confirmationMeetingList = z.array(z.object({ id: z.uuid(), title: z.string(), date: z.string() }));
export const confirmationSnapshot = z.object({
  meetingId: z.uuid(), title: z.string(), date: z.string(),
  assignments: z.array(expectedConfirmation.extend({
    personId: z.uuid(), personName: z.string(), teamName: z.string().nullable(), roleName: z.string().nullable(),
    activity: z.string(),
    history: z.array(z.object({
      event: z.string(), at: z.string().datetime({ offset: true }),
      status: confirmationStatus.nullable(), previousStatus: confirmationStatus.nullable(),
    })),
  })),
});
export type ConfirmationRow = z.infer<typeof confirmationSnapshot>["assignments"][number];
export function expectedRows(rows: ConfirmationRow[]) {
  return rows.map(({ id, status, respondedAt }) => ({ id, status, respondedAt }));
}
export function groupByPerson(rows: ConfirmationRow[]) {
  const groups = new Map<string, { personId: string; name: string; rows: ConfirmationRow[] }>();
  for (const row of rows) {
    const group = groups.get(row.personId) ?? { personId: row.personId, name: row.personName, rows: [] };
    group.rows.push(row);
    groups.set(row.personId, group);
  }
  return [...groups.values()];
}

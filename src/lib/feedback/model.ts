import { z } from "zod";
export const feedbackCategory = z.enum([
  "all_good",
  "problem",
  "pending",
  "suggestion",
]);
export const feedbackLabels: Record<
  z.infer<typeof feedbackCategory>,
  string
> = {
  all_good: "Todo bien",
  problem: "Hubo problema",
  pending: "Algo pendiente",
  suggestion: "Sugerencia",
};
export const feedbackSubmission = z.strictObject({
  requestId: z.uuid(),
  category: feedbackCategory,
  comment: z.string().trim().max(500).nullable(),
});
export const ownFeedbackRequests = z.array(
  z.strictObject({
    id: z.uuid(),
    meetingId: z.uuid(),
    title: z.string(),
    dueAt: z.iso.datetime({ offset: true }),
    submittedAt: z.iso.datetime({ offset: true }).nullable(),
  }),
);
export const adminFeedbackRows = z.array(
  z.strictObject({
    requestId: z.uuid(),
    personId: z.uuid().nullable(),
    userId: z.uuid().nullable(),
    submittedAt: z.iso.datetime({ offset: true }).nullable(),
    category: feedbackCategory.nullable(),
    // PostgreSQL char_length counts Unicode code points, not UTF-16 units.
    comment: z
      .string()
      .refine((value) => [...value].length <= 500)
      .nullable(),
  }),
);
export function feedbackTotals(rows: z.infer<typeof adminFeedbackRows>) {
  return {
    requested: rows.length,
    submitted: rows.filter((r) => r.submittedAt !== null).length,
    categories: Object.fromEntries(
      feedbackCategory.options.map((category) => [
        category,
        rows.filter((r) => r.category === category).length,
      ]),
    ) as Record<z.infer<typeof feedbackCategory>, number>,
  };
}

import { describe, it, expect } from "vitest";
import {
  feedbackSubmission,
  ownFeedbackRequests,
  adminFeedbackRows,
  feedbackTotals,
} from "@/lib/feedback/model";
const id = "00000000-0000-4000-8000-000000000001";
describe("contratos de feedback", () => {
  it("categorías cerradas y comentario opcional breve", () => {
    expect(
      feedbackSubmission.parse({
        requestId: id,
        category: "all_good",
        comment: null,
      }).comment,
    ).toBeNull();
    expect(
      feedbackSubmission.parse({
        requestId: id,
        category: "problem",
        comment: "  Prueba  ",
      }).comment,
    ).toBe("Prueba");
    for (const payload of [
      { requestId: id, category: "otra", comment: null },
      { requestId: id, category: "pending", comment: "a".repeat(501) },
      { requestId: id, category: "suggestion", comment: null, userId: id },
    ])
      expect(feedbackSubmission.safeParse(payload).success).toBe(false);
  });
  it("DTO propio rechaza texto privado incluso si un RPC cambia por error", () => {
    const request = {
      id,
      meetingId: id,
      title: "Ficticia",
      dueAt: "2026-10-16T20:00:00+00:00",
      submittedAt: null,
    };
    expect(ownFeedbackRequests.parse([request])).toHaveLength(1);
    for (const key of ["comment", "category", "personId", "userId"])
      expect(
        ownFeedbackRequests.safeParse([{ ...request, [key]: "privado" }])
          .success,
      ).toBe(false);
  });
  it("estadísticas administrativas distinguen pendientes y categorías", () => {
    const rows = adminFeedbackRows.parse([
      {
        requestId: id,
        personId: null,
        userId: id,
        submittedAt: "2026-10-16T20:00:00Z",
        category: "problem",
        comment: "Ficticio",
      },
      {
        requestId: id,
        personId: id,
        userId: null,
        submittedAt: null,
        category: null,
        comment: null,
      },
    ]);
    expect(feedbackTotals(rows)).toEqual({
      requested: 2,
      submitted: 1,
      categories: { all_good: 0, problem: 1, pending: 0, suggestion: 0 },
    });
    expect(feedbackTotals([]).submitted).toBe(0);
  });
});

it("el panel admite los 500 caracteres Unicode que permite PostgreSQL", () => {
  const row = {
    requestId: id,
    personId: null,
    userId: id,
    submittedAt: "2026-10-16T20:00:00Z",
    category: "suggestion",
    comment: "😀".repeat(500),
  };
  expect(adminFeedbackRows.parse([row])[0].comment).toBe(row.comment);
  expect(
    adminFeedbackRows.safeParse([{ ...row, comment: "😀".repeat(501) }])
      .success,
  ).toBe(false);
});

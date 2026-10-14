export type Priority = "critical" | "required" | "optional";
export type Confirmation = "pending" | "confirmed" | "unavailable";
export function coverage(
  positions: { priority: Priority; status?: Confirmation }[],
) {
  const required = positions.filter((p) => p.priority !== "optional");
  const confirmed = required.filter((p) => p.status === "confirmed").length;
  const percentage = required.length
    ? (confirmed / required.length) * 100
    : null;
  const criticalMissing = required.some(
    (p) => p.priority === "critical" && p.status !== "confirmed",
  );
  const color =
    percentage === null
      ? "gray"
      : percentage < 60
        ? "red"
        : percentage < 90 || criticalMissing
          ? "yellow"
          : "green";
  return {
    percentage,
    confirmed,
    total: required.length,
    color,
    pending: required.filter((p) => p.status === "pending").length,
    unavailable: required.filter((p) => p.status === "unavailable").length,
    vacant: required.filter((p) => !p.status).length,
  };
}
export function timeline(start: string, durations: number[]) {
  const base = Date.parse(start);
  if (!Number.isFinite(base)) throw new Error("Inicio inválido");
  let cursor = base;
  return durations.map((seconds) => {
    if (!Number.isSafeInteger(seconds) || seconds < 0)
      throw new Error("Duración inválida");
    const start = new Date(cursor).toISOString();
    cursor += seconds * 1000;
    return { start, end: new Date(cursor).toISOString() };
  });
}
export function resetConfirmations<
  T extends { status: Confirmation; responded_at?: string | null },
>(assignments: T[]) {
  return assignments.map((a) => ({
    ...a,
    status: "pending" as const,
    responded_at: null,
  }));
}

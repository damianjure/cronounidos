import { expect, it } from "vitest";
import { configureRequest, staffRequest } from "@/lib/staffing/model";
import { matrixSummary, type MatrixRow } from "@/lib/staffing/coverage";
const id = "10000000-0000-4000-8000-000000000001";
it("valida cantidad, prioridad y confirmación explícita", () => {
  const p = {
    meetingId: id,
    teamId: id,
    roleId: id,
    version: "2",
    priority: "critical",
    quantity: "2",
  };
  expect(configureRequest.parse(p).quantity).toBe(2);
  expect(configureRequest.safeParse({ ...p, quantity: 0 }).success).toBe(false);
  expect(configureRequest.safeParse({ ...p, quantity: 21 }).success).toBe(
    false,
  );
  expect(
    staffRequest.safeParse({
      meetingId: id,
      positionId: id,
      personId: id,
      version: 1,
      expected: null,
      status: null,
      respondedAt: null,
    }).success,
  ).toBe(false);
});
it("matriz excluye opcionales y exige críticos incluso al 90%", () => {
  const base = {
    meetingId: id,
    teamId: id,
    roleId: id,
    teamName: "Equipo",
    roleName: "Rol",
  };
  const optional = {
    ...base,
    priority: "optional",
    status: "confirmed",
  } as MatrixRow;
  expect(matrixSummary([optional]).color).toBe("gray");
  const rows = Array.from(
    { length: 9 },
    () => ({ ...base, priority: "required", status: "confirmed" }) as MatrixRow,
  );
  expect(
    matrixSummary([...rows, { ...base, priority: "critical", status: null }])
      .color,
  ).toBe("yellow");
  expect(matrixSummary(rows).color).toBe("green");
  expect(
    matrixSummary([{ ...base, priority: "required", status: "unavailable" }])
      .color,
  ).toBe("red");
});

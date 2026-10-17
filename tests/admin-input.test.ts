import { describe, it, expect } from "vitest";
import {
  approveMemberInput,
  grantInput,
  linkPersonInput,
  revokeInput,
} from "@/lib/auth-validation";
const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
describe("validación de acciones de administración", () => {
  it("aprobar: rol cerrado y equipo opcional", () => {
    expect(approveMemberInput.parse({ orgId: a, userId: b, role: "leader", teamId: a }).teamId).toBe(a);
    expect(approveMemberInput.parse({ orgId: a, userId: b, role: "member", teamId: "" }).teamId).toBeNull();
    expect(approveMemberInput.parse({ orgId: a, userId: b, role: "member", teamId: null }).teamId).toBeNull();
    expect(approveMemberInput.safeParse({ orgId: a, userId: b, role: "owner", teamId: "" }).success).toBe(false);
    expect(approveMemberInput.safeParse({ orgId: "x", userId: b, role: "member", teamId: "" }).success).toBe(false);
  });
  it("permiso: solo acciones conocidas", () => {
    expect(grantInput.safeParse({ orgId: a, userId: b, teamId: "", permission: "operate_live" }).success).toBe(true);
    expect(grantInput.safeParse({ orgId: a, userId: b, teamId: "", permission: "superuser" }).success).toBe(false);
    expect(grantInput.safeParse({ orgId: a, userId: b, teamId: "no-uuid", permission: "plan" }).success).toBe(false);
  });
  it("vincular persona y revocar exigen UUID", () => {
    expect(linkPersonInput.parse({ orgId: a, userId: b, personId: "" }).personId).toBeNull();
    expect(revokeInput.safeParse({ orgId: a, grantId: "null" }).success).toBe(false);
  });
});

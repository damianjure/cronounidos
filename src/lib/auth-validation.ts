import { z } from "zod";
export const credentials = z.object({
  email: z.email().max(254),
  password: z.string().min(10, "Usá al menos 10 caracteres.").max(128),
});
export const adminInput = z
  .object({
    orgId: z.uuid(),
    email: z.email().max(254),
    displayName: z.string().trim().min(2).max(100),
    mode: z.enum(["invite", "create"]),
    password: z.string().max(128).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "create" && (!v.password || v.password.length < 10))
      ctx.addIssue({
        code: "custom",
        message: "Usá al menos 10 caracteres.",
        path: ["password"],
      });
  });
export function safeRedirect(path: string | null) {
  return path &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\")
    ? path
    : "/inicio";
}
// Admin form inputs, validated before reaching the database (17/10/2026).
// FormData returns null for missing fields; "" means "no team/person".
const optionalUuid = z.preprocess(
  (v) => (v === "" || v === null ? null : v),
  z.uuid().nullable(),
);
export const permissionActions = [
  "administer",
  "plan",
  "assign",
  "edit_roles",
  "confirm",
  "read_agenda",
  "read_people",
  "read_content",
  "operate_live",
] as const;
export const approveMemberInput = z.object({
  orgId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(["admin", "planner", "leader", "member"]),
  teamId: optionalUuid,
});
export const linkPersonInput = z.object({
  orgId: z.uuid(),
  userId: z.uuid(),
  personId: optionalUuid,
});
export const memberInput = z.object({ orgId: z.uuid(), userId: z.uuid() });
export const grantInput = z.object({
  orgId: z.uuid(),
  userId: z.uuid(),
  teamId: optionalUuid,
  permission: z.enum(permissionActions),
});
export const revokeInput = z.object({ orgId: z.uuid(), grantId: z.uuid() });

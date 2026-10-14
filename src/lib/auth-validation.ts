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

import { z } from "zod";

const name = z.string().trim().min(1).max(100);
const id = z.uuid();

export const personInput = z.object({
  first_name: name,
  last_name: name,
  active: z.boolean(),
});
export const teamInput = z.object({ name, active: z.boolean() });
export const roleInput = z.object({
  name,
  team_id: id.nullable(),
  active: z.boolean(),
});
export const teamMemberInput = z.object({ team_id: id, person_id: id });

export function parseDirectoryInput(kind: "people" | "teams" | "roles", form: FormData) {
  const active = form.get("active") === "on";
  if (kind === "people") {
    return personInput.parse({
      first_name: form.get("firstName"),
      last_name: form.get("lastName"),
      active,
    });
  }
  if (kind === "teams") return teamInput.parse({ name: form.get("name"), active });
  return roleInput.parse({
    name: form.get("name"),
    team_id: form.get("teamId") || null,
    active,
  });
}

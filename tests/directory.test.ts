import { describe, expect, it } from "vitest";
import { parseDirectoryInput, teamMemberInput } from "@/lib/directory-input";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("directorio", () => {
  it("normaliza nombres y estado activo", () => {
    expect(parseDirectoryInput("people", form({ firstName: " Ana ", lastName: " Ficticia ", active: "on" }))).toEqual({
      first_name: "Ana", last_name: "Ficticia", active: true,
    });
    expect(parseDirectoryInput("teams", form({ name: " Media " }))).toEqual({ name: "Media", active: false });
  });
  it("rechaza nombres vacíos o demasiado largos", () => {
    expect(() => parseDirectoryInput("people", form({ firstName: " ", lastName: "Ficticia" }))).toThrow();
    expect(() => parseDirectoryInput("teams", form({ name: "x".repeat(101) }))).toThrow();
  });
  it("valida equipo opcional de rol y membresía", () => {
    const team = "00000000-0000-4000-8000-000000000201";
    const person = "00000000-0000-4000-8000-000000000801";
    expect(parseDirectoryInput("roles", form({ name: " Predicador ", teamId: "" }))).toEqual({
      name: "Predicador", team_id: null, active: false,
    });
    expect(parseDirectoryInput("roles", form({ name: " Streaming ", teamId: team, active: "on" }))).toEqual({
      name: "Streaming", team_id: team, active: true,
    });
    expect(() => parseDirectoryInput("roles", form({ name: "X", teamId: "no-uuid" }))).toThrow();
    expect(teamMemberInput.parse({ team_id: team, person_id: person })).toEqual({ team_id: team, person_id: person });
    expect(() => teamMemberInput.parse({ team_id: team, person_id: "otro" })).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { blockPresentation, searchText } from "../src/lib/editor/presentation";
describe("presentation only: configurable types and search", () => {
  it("ignores case, accents and edge spaces without modifying catalog identities", () => {
    expect(searchText("  CANCIÓN Ágil ")).toBe("cancion agil");
    expect(searchText("Ñandú")).toBe("nandu");
  });
  it("always supports unknown custom types", () => {
    expect(blockPresentation("Actividad inventada").kind).toBe("activity");
    expect(blockPresentation("").kind).toBe("activity");
  });
  it.each([
    ["Alabanza y Adoración", "music"],
    ["Predicación", "message"],
    ["Anuncios", "announcement"],
    ["Prueba de sonido", "audio"],
  ])("suggests icon for %s, not a schema or permission", (name, kind) => {
    expect(blockPresentation(name).kind).toBe(kind);
    expect(Object.keys(blockPresentation(name)).sort()).toEqual([
      "description",
      "kind",
    ]);
  });
});

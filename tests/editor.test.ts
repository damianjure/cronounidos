import { it, expect } from "vitest";
import {
  emptyBlock,
  reorder,
  plannedTimes,
  snapshotSchema,
  defaultCopyOptions,
  copyForPreview,
  safeUrl,
  validateFields,
  readableError,
  fieldDefinition,
} from "@/lib/editor/model";
import { templateBlocks } from "@/lib/editor/templates";
import { parseCatalogInput } from "@/lib/editor/catalog-input";
import { hasResourceSignature } from "@/lib/editor/upload-validation";
const fixture = () => ({
  meetingId: crypto.randomUUID(),
  version: 1,
  revisionId: null,
  publishedRevisionId: null,
  metadata: {
    title: "Prueba ficticia",
    date: "2026-10-18",
    startLocalTime: "23:55",
    timezone: "America/Argentina/Buenos_Aires",
    meetingTypeId: null,
    seriesId: null,
  },
  blocks: [emptyBlock("Uno"), emptyBlock("Dos")],
});
it("reordenar recalcula sin mutar el orden previo", () => {
  const s = fixture();
  const next = reorder(s.blocks, s.blocks[1].clientKey, 0);
  expect(next.map((b) => b.name)).toEqual(["Dos", "Uno"]);
  expect(s.blocks[0].name).toBe("Uno");
  expect(plannedTimes(s.metadata, next).map((t) => t.label)).toEqual([
    "23:55",
    "00:00",
  ]);
  expect(plannedTimes(s.metadata, next)[1].dayOffset).toBe(1);
});
it("mover fuera del rango o un id desconocido no cambia nada", () => {
  const b = fixture().blocks;
  expect(reorder(b, b[0].clientKey, -1)).toBe(b);
  expect(reorder(b, "bad", 0)).toBe(b);
});
it("snapshot valida fecha real y zona IANA", () => {
  const s = fixture();
  expect(snapshotSchema.safeParse(s).success).toBe(true);
  s.metadata.date = "2026-02-30";
  expect(snapshotSchema.safeParse(s).success).toBe(false);
  s.metadata.date = "2026-10-18";
  s.metadata.timezone = "Bad/Zone";
  expect(snapshotSchema.safeParse(s).success).toBe(false);
});
it("plantilla separa IDs físicos y confirmaciones del origen", () => {
  const source = snapshotSchema.parse(fixture());
  source.blocks[0].id = crypto.randomUUID();
  source.blocks[0].responsibles = [{
    assignmentId: crypto.randomUUID(),
    personId: crypto.randomUUID(),
    teamId: null,
    roleId: null,
  }];
  const blocks = templateBlocks(source);
  expect(blocks[0].id).toBeNull();
  expect(blocks[0].clientKey).not.toBe(source.blocks[0].clientKey);
  expect(blocks[0].responsibles[0].assignmentId).toBeNull();
  expect(source.blocks[0].responsibles[0].assignmentId).not.toBeNull();
});
it("campo de selección exige opciones útiles y únicas", () => {
  expect(fieldDefinition.safeParse({ key: "modo", label: "Modo", type: "select", options: [] }).success).toBe(false);
  expect(fieldDefinition.safeParse({ key: "modo", label: "Modo", type: "select", options: ["A", "A"] }).success).toBe(false);
});
it("catálogo de recursos rechaza enlaces inseguros", () => {
  const form = new FormData();
  form.set("title", "Placa ficticia");
  form.set("resourceType", "image");
  form.set("url", "http://example.invalid/placa.png");
  expect(() => parseCatalogInput("resources", form)).toThrow();
  form.set("url", "https://example.invalid/placa.png");
  expect(parseCatalogInput("resources", form)).toMatchObject({
    title: "Placa ficticia",
    resource_type: "image",
  });
});
it("subidas privadas validan firmas, no solo MIME declarado", () => {
  expect(hasResourceSignature("image/png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  expect(hasResourceSignature("image/png", new TextEncoder().encode("<script>alert(1)</script>"))).toBe(false);
  expect(hasResourceSignature("image/webp", new TextEncoder().encode("RIFF1234WEBP"))).toBe(true);
  expect(hasResourceSignature("application/pdf", new TextEncoder().encode("%PDF-1.7"))).toBe(true);
});
it("no permite actividades paralelas fuera de su padre", () => {
  const s = fixture();
  s.blocks[0].subactivities.push({
    clientKey: crypto.randomUUID(),
    title: "Paralela",
    teamId: null,
    personId: null,
    offsetSeconds: 299,
    durationSeconds: 5,
    notes: "",
    fieldSchema: [],
    customFields: {},
  });
  expect(snapshotSchema.safeParse(s).success).toBe(false);
});
it("copiar selecciona grupos y nunca conserva id de confirmación", () => {
  const s = fixture();
  s.blocks[0].notes = "privado";
  s.blocks[0].responsibles = [
    {
      assignmentId: crypto.randomUUID(),
      personId: crypto.randomUUID(),
      teamId: null,
      roleId: null,
    },
  ];
  const next = copyForPreview(s, defaultCopyOptions);
  expect(next.blocks[0].notes).toBe("");
  expect(next.blocks[0].responsibles[0].assignmentId).toBeNull();
  expect(next.meetingId).not.toBe(s.meetingId);
  expect(s.blocks[0].notes).toBe("privado");
  expect(
    copyForPreview(s, { ...defaultCopyOptions, structure: false }).blocks,
  ).toEqual([]);
});
it.each([
  "javascript:alert(1)",
  "http://example.invalid",
  "https://user:password@example.invalid",
])("rechaza enlace inseguro %s", (url) =>
  expect(safeUrl.safeParse(url).success).toBe(false),
);
it("valida seis tipos de campo y no reemplaza entidades", () => {
  const errors: string[] = [];
  const schema = [
    { key: "numero", label: "Número", type: "number" as const },
    { key: "opcion", label: "Opción", type: "select" as const, options: ["a"] },
    { key: "url", label: "Enlace", type: "url" as const },
  ];
  validateFields(
    schema,
    { numero: 2, opcion: "a", url: "https://example.invalid" },
    (m) => errors.push(m),
  );
  expect(errors).toEqual([]);
  validateFields(schema, { numero: "bad", otra: "test" }, (m) =>
    errors.push(m),
  );
  expect(errors).toHaveLength(2);
  const s = fixture();
  s.blocks[0].fieldSchema = [
    { key: "person_id", label: "Persona", type: "text" },
  ];
  expect(snapshotSchema.safeParse(s).success).toBe(false);
});
it("error de concurrencia es accionable y no filtra SQL", () => {
  expect(readableError({ message: "Version conflict" })).toContain("Recargá");
  expect(readableError({ message: "private_sql_details" })).not.toContain(
    "private_sql_details",
  );
});
import { optimisticSave } from "@/lib/editor/transaction";
it("persistencia fallida hace rollback exacto, conservando las notas anteriores", async () => {
  const before = fixture();
  before.blocks[0].notes = "Cambio local anterior";
  const next = {
    ...before,
    blocks: reorder(before.blocks, before.blocks[0].clientKey, 1),
  };
  const committed: unknown[] = [];
  const result = await optimisticSave(
    before,
    next,
    async () => {
      throw new Error("offline");
    },
    (s) => committed.push(s),
  );
  expect(result.ok).toBe(false);
  expect(committed).toEqual([next, before]);
  expect(before.blocks[0].notes).toBe("Cambio local anterior");
});
it("persistencia exitosa toma versión devuelta, no una versión adivinada", async () => {
  const before = fixture();
  const committed: unknown[] = [];
  const returned = { ...before, version: 5 };
  expect(
    (
      await optimisticSave(
        before,
        before,
        async () => returned,
        (s) => committed.push(s),
      )
    ).ok,
  ).toBe(true);
  expect(committed[1]).toEqual(returned);
});
import { zonedStart } from "@/lib/editor/model";
it("hora IANA coincide con PostgreSQL en cambio de horario de verano", () => {
  const meta = {
    ...fixture().metadata,
    date: "2026-11-01",
    startLocalTime: "01:30",
    timezone: "America/New_York",
  };
  expect(new Date(zonedStart(meta)).toISOString()).toBe(
    "2026-11-01T06:30:00.000Z",
  );
  meta.date = "2026-03-08";
  meta.startLocalTime = "02:30";
  expect(new Date(zonedStart(meta)).toISOString()).toBe(
    "2026-03-08T07:30:00.000Z",
  );
});
it("horarios inválidos durante edición no rompen el render", () => {
  const s = fixture();
  expect(
    plannedTimes({ ...s.metadata, startLocalTime: "" }, s.blocks)[0].label,
  ).toBe("—");
  expect(
    plannedTimes({ ...s.metadata, timezone: "Bad/Zone" }, s.blocks)[0].label,
  ).toBe("—");
});
it("paralela nunca cambia duración del eje principal", () => {
  const s = fixture();
  const before = plannedTimes(s.metadata, s.blocks);
  s.blocks[0].subactivities = [
    {
      clientKey: crypto.randomUUID(),
      title: "Paralela",
      teamId: null,
      personId: null,
      offsetSeconds: 0,
      durationSeconds: 20,
      notes: "",
      fieldSchema: [],
      customFields: {},
    },
  ];
  expect(plannedTimes(s.metadata, s.blocks)).toEqual(before);
});
it("valida valores personalizados checkbox, fecha y texto sin tomar HTML como código", () => {
  const errors: string[] = [];
  validateFields(
    [
      { key: "ok", label: "OK", type: "checkbox" },
      { key: "fecha", label: "Fecha", type: "date" },
      { key: "texto", label: "Texto", type: "text" },
    ],
    { ok: true, fecha: "2026-10-18", texto: "<script>no ejecutar</script>" },
    (e) => errors.push(e),
  );
  expect(errors).toEqual([]);
  validateFields(
    [{ key: "ok", label: "OK", type: "checkbox" }],
    { ok: "true" },
    (e) => errors.push(e),
  );
  expect(errors).toHaveLength(1);
});
it.each(["not-a-url", "https://", ""])(
  "enlace malformado %s devuelve error, no lanza excepción",
  (value) => expect(safeUrl.safeParse(value).success).toBe(false),
);

import { z } from "zod";
export const safeUrl = z
  .string()
  .url()
  .max(2048)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Usá un enlace HTTPS sin credenciales.");
export const fieldDefinition = z.object({
  key: z
    .string()
    .regex(
      /^[a-z][a-z0-9_]{0,49}$/,
      "Usá letras minúsculas, números y guion bajo; empezá con una letra.",
    )
    .refine(
      (k) =>
        ![
          "duration",
          "duration_seconds",
          "team_id",
          "person_id",
          "song_id",
          "role_id",
        ].includes(k),
      "Usá las entidades correspondientes para campos estructurales.",
    ),
  label: z
    .string()
    .trim()
    .min(1, "Ingresá una etiqueta.")
    .max(100, "La etiqueta admite hasta 100 caracteres."),
  type: z.enum(["text", "number", "url", "date", "select", "checkbox"]),
  options: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
}).superRefine((field, ctx) => {
  if (field.type === "select" && !field.options?.length)
    ctx.addIssue({ code: "custom", message: "Agregá opciones para el campo de selección." });
  if (field.options && new Set(field.options).size !== field.options.length)
    ctx.addIssue({ code: "custom", message: "Las opciones no pueden repetirse." });
});
const fieldValues = z.record(
  z.string(),
  z.union([z.string().max(12000), z.number().finite(), z.boolean(), z.null()]),
);
const uuid = z.uuid();
export const responsibleSchema = z.object({
  assignmentId: uuid.nullable(),
  personId: uuid,
  teamId: uuid.nullable(),
  roleId: uuid.nullable(),
});
export const subactivitySchema = z.object({
  clientKey: uuid,
  title: z.string().trim().min(1).max(200),
  teamId: uuid.nullable(),
  personId: uuid.nullable().default(null),
  offsetSeconds: z.number().int().min(0).max(86400),
  durationSeconds: z.number().int().min(0).max(86400),
  notes: z.string().max(12000),
  fieldSchema: z.array(fieldDefinition).max(50),
  customFields: fieldValues,
});
export const blockSchema = z.object({
  id: uuid.nullable(),
  clientKey: uuid,
  blockTypeId: uuid.nullable(),
  teamId: uuid.nullable(),
  name: z.string().trim().min(1).max(200),
  durationSeconds: z.number().int().min(0).max(86400),
  visibility: z.enum(["public", "internal"]),
  notes: z.string().max(12000),
  fieldSchema: z.array(fieldDefinition).max(50),
  customFields: fieldValues,
  songIds: z.array(uuid).max(100),
  announcementIds: z.array(uuid).max(100),
  messageIds: z.array(uuid).max(100),
  resourceIds: z.array(uuid).max(100),
  responsibles: z.array(responsibleSchema).max(100),
  subactivities: z.array(subactivitySchema).max(100),
});
export const metadataSchema = z.object({
  title: z.string().trim().min(1).max(200),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => {
      const d = new Date(s + "T00:00:00Z");
      return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, "Fecha inválida."),
  startLocalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z
    .string()
    .min(1)
    .max(100)
    .refine((t) => {
      try {
        new Intl.DateTimeFormat("es", { timeZone: t });
        return true;
      } catch {
        return false;
      }
    }, "Zona IANA inválida."),
  meetingTypeId: uuid.nullable(),
  seriesId: uuid.nullable(),
});
export const snapshotSchema = z
  .object({
    meetingId: uuid,
    version: z.number().int().positive(),
    revisionId: uuid.nullable(),
    publishedRevisionId: uuid.nullable(),
    metadata: metadataSchema,
    blocks: z.array(blockSchema).max(200),
  })
  .superRefine((value, ctx) => {
    const keys = new Set<string>();
    for (const [index, b] of value.blocks.entries()) {
      if (keys.has(b.clientKey))
        ctx.addIssue({
          code: "custom",
          message: "Bloques repetidos.",
          path: ["blocks", index],
        });
      keys.add(b.clientKey);
      validateFields(b.fieldSchema, b.customFields, (msg) =>
        ctx.addIssue({
          code: "custom",
          message: msg,
          path: ["blocks", index, "customFields"],
        }),
      );
      for (const sub of b.subactivities) {
        if (sub.offsetSeconds + sub.durationSeconds > b.durationSeconds)
          ctx.addIssue({
            code: "custom",
            message: "La actividad paralela debe entrar dentro del bloque.",
            path: ["blocks", index, "subactivities"],
          });
        validateFields(sub.fieldSchema, sub.customFields, (msg) =>
          ctx.addIssue({
            code: "custom",
            message: msg,
            path: ["blocks", index, "subactivities"],
          }),
        );
      }
    }
  });
export type FieldDefinition = z.infer<typeof fieldDefinition>;
export type EditorBlock = z.infer<typeof blockSchema>;
export type EditorSnapshot = z.infer<typeof snapshotSchema>;
export type Metadata = z.infer<typeof metadataSchema>;
export const copyOptionsSchema = z.object({
  structure: z.boolean(),
  responsibles: z.boolean(),
  songs: z.boolean(),
  announcements: z.boolean(),
  notes: z.boolean(),
  resources: z.boolean(),
});
export type CopyOptions = z.infer<typeof copyOptionsSchema>;
export const defaultCopyOptions: CopyOptions = {
  structure: true,
  responsibles: true,
  songs: true,
  announcements: true,
  notes: false,
  resources: true,
};
export type CatalogItem = { id: string; name: string };
export type Catalog = {
  teams: CatalogItem[];
  people: CatalogItem[];
  roles: (CatalogItem & { teamId: string | null })[];
  blockTypes: (CatalogItem & { fieldSchema: FieldDefinition[] })[];
  songs: CatalogItem[];
  announcements: CatalogItem[];
  messages: CatalogItem[];
  resources: (CatalogItem & { url: string | null })[];
  meetingTypes: CatalogItem[];
  series: CatalogItem[];
};
export function validateFields(
  schema: FieldDefinition[],
  values: EditorBlock["customFields"],
  error: (message: string) => void,
) {
  const defs = new Map(schema.map((f) => [f.key, f]));
  if (defs.size !== schema.length) error("Campos repetidos.");
  for (const [key, value] of Object.entries(values)) {
    const field = defs.get(key);
    if (!field) {
      error(`Campo desconocido: ${key}`);
      continue;
    }
    if (value === null || value === "") continue;
    const valid =
      field.type === "text"
        ? typeof value === "string"
        : field.type === "number"
          ? typeof value === "number"
          : field.type === "checkbox"
            ? typeof value === "boolean"
            : field.type === "select"
              ? typeof value === "string" && !!field.options?.includes(value)
              : field.type === "url"
                ? safeUrl.safeParse(value).success
                : typeof value === "string" &&
                  metadataSchema.shape.date.safeParse(value).success;
    if (!valid) error(`Revisá el campo ${field.label}.`);
  }
}
export function emptyBlock(
  name = "Nueva actividad",
  type?: Catalog["blockTypes"][number],
): EditorBlock {
  return {
    id: null,
    clientKey: crypto.randomUUID(),
    blockTypeId: type?.id ?? null,
    teamId: null,
    name: type?.name ?? name,
    durationSeconds: 300,
    visibility: "public",
    notes: "",
    fieldSchema: type?.fieldSchema ?? [],
    customFields: {},
    songIds: [],
    announcementIds: [],
    messageIds: [],
    resourceIds: [],
    responsibles: [],
    subactivities: [],
  };
}
export function reorder(blocks: EditorBlock[], key: string, target: number) {
  const source = blocks.findIndex((b) => b.clientKey === key);
  if (source < 0 || target < 0 || target >= blocks.length) return blocks;
  const result = [...blocks];
  const [moved] = result.splice(source, 1);
  result.splice(target, 0, moved);
  return result;
}
export function zonedStart(metadata: Metadata) {
  const target = Date.parse(`${metadata.date}T${metadata.startLocalTime}:00Z`);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: metadata.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const wall = (instant: number) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
    );
    return Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
  };
  const offsets = new Set(
    Array.from({ length: 9 }, (_, i) => {
      const instant = target + (i - 4) * 6 * 3600000;
      return wall(instant) - instant;
    }),
  );
  const candidates = [...offsets].map((offset) => target - offset);
  const matching = candidates.filter((instant) => wall(instant) === target);
  // Match PostgreSQL: standard-time (later instant) for overlaps/gaps.
  return Math.max(...(matching.length ? matching : candidates));
}
export function plannedTimes(metadata: Metadata, blocks: EditorBlock[]) {
  if (
    !metadataSchema.shape.date.safeParse(metadata.date).success ||
    !metadataSchema.shape.startLocalTime.safeParse(metadata.startLocalTime)
      .success ||
    !metadataSchema.shape.timezone.safeParse(metadata.timezone).success
  )
    return blocks.map(() => ({ start: 0, end: 0, dayOffset: 0, label: "—" }));
  let cursor = zonedStart(metadata);
  const format = new Intl.DateTimeFormat("es-AR", {
    timeZone: metadata.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: metadata.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return blocks.map((b) => {
    const start = cursor;
    cursor += b.durationSeconds * 1000;
    const parts = Object.fromEntries(
      day.formatToParts(new Date(start)).map((p) => [p.type, p.value]),
    );
    const localDay = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
    );
    return {
      start,
      end: cursor,
      dayOffset: Math.round(
        (localDay - Date.parse(metadata.date + "T00:00:00Z")) / 86400000,
      ),
      label: format.format(new Date(start)),
    };
  });
}
export function copyForPreview(
  source: EditorSnapshot,
  options: CopyOptions,
): EditorSnapshot {
  return {
    ...source,
    meetingId: crypto.randomUUID(),
    version: 1,
    revisionId: null,
    publishedRevisionId: null,
    metadata: { ...source.metadata, title: source.metadata.title + " (copia)" },
    blocks: options.structure
      ? source.blocks.map((b) => ({
          ...b,
          id: null,
          clientKey: crypto.randomUUID(),
          notes: options.notes ? b.notes : "",
          customFields: options.notes ? { ...b.customFields } : {},
          songIds: options.songs ? [...b.songIds] : [],
          announcementIds: options.announcements ? [...b.announcementIds] : [],
          messageIds: options.notes ? [...b.messageIds] : [],
          resourceIds: options.resources ? [...b.resourceIds] : [],
          responsibles: options.responsibles
            ? b.responsibles.map((a) => ({ ...a, assignmentId: null }))
            : [],
          subactivities: b.subactivities.map((s) => ({
            ...s,
            clientKey: crypto.randomUUID(),
            notes: options.notes ? s.notes : "",
            customFields: options.notes ? { ...s.customFields } : {},
          })),
        }))
      : [],
  };
}
export function readableError(
  error: { code?: string; message?: string } | null,
) {
  if (!error) return "No se pudo guardar. Intentá nuevamente.";
  if (error.message?.includes("Version conflict"))
    return "Otra persona modificó la reunión. Recargá antes de volver a guardar.";
  if (error.message?.includes("Forbidden"))
    return "No tenés permisos suficientes para editar esta reunión.";
  return "No se pudo guardar. Se restauró el estado anterior; revisá los datos o intentá nuevamente.";
}

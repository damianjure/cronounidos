import { z } from "zod";
import { safeUrl } from "./model";

export const catalogKind = z.enum([
  "series",
  "songs",
  "announcements",
  "messages",
  "resources",
]);
export type CatalogKind = z.infer<typeof catalogKind>;

const title = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(12000).nullable();
const optionalUuid = z.uuid().nullable();

export function parseCatalogInput(kind: CatalogKind, form: FormData) {
  const text = (name: string) => String(form.get(name) || "").trim();
  const nullable = (name: string) => text(name) || null;
  const common = { title: text("title") };
  switch (kind) {
    case "series":
      return z.object({ title }).parse(common);
    case "songs":
      return z.object({ title, artist: optionalText, active: z.boolean() }).parse({
        ...common,
        artist: nullable("artist"),
        active: form.get("active") === "on",
      });
    case "announcements":
      return z.object({ title, description: optionalText, active: z.boolean() }).parse({
        ...common,
        description: nullable("description"),
        active: form.get("active") === "on",
      });
    case "messages":
      return z.object({ title, series_id: optionalUuid, preacher_person_id: optionalUuid }).parse({
        ...common,
        series_id: nullable("seriesId"),
        preacher_person_id: nullable("preacherPersonId"),
      });
    case "resources":
      return z.object({ title, url: safeUrl, resource_type: z.enum(["link", "image", "slide", "document"]) }).parse({
        ...common,
        url: text("url"),
        resource_type: text("resourceType"),
      });
  }
}

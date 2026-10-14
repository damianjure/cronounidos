"use client";
import { useActionState } from "react";
import { createMeeting } from "@/app/(interno)/cronograma/actions";
import { Button } from "@/components/ui/button";
import type { CatalogItem } from "@/lib/editor/model";
export function NewMeetingForm({
  types,
  series,
  templates,
}: {
  types: CatalogItem[];
  series: CatalogItem[];
  templates: CatalogItem[];
}) {
  const [state, action, pending] = useActionState(createMeeting, {
    message: "",
  });
  return (
    <section className="panel auth-form">
      <h1>Nueva reunión</h1>
      <form action={action}>
        <label className="field">
          Título
          <input name="title" required maxLength={200} />
        </label>
        <label className="field">
          Fecha
          <input type="date" name="date" required />
        </label>
        <label className="field">
          Hora de inicio
          <input
            type="time"
            name="startLocalTime"
            required
            defaultValue="10:00"
          />
        </label>
        <label className="field">
          Zona horaria
          <input
            name="timezone"
            defaultValue="America/Argentina/Buenos_Aires"
            required
          />
        </label>
        {[
          ["meetingTypeId", "Tipo", types],
          ["seriesId", "Serie", series],
          ["templateId", "Plantilla", templates],
        ].map(([name, label, items]) => (
          <label className="field" key={name as string}>
            {label as string}
            <select name={name as string}>
              <option value="">Sin {String(label).toLowerCase()}</option>
              {(items as CatalogItem[]).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        {state.message && (
          <p className="form-message error" role="alert">
            {state.message}
          </p>
        )}
        <Button disabled={pending}>
          {pending ? "Creando…" : "Crear borrador"}
        </Button>
      </form>
    </section>
  );
}

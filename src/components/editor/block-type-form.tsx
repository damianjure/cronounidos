"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldDefinition, type FieldDefinition } from "@/lib/editor/model";
import { saveBlockType } from "@/app/(interno)/cronograma/catalogos/actions";

export function BlockTypeForm({
  initial,
}: {
  initial?: {
    id: string;
    name: string;
    version: number;
    fields: FieldDefinition[];
  };
}) {
  const [fields, setFields] = useState(initial?.fields ?? []);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldDefinition["type"]>("text");
  const [options, setOptions] = useState("");
  const [error, setError] = useState("");
  return (
    <form action={saveBlockType} className="editor-fields">
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <input type="hidden" name="version" value={initial?.version ?? ""} />
      <input type="hidden" name="fields" value={JSON.stringify(fields)} />
      <label className="field">
        Nombre del tipo
        <input name="name" defaultValue={initial?.name ?? ""} minLength={2} maxLength={120} required />
      </label>
      <ul className="member-list">
        {fields.map((field) => (
          <li key={field.key}>
            <strong>{field.label}</strong> · {field.key} · {field.type}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFields((items) => items.filter((item) => item.key !== field.key))}
            >
              Quitar campo
            </Button>
          </li>
        ))}
      </ul>
      <div className="field-grid">
        <label className="field">
          Identificador del campo
          <input value={key} onChange={(event) => setKey(event.target.value)} placeholder="ejemplo_campo" />
        </label>
        <label className="field">
          Etiqueta
          <input value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label className="field">
          Tipo de campo
          <select value={type} onChange={(event) => setType(event.target.value as FieldDefinition["type"])}>
            <option value="text">Texto</option>
            <option value="number">Número</option>
            <option value="url">Enlace HTTPS</option>
            <option value="date">Fecha</option>
            <option value="select">Selección</option>
            <option value="checkbox">Casilla</option>
          </select>
        </label>
        {type === "select" && (
          <label className="field">
            Opciones separadas por coma
            <input value={options} onChange={(event) => setOptions(event.target.value)} />
          </label>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          const parsed = fieldDefinition.safeParse({
            key,
            label,
            type,
            options: type === "select" ? options.split(",").map((value) => value.trim()).filter(Boolean) : undefined,
          });
          if (!parsed.success || fields.some((field) => field.key === key)) {
            setError(parsed.success ? "El identificador ya existe." : parsed.error.issues[0].message);
            return;
          }
          setFields((items) => [...items, parsed.data]);
          setKey("");
          setLabel("");
          setOptions("");
          setError("");
        }}
      >
        Agregar campo al tipo
      </Button>
      {error && <p className="error" role="alert">{error}</p>}
      <Button>{initial ? "Guardar nueva versión del tipo" : "Crear tipo"}</Button>
    </form>
  );
}

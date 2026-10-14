"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  fieldDefinition,
  type EditorBlock,
  type FieldDefinition,
} from "@/lib/editor/model";
export function CustomFields({
  schema,
  values,
  onSchema,
  onValues,
  disabled,
}: {
  schema: FieldDefinition[];
  values: EditorBlock["customFields"];
  onSchema: (s: FieldDefinition[]) => void;
  onValues: (v: EditorBlock["customFields"]) => void;
  disabled: boolean;
}) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldDefinition["type"]>("text");
  const [options, setOptions] = useState("");
  const [error, setError] = useState("");
  return (
    <fieldset disabled={disabled} className="editor-fields">
      <legend>Campos de esta actividad</legend>
      {schema.map((f) => (
        <label className="field" key={f.key}>
          {f.label}
          {f.type === "checkbox" ? (
            <input
              type="checkbox"
              checked={values[f.key] === true}
              onChange={(e) =>
                onValues({ ...values, [f.key]: e.target.checked })
              }
            />
          ) : f.type === "select" ? (
            <select
              value={String(values[f.key] ?? "")}
              onChange={(e) => onValues({ ...values, [f.key]: e.target.value })}
            >
              <option value="">Sin seleccionar</option>
              {f.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={
                f.type === "number"
                  ? "number"
                  : f.type === "date"
                    ? "date"
                    : f.type === "url"
                      ? "url"
                      : "text"
              }
              value={String(values[f.key] ?? "")}
              onChange={(e) =>
                onValues({
                  ...values,
                  [f.key]:
                    f.type === "number"
                      ? e.target.value === ""
                        ? null
                        : Number(e.target.value)
                      : e.target.value,
                })
              }
            />
          )}
        </label>
      ))}
      <details>
        <summary>Agregar campo personalizado</summary>
        <div className="field-grid">
          <label className="field">
            Identificador
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="ejemplo_campo"
            />
          </label>
          <label className="field">
            Etiqueta
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="field">
            Tipo
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as FieldDefinition["type"])
              }
            >
              {[
                ["text", "Texto"],
                ["number", "Número"],
                ["url", "Enlace HTTPS"],
                ["date", "Fecha"],
                ["select", "Selección"],
                ["checkbox", "Casilla"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {type === "select" && (
            <label className="field">
              Opciones, separadas por coma
              <input
                value={options}
                onChange={(e) => setOptions(e.target.value)}
              />
            </label>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const result = fieldDefinition.safeParse({
              key,
              label,
              type,
              options:
                type === "select"
                  ? options
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean)
                  : undefined,
            });
            if (!result.success) {
              setError(result.error.issues[0].message);
              return;
            }
            if (schema.some((f) => f.key === key)) {
              setError("Ese identificador ya existe.");
              return;
            }
            onSchema([...schema, result.data]);
            setKey("");
            setLabel("");
            setError("");
          }}
        >
          Agregar campo
        </Button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </details>
    </fieldset>
  );
}

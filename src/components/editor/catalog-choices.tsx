"use client";
import { useId, useState } from "react";
import { ArrowUp, X } from "lucide-react";
import type { CatalogItem } from "@/lib/editor/model";
import { searchText } from "@/lib/editor/presentation";
export function CatalogChoices({
  label,
  items,
  value,
  onChange,
  disabled,
  section,
  suggested = false,
}: {
  label: string;
  items: CatalogItem[];
  value: string[];
  onChange: (s: string[]) => void;
  disabled: boolean;
  section: string;
  suggested?: boolean;
}) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const filtered = items.filter((item) =>
    searchText(`${item.name} ${item.description ?? ""}`).includes(
      searchText(query),
    ),
  );
  return (
    <details
      className="editor-choices"
      data-detail-section={section}
      open={suggested || undefined}
    >
      <summary>
        {label} ({value.length})
      </summary>
      <label className="field" htmlFor={searchId}>
        Buscar en {label}
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <fieldset disabled={disabled} className="catalog-results">
        <legend className="visually-hidden">Elegir {label}</legend>
        {filtered.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              aria-label={item.name}
              checked={value.includes(item.id)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, item.id]
                    : value.filter((id) => id !== item.id),
                )
              }
            />
            <span>
              {item.name}
              {item.description && (
                <small className="catalog-description">
                  {item.description}
                </small>
              )}
            </span>
          </label>
        ))}
        {!items.length ? (
          <p className="muted">No hay elementos de catálogo disponibles.</p>
        ) : (
          !filtered.length && (
            <p className="muted">Sin coincidencias. Probá otra búsqueda.</p>
          )
        )}
      </fieldset>
      {!!value.length && <p className="muted">Seleccionados, en orden</p>}
      {value.map((id, index) => {
        const name =
          items.find((item) => item.id === id)?.name ??
          "Elemento no disponible";
        return (
          <div className="selection-row" key={id}>
            <span>
              {index + 1}. {name}
            </span>
            <div className="editor-toolbar">
              <button
                type="button"
                className="icon-button"
                disabled={disabled || index === 0}
                aria-label={`Mover ${name} antes`}
                onClick={() => {
                  const next = [...value];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  onChange(next);
                }}
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={disabled}
                aria-label={`Quitar ${name}`}
                onClick={() =>
                  onChange(value.filter((current) => current !== id))
                }
              >
                <X size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </details>
  );
}

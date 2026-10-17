"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Catalog } from "@/lib/editor/model";
import { blockPresentation, searchText } from "@/lib/editor/presentation";
import { BlockIcon } from "./block-icon";
export function BlockPicker({
  types,
  onClose,
  onCreate,
}: {
  types: Catalog["blockTypes"];
  onClose: () => void;
  onCreate: (typeId: string, name: string, seconds: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("5");
  useEffect(() => {
    const element = dialog.current!;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element.showModal();
    element.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    return () => {
      element.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  const options = [{ id: "", name: "Actividad personalizada" }, ...types];
  return (
    <dialog
      ref={dialog}
      className="block-picker"
      aria-labelledby="block-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="section-title">
        <h2 id="block-picker-title">Agregar bloque</h2>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
      {typeId === null ? (
        <>
          <p className="muted">
            Elegí un tipo. Sus campos se copian a esta actividad; no cambia las
            anteriores.
          </p>
          <label className="field">
            Buscar tipo de bloque
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="block-type-grid">
            {options
              .filter((type) =>
                searchText(type.name).includes(searchText(query)),
              )
              .map((type) => (
                <button
                  type="button"
                  className="block-type-option"
                  key={type.id}
                  onClick={() => {
                    setTypeId(type.id);
                    setName(type.id ? type.name : "Actividad personalizada");
                  }}
                >
                  <BlockIcon name={type.name} />
                  <span>
                    <strong>{type.name}</strong>
                    <small>{blockPresentation(type.name).description}</small>
                  </span>
                </button>
              ))}
          </div>
          {!options.some((type) =>
            searchText(type.name).includes(searchText(query)),
          ) && (
            <p className="empty muted">
              Sin coincidencias. Probá otra búsqueda.
            </p>
          )}
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const duration = Number(minutes);
            if (
              !name.trim() ||
              !minutes.trim() ||
              !Number.isFinite(duration) ||
              duration < 0 ||
              duration > 1440 ||
              !Number.isInteger(duration * 60)
            )
              return;
            onCreate(typeId, name.trim(), duration * 60);
          }}
        >
          <p className="muted">
            {types.find((type) => type.id === typeId)?.name ??
              "Actividad personalizada"}
            . Después podés asociar personas, contenidos y recursos en el
            detalle.
          </p>
          <label className="field">
            Nombre del bloque
            <input
              autoFocus
              value={name}
              required
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            Duración inicial, minutos
            <input
              type="number"
              value={minutes}
              required
              min={0}
              max={1440}
              step={0.5}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </label>
          <div className="editor-toolbar">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTypeId(null)}
            >
              Cambiar tipo
            </Button>
            <Button type="submit">Crear bloque</Button>
          </div>
        </form>
      )}
    </dialog>
  );
}

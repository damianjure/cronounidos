"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { BlockIcon } from "./block-icon";
import type { EditorBlock } from "@/lib/editor/model";
export function SortableBlock({
  block,
  typeName,
  time,
  index,
  count,
  selected,
  busy,
  keyboardActive,
  keyboardTarget,
  onKeyboardToggle,
  onKeyboardMove,
  onKeyboardCancel,
  onSelect,
  onMove,
  onDuration,
  onFocusDuration,
  onBlurDuration,
}: {
  block: EditorBlock;
  typeName?: string;
  time: { label: string; dayOffset: number };
  index: number;
  count: number;
  selected: boolean;
  busy: boolean;
  keyboardActive: boolean;
  keyboardTarget: boolean;
  onKeyboardToggle: () => void;
  onKeyboardMove: (offset: number) => void;
  onKeyboardCancel: () => void;
  onSelect: () => void;
  onMove: (offset: number) => void;
  onDuration: (seconds: number) => void;
  onFocusDuration: () => void;
  onBlurDuration: () => void;
}) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.clientKey });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition,
      }}
      data-drag-key={block.clientKey}
      data-dragging={isDragging || undefined}
      className={`editor-block ${selected ? "selected" : ""} ${keyboardTarget ? "keyboard-target" : ""}`}
    >
      <button
        ref={setActivatorNodeRef}
        className="drag-handle icon-button"
        aria-label={`Arrastrar ${block.name}`}
        {...attributes}
        {...listeners}
        aria-pressed={keyboardActive}
        onKeyDown={(event) => {
          if (event.code === "Space" || event.code === "Enter") {
            event.preventDefault();
            onKeyboardToggle();
          } else if (
            keyboardActive &&
            (event.code === "ArrowDown" || event.code === "ArrowUp")
          ) {
            event.preventDefault();
            onKeyboardMove(event.code === "ArrowDown" ? 1 : -1);
          } else if (keyboardActive && event.code === "Escape") {
            event.preventDefault();
            onKeyboardCancel();
          }
        }}
      >
        <GripVertical size={21} />
      </button>
      <span className="planned-time">
        {time.label}
        {time.dayOffset > 0 && (
          <small>
            +{time.dayOffset} día{time.dayOffset > 1 ? "s" : ""}
          </small>
        )}
      </span>
      <button
        type="button"
        className="block-select"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="block-name-line">
          <BlockIcon name={typeName ?? block.name} />
          <strong>{block.name}</strong>
        </span>
        <small>
          {block.subactivities.length
            ? `${block.subactivities.length} paralela(s)`
            : (typeName ?? "Actividad principal")}
          {block.visibility === "internal" ? " · Interna" : ""}
        </small>
        {(block.responsibles.length > 0 || block.resourceIds.length > 0) && (
          <small>
            {block.responsibles.length > 0
              ? `${block.responsibles.length} responsable(s)`
              : ""}
            {block.responsibles.length > 0 && block.resourceIds.length > 0
              ? " · "
              : ""}
            {block.resourceIds.length > 0
              ? `${block.resourceIds.length} recurso(s)`
              : ""}
          </small>
        )}
      </button>
      <label className="duration-field">
        <span className="visually-hidden">
          Duración de {block.name}, minutos
        </span>
        <input
          aria-label={`Duración de ${block.name}, minutos`}
          type="number"
          min={0}
          max={1440}
          step={0.5}
          value={block.durationSeconds / 60}
          disabled={busy}
          onFocus={onFocusDuration}
          onChange={(e) => onDuration(Math.round(Number(e.target.value) * 60))}
          onBlur={onBlurDuration}
        />
        <span>min</span>
      </label>
      <div className="move-actions">
        <button
          className="icon-button"
          disabled={index === 0}
          aria-label={`Mover ${block.name} arriba`}
          onClick={() => onMove(-1)}
        >
          <ArrowUp size={18} />
        </button>
        <button
          className="icon-button"
          disabled={index === count - 1}
          aria-label={`Mover ${block.name} abajo`}
          onClick={() => onMove(1)}
        >
          <ArrowDown size={18} />
        </button>
      </div>
    </li>
  );
}

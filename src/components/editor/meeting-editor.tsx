"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  saveMeeting,
  duplicateMeeting,
} from "@/app/(interno)/cronograma/actions";
import { saveTemplate } from "@/app/(interno)/cronograma/catalogos/actions";
import {
  safeUrl,
  emptyBlock,
  reorder,
  plannedTimes,
  snapshotSchema,
  defaultCopyOptions,
  copyForPreview,
  validateFields,
  type Catalog,
  type CatalogItem,
  type EditorSnapshot,
  type EditorBlock,
  type CopyOptions,
} from "@/lib/editor/model";
import { optimisticSave } from "@/lib/editor/transaction";
import { CustomFields } from "./custom-fields";
import { SortableBlock } from "./sortable-block";
import { BlockPicker } from "./block-picker";
import { CatalogChoices as Choices } from "./catalog-choices";
import { useUnsavedChanges } from "./use-unsaved-changes";
import { blockPresentation, searchText } from "@/lib/editor/presentation";
const copyLabels: Record<keyof CopyOptions, string> = {
  structure: "Estructura y duraciones",
  responsibles: "Responsables",
  songs: "Canciones",
  announcements: "Anuncios",
  notes: "Notas y mensaje",
  resources: "Recursos",
};
export function MeetingEditor({
  initial,
  catalog,
  demo = false,
}: {
  initial: EditorSnapshot;
  catalog: Catalog;
  demo?: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [selected, setSelected] = useState(initial.blocks[0]?.clientKey ?? "");
  const [busy, setBusy] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const pending = useRef(false);
  // Moves requested while a save is in flight. They are shown optimistically
  // and replayed, in order, on top of the persisted result (never on a stale
  // version). A failed save discards them together with its rollback.
  const queuedMoves = useRef<{ key: string; target: number }[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [failDemo, setFailDemo] = useState(false);
  const [copyOptions, setCopyOptions] = useState(defaultCopyOptions);
  const [newType, setNewType] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const detailPanel = useRef<HTMLElement>(null);
  const [person, setPerson] = useState("");
  const [team, setTeam] = useState("");
  const [role, setRole] = useState("");
  const durationBefore = useRef<EditorSnapshot | null>(null);
  const router = useRouter();
  const [keyboardDrag, setKeyboardDrag] = useState<{
    key: string;
    target: number;
  } | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 5 },
    }),
  );
  const times = plannedTimes(snapshot.metadata, snapshot.blocks);
  const active = snapshot.blocks.find((b) => b.clientKey === selected);
  const currentType = catalog.blockTypes.find(
    (t) => t.id === active?.blockTypeId,
  );
  const [lastSaved, setLastSaved] = useState(initial);
  const dirty = JSON.stringify(snapshot) !== JSON.stringify(lastSaved);
  useUnsavedChanges(dirty || busy);
  const totalMinutes =
    snapshot.blocks.reduce((total, block) => total + block.durationSeconds, 0) /
    60;
  const end = times.at(-1)?.end;
  const endLabel = end
    ? new Intl.DateTimeFormat("es-AR", {
        timeZone: snapshot.metadata.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(end))
    : "—";
  const endDate = end
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: snapshot.metadata.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(end))
    : "";
  function selectBlock(key: string) {
    setSelected(key);
    setPerson("");
    setTeam("");
    setRole("");
    setPeopleQuery("");
  }
  function focusSection(section: string) {
    const target = detailPanel.current?.querySelector<HTMLElement>(
      `[data-detail-section="${section}"]`,
    );
    if (!target) return;
    if (target instanceof HTMLDetailsElement) target.open = true;
    target.scrollIntoView({ block: "nearest", behavior: "instant" });
    const focusable =
      target instanceof HTMLDetailsElement
        ? target.querySelector("summary")
        : target.querySelector("input");
    (focusable as HTMLElement | null)?.focus();
  }
  const edit = (patch: Partial<EditorBlock>) => {
    setSnapshot((s) => ({
      ...s,
      blocks: s.blocks.map((b) =>
        b.clientKey === selected ? { ...b, ...patch } : b,
      ),
    }));
    setMessage("");
  };
  const editSub = (
    index: number,
    patch: Partial<EditorBlock["subactivities"][number]>,
  ) => {
    if (!active) return;
    edit({
      subactivities: active.subactivities.map((sub, current) =>
        current === index ? { ...sub, ...patch } : sub,
      ),
    });
  };
  async function persist(
    next: EditorSnapshot,
    before = snapshot,
    publish = false,
  ) {
    if (pending.current) return;
    const validated = snapshotSchema.safeParse(next);
    if (!validated.success) {
      setError(validated.error.issues[0].message);
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const result = await optimisticSave(
      before,
      next,
      async (s) => {
        if (demo) {
          if (failDemo)
            throw new Error("Fallo simulado: se restauró el estado anterior.");
          return {
            ...s,
            version: s.version + 1,
            publishedRevisionId: publish
              ? crypto.randomUUID()
              : s.publishedRevisionId,
          };
        }
        return saveMeeting(s, publish);
      },
      setSnapshot,
    );
    if (result.ok) {
      setLastSaved(result.snapshot);
      setMessage(
        demo
          ? "Cambio simulado. No se guardaron datos reales."
          : publish
            ? "Cambios publicados."
            : "Borrador guardado. La agenda publicada no cambió.",
      );
    } else {
      setError(result.error);
    }
    pending.current = false;
    setBusy(false);
    const queued = queuedMoves.current;
    queuedMoves.current = [];
    if (!queued.length) return;
    if (!result.ok) {
      setError(
        `${result.error} Los movimientos pendientes también se descartaron.`,
      );
      return;
    }
    const base = result.snapshot;
    const blocks = queued.reduce(
      (current, m) =>
        current.some((b) => b.clientKey === m.key)
          ? reorder(current, m.key, m.target)
          : current,
      base.blocks,
    );
    await persist({ ...base, blocks }, base);
  }
  function requestMove(key: string, target: number) {
    if (pending.current) {
      queuedMoves.current.push({ key, target });
      setSnapshot((s) => ({ ...s, blocks: reorder(s.blocks, key, target) }));
      setMessage(
        "Movimiento en cola: se guarda al terminar el guardado actual.",
      );
      return;
    }
    void persist({
      ...snapshot,
      blocks: reorder(snapshot.blocks, key, target),
    });
  }
  async function move(key: string, offset: number) {
    const index = snapshot.blocks.findIndex((b) => b.clientKey === key);
    requestMove(key, index + offset);
  }
  function keyboardToggle(key: string) {
    if (keyboardDrag?.key === key) {
      const before = snapshot.blocks.findIndex(
        (block) => block.clientKey === key,
      );
      const target = keyboardDrag.target;
      setKeyboardDrag(null);
      if (before !== target) requestMove(key, target);
      return;
    }
    const index = snapshot.blocks.findIndex((block) => block.clientKey === key);
    if (index >= 0) setKeyboardDrag({ key, target: index });
  }
  function keyboardMove(key: string, offset: number) {
    setKeyboardDrag((current) =>
      current?.key === key
        ? {
            key,
            target: Math.max(
              0,
              Math.min(snapshot.blocks.length - 1, current.target + offset),
            ),
          }
        : current,
    );
  }
  function dragEnd(event: DragEndEvent) {
    setDragOverId(null);
    if (!event.over || event.active.id === event.over.id) return;
    const target = snapshot.blocks.findIndex(
      (b) => b.clientKey === event.over?.id,
    );
    if (target < 0) return;
    requestMove(String(event.active.id), target);
  }
  return (
    <>
      <div className="page-heading editor-heading">
        <div>
          <h1>{snapshot.metadata.title}</h1>
          <p className="muted">
            {snapshot.publishedRevisionId
              ? "Editás un borrador separado de la agenda publicada."
              : "La reunión todavía no está publicada."}{" "}
            {dirty ? "Hay cambios sin guardar." : ""}
          </p>
        </div>
        <div className="editor-toolbar">
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => void persist(snapshot)}
          >
            Guardar borrador
          </Button>
          <Button
            disabled={busy || !snapshot.blocks.length}
            onClick={() => {
              if (
                window.confirm(
                  demo
                    ? "¿Simular publicación? No se modifican datos reales."
                    : "¿Publicar estos cambios? Reemplazan la agenda visible a los lectores.",
                )
              )
                void persist(snapshot, snapshot, true);
            }}
          >
            {demo ? "Simular publicación" : "Publicar cambios"}
          </Button>
          <details className="editor-secondary">
            <summary>Más acciones</summary>
            <div className="secondary-content">
              <a
                className="button button-ghost"
                href="#duplicar-reunion"
                onClick={() => {
                  const target = document.getElementById("duplicar-reunion");
                  if (target instanceof HTMLDetailsElement) target.open = true;
                }}
              >
                Opciones para duplicar
              </a>
              {!demo && (
                <form action={saveTemplate}>
                  <input
                    type="hidden"
                    name="meetingId"
                    value={snapshot.meetingId}
                  />
                  <input
                    type="hidden"
                    name="version"
                    value={snapshot.version}
                  />
                  <label className="field">
                    Nombre de la plantilla
                    <input
                      name="name"
                      defaultValue={snapshot.metadata.title}
                      minLength={2}
                      maxLength={120}
                      required
                    />
                  </label>
                  <Button disabled={busy || dirty} variant="outline">
                    Guardar como plantilla
                  </Button>
                </form>
              )}
            </div>
          </details>
        </div>
      </div>
      <div className="editor-summary" aria-label="Resumen del cronograma">
        <span>
          <small>Fecha</small>
          <strong>
            {snapshot.metadata.date.split("-").reverse().join("/")}
          </strong>
        </span>
        <span>
          <small>Inicio</small>
          <strong>{snapshot.metadata.startLocalTime}</strong>
        </span>
        <span>
          <small>Duración</small>
          <strong>
            {new Intl.NumberFormat("es-AR", {
              maximumFractionDigits: 2,
            }).format(totalMinutes)}{" "}
            min
          </strong>
        </span>
        <span>
          <small>Fin planificado</small>
          <strong>
            {endLabel}
            {endDate && endDate !== snapshot.metadata.date
              ? ` (${endDate})`
              : ""}
          </strong>
        </span>
        <span>
          <small>Estado de edición</small>
          <strong>
            {busy
              ? "Guardando…"
              : dirty
                ? "Cambios sin guardar"
                : "Sin cambios pendientes"}
          </strong>
        </span>
      </div>
      {pickerOpen && (
        <BlockPicker
          types={catalog.blockTypes}
          onClose={() => setPickerOpen(false)}
          onCreate={(typeId, name, seconds) => {
            const block = {
              ...emptyBlock(
                name,
                catalog.blockTypes.find((type) => type.id === typeId),
              ),
              name,
              durationSeconds: seconds,
            };
            setSnapshot((current) => ({
              ...current,
              blocks: [...current.blocks, block],
            }));
            selectBlock(block.clientKey);
            setPickerOpen(false);
            setMessage("Bloque agregado al borrador. Guardá para conservarlo.");
          }}
        />
      )}
      {demo && (
        <div className="notice">
          <strong>Demostración con datos ficticios</strong>
          <p>
            No está conectada a Supabase. No se guardan ni publican datos
            reales.
          </p>
          <label>
            <input
              type="checkbox"
              checked={failDemo}
              onChange={(e) => setFailDemo(e.target.checked)}
            />{" "}
            Simular fallo al guardar para probar rollback
          </label>
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <details className="panel editor-metadata">
        <summary>Datos de la reunión</summary>
        <fieldset disabled={busy} className="field-grid">
          <label className="field">
            Título
            <input
              value={snapshot.metadata.title}
              maxLength={200}
              onChange={(e) =>
                setSnapshot((s) => ({
                  ...s,
                  metadata: { ...s.metadata, title: e.target.value },
                }))
              }
            />
          </label>
          <label className="field">
            Fecha
            <input
              type="date"
              value={snapshot.metadata.date}
              onChange={(e) =>
                setSnapshot((s) => ({
                  ...s,
                  metadata: { ...s.metadata, date: e.target.value },
                }))
              }
            />
          </label>
          <label className="field">
            Hora de inicio
            <input
              type="time"
              value={snapshot.metadata.startLocalTime}
              onChange={(e) =>
                setSnapshot((s) => ({
                  ...s,
                  metadata: { ...s.metadata, startLocalTime: e.target.value },
                }))
              }
            />
          </label>
          <label className="field">
            Zona horaria
            <input
              value={snapshot.metadata.timezone}
              onChange={(e) =>
                setSnapshot((s) => ({
                  ...s,
                  metadata: { ...s.metadata, timezone: e.target.value },
                }))
              }
            />
          </label>
          {[
            ["meetingTypeId", "Tipo", catalog.meetingTypes],
            ["seriesId", "Serie", catalog.series],
          ].map(([key, label, items]) => (
            <label className="field" key={key as string}>
              {label as string}
              <select
                value={
                  snapshot.metadata[key as "meetingTypeId" | "seriesId"] ?? ""
                }
                onChange={(e) =>
                  setSnapshot((s) => ({
                    ...s,
                    metadata: {
                      ...s.metadata,
                      [key as string]: e.target.value || null,
                    },
                  }))
                }
              >
                <option value="">Sin seleccionar</option>
                {(items as CatalogItem[]).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      </details>
      <div className="editor-layout">
        <section className="panel timeline-panel">
          <div className="section-title">
            <h2>Actividades</h2>
            <Button
              type="button"
              disabled={busy}
              onClick={() => setPickerOpen(true)}
              className="desktop-editor-control"
            >
              <Plus size={18} />
              Agregar bloque
            </Button>
          </div>
          <p className="muted editor-hint">
            Arrastrá desde el handle o usá las flechas. También podés reordenar
            con el teclado.
          </p>
          <p className="visually-hidden" aria-live="polite" aria-atomic="true">
            {keyboardDrag
              ? `Moviendo ${snapshot.blocks.find((block) => block.clientKey === keyboardDrag.key)?.name}. Destino: posición ${keyboardDrag.target + 1} de ${snapshot.blocks.length}. Espacio confirma; Escape cancela.`
              : ""}
          </p>
          <DndContext
            sensors={sensors}
            accessibility={{
              screenReaderInstructions: {
                draggable:
                  "Para mover una actividad, presioná Espacio, usá las flechas y confirmá con Espacio. Escape cancela.",
              },
              announcements: {
                onDragStart: ({ active }) =>
                  `Moviendo ${snapshot.blocks.find((block) => block.clientKey === active.id)?.name ?? "actividad"}.`,
                onDragOver: ({ over }) =>
                  over
                    ? `Destino: posición ${snapshot.blocks.findIndex((block) => block.clientKey === over.id) + 1} de ${snapshot.blocks.length}.`
                    : "Fuera de la lista.",
                onDragEnd: ({ active, over }) =>
                  over
                    ? `${snapshot.blocks.find((block) => block.clientKey === active.id)?.name ?? "Actividad"} soltada en posición ${snapshot.blocks.findIndex((block) => block.clientKey === over.id) + 1}.`
                    : "Movimiento cancelado.",
                onDragCancel: () => "Movimiento cancelado.",
              },
            }}
            collisionDetection={closestCenter}
            onDragOver={(event) =>
              setDragOverId(event.over ? String(event.over.id) : null)
            }
            onDragCancel={() => setDragOverId(null)}
            onDragEnd={dragEnd}
          >
            <SortableContext
              items={snapshot.blocks.map((b) => b.clientKey)}
              strategy={verticalListSortingStrategy}
            >
              <ol
                className="editor-timeline"
                data-drag-over={
                  keyboardDrag
                    ? snapshot.blocks[keyboardDrag.target]?.clientKey
                    : (dragOverId ?? undefined)
                }
              >
                {snapshot.blocks.map((b, index) => (
                  <SortableBlock
                    key={b.clientKey}
                    block={b}
                    typeName={
                      catalog.blockTypes.find(
                        (type) => type.id === b.blockTypeId,
                      )?.name
                    }
                    time={times[index]}
                    index={index}
                    count={snapshot.blocks.length}
                    selected={selected === b.clientKey}
                    busy={busy}
                    keyboardActive={keyboardDrag?.key === b.clientKey}
                    keyboardTarget={
                      keyboardDrag
                        ? keyboardDrag.target === index
                        : dragOverId === b.clientKey
                    }
                    onKeyboardToggle={() => keyboardToggle(b.clientKey)}
                    onKeyboardMove={(offset) =>
                      keyboardMove(b.clientKey, offset)
                    }
                    onKeyboardCancel={() => setKeyboardDrag(null)}
                    onSelect={() => selectBlock(b.clientKey)}
                    onMove={(offset) => void move(b.clientKey, offset)}
                    onDuration={(seconds) =>
                      setSnapshot((s) => ({
                        ...s,
                        blocks: s.blocks.map((block) =>
                          block.clientKey === b.clientKey
                            ? { ...block, durationSeconds: seconds }
                            : block,
                        ),
                      }))
                    }
                    onFocusDuration={() => {
                      durationBefore.current = snapshot;
                    }}
                    onBlurDuration={() => {
                      if (
                        durationBefore.current &&
                        durationBefore.current.blocks.find(
                          (before) => before.clientKey === b.clientKey,
                        )?.durationSeconds !== b.durationSeconds
                      )
                        void persist(snapshot, durationBefore.current);
                      durationBefore.current = null;
                    }}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          {!snapshot.blocks.length && (
            <p className="empty muted">
              Agregá la primera actividad del encuentro.
            </p>
          )}
          <Button
            type="button"
            disabled={busy}
            variant="outline"
            className="desktop-editor-control editor-add-block"
            onClick={() => setPickerOpen(true)}
          >
            <Plus size={18} />
            Agregar bloque
          </Button>
          <div className="editor-add mobile-editor-add">
            <label className="field">
              Tipo de actividad
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                disabled={busy}
              >
                <option value="">Actividad personalizada</option>
                {catalog.blockTypes.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => {
                const b = emptyBlock(
                  "Nueva actividad",
                  catalog.blockTypes.find((t) => t.id === newType),
                );
                setSnapshot((s) => ({ ...s, blocks: [...s.blocks, b] }));
                setSelected(b.clientKey);
              }}
            >
              <Plus size={18} />
              Agregar actividad
            </Button>
          </div>
        </section>
        <section className="panel block-detail" ref={detailPanel}>
          {active ? (
            <>
              <div className="section-title">
                <h2>Detalle de actividad</h2>
                <button
                  className="icon-button"
                  aria-label={`Eliminar ${active.name}`}
                  disabled={busy}
                  onClick={() => {
                    setSnapshot((s) => ({
                      ...s,
                      blocks: s.blocks.filter((b) => b.clientKey !== selected),
                    }));
                    setSelected(
                      snapshot.blocks.find((b) => b.clientKey !== selected)
                        ?.clientKey ?? "",
                    );
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <p className="muted detail-context">
                {
                  blockPresentation(currentType?.name ?? active.name)
                    .description
                }
              </p>
              <nav
                className="detail-section-nav desktop-editor-control"
                aria-label="Secciones del bloque"
              >
                {[
                  ["activity", "actividad"],
                  ["team", "equipo"],
                  ["songs", "canciones"],
                  ["messages", "mensaje"],
                  ["announcements", "anuncios"],
                  ["resources", "recursos"],
                  ["advanced", "avanzado"],
                ].map(([section, label]) => (
                  <button
                    type="button"
                    key={section}
                    onClick={() => focusSection(section)}
                    aria-label={`Ir a ${label}`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <fieldset
                className="editor-fields"
                disabled={busy}
                data-detail-section="activity"
              >
                <label className="field">
                  Nombre de la actividad
                  <input
                    value={active.name}
                    maxLength={200}
                    onChange={(e) => edit({ name: e.target.value })}
                  />
                </label>
                <label className="field">
                  Equipo principal
                  <select
                    value={active.teamId ?? ""}
                    onChange={(e) => edit({ teamId: e.target.value || null })}
                  >
                    <option value="">Sin equipo</option>
                    {catalog.teams.map((t) => (
                      <option value={t.id} key={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Visibilidad
                  <select
                    value={active.visibility}
                    onChange={(e) =>
                      edit({
                        visibility: e.target.value as "public" | "internal",
                      })
                    }
                  >
                    <option value="public">
                      Actividad visible en agenda pública
                    </option>
                    <option value="internal">Solo agenda interna</option>
                  </select>
                </label>
                <label className="field">
                  Notas privadas
                  <textarea
                    rows={4}
                    aria-label="Notas privadas"
                    maxLength={12000}
                    value={active.notes}
                    onChange={(e) => edit({ notes: e.target.value })}
                  />
                </label>
              </fieldset>
              <details
                className="editor-choices advanced-fields"
                data-detail-section="advanced"
              >
                <summary>Opciones avanzadas</summary>
                <CustomFields
                  schema={active.fieldSchema}
                  values={active.customFields}
                  disabled={busy}
                  onSchema={(fieldSchema) => edit({ fieldSchema })}
                  onValues={(customFields) => edit({ customFields })}
                />
                {currentType &&
                  JSON.stringify(currentType.fieldSchema) !==
                    JSON.stringify(active.fieldSchema) && (
                    <div className="notice">
                      <p>
                        Hay una versión nueva de este tipo. Esta instancia
                        conserva su definición hasta que decidas actualizarla.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          if (
                            !window.confirm(
                              "¿Aplicar la definición actual solo a esta actividad? Los valores incompatibles se quitarán del borrador. La agenda publicada no cambia hasta publicar.",
                            )
                          )
                            return;
                          const compatible = Object.fromEntries(
                            Object.entries(active.customFields).filter(
                              ([key, value]) => {
                                const field = currentType.fieldSchema.find(
                                  (item) => item.key === key,
                                );
                                if (!field) return false;
                                let invalid = false;
                                validateFields(
                                  [field],
                                  { [key]: value },
                                  () => {
                                    invalid = true;
                                  },
                                );
                                return !invalid;
                              },
                            ),
                          );
                          edit({
                            fieldSchema: currentType.fieldSchema,
                            customFields: compatible,
                          });
                        }}
                      >
                        Aplicar definición a esta actividad
                      </Button>
                    </div>
                  )}
              </details>
              <details className="editor-choices" data-detail-section="team">
                <summary>Responsables ({active.responsibles.length})</summary>
                {active.responsibles.map((r, index) => (
                  <div
                    className="selection-row"
                    key={r.assignmentId || `${r.personId}-${index}`}
                  >
                    <span>
                      {catalog.people.find((p) => p.id === r.personId)?.name ||
                        "Persona no disponible"}
                      <small>
                        {catalog.roles.find((role) => role.id === r.roleId)
                          ?.name || "Responsable"}{" "}
                        ·{" "}
                        {r.assignmentId
                          ? "Asignación existente"
                          : "Confirmación pendiente al guardar"}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={busy}
                      aria-label="Quitar responsable"
                      onClick={() =>
                        edit({
                          responsibles: active.responsibles.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <div className="field-grid">
                  <label className="field">
                    Equipo del responsable
                    <select
                      value={team}
                      onChange={(e) => {
                        setTeam(e.target.value);
                        setRole("");
                      }}
                      disabled={busy}
                    >
                      <option value="">Sin equipo</option>
                      {catalog.teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Rol
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      disabled={busy}
                    >
                      <option value="">Sin rol</option>
                      {catalog.roles
                        .filter((r) => !r.teamId || r.teamId === team)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="field">
                    Buscar persona
                    <input
                      type="search"
                      value={peopleQuery}
                      onChange={(event) => setPeopleQuery(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    Persona
                    <select
                      value={person}
                      onChange={(e) => setPerson(e.target.value)}
                      disabled={busy}
                    >
                      <option value="">Seleccionar</option>
                      {catalog.people
                        .filter(
                          (p) =>
                            searchText(p.name).includes(
                              searchText(peopleQuery),
                            ) || p.id === person,
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <Button
                  variant="outline"
                  disabled={busy || !person}
                  onClick={() => {
                    edit({
                      responsibles: [
                        ...active.responsibles,
                        {
                          assignmentId: null,
                          personId: person,
                          teamId: team || null,
                          roleId: role || null,
                        },
                      ],
                    });
                    setPerson("");
                  }}
                >
                  Agregar responsable
                </Button>
              </details>
              <Choices
                key={`${active.clientKey}-songs`}
                label="Canciones en orden"
                section="songs"
                suggested={
                  blockPresentation(currentType?.name ?? active.name).kind ===
                  "music"
                }
                items={catalog.songs}
                value={active.songIds}
                disabled={busy}
                onChange={(songIds) => edit({ songIds })}
              />
              <Choices
                key={`${active.clientKey}-announcements`}
                label="Anuncios"
                section="announcements"
                suggested={
                  blockPresentation(currentType?.name ?? active.name).kind ===
                  "announcement"
                }
                items={catalog.announcements}
                value={active.announcementIds}
                disabled={busy}
                onChange={(announcementIds) => edit({ announcementIds })}
              />
              <Choices
                key={`${active.clientKey}-messages`}
                label="Mensaje"
                section="messages"
                suggested={
                  blockPresentation(currentType?.name ?? active.name).kind ===
                  "message"
                }
                items={catalog.messages}
                value={active.messageIds}
                disabled={busy}
                onChange={(messageIds) => edit({ messageIds })}
              />
              <Choices
                key={`${active.clientKey}-resources`}
                label="Recursos y enlaces"
                section="resources"
                items={catalog.resources}
                value={active.resourceIds}
                disabled={busy}
                onChange={(resourceIds) => edit({ resourceIds })}
              />
              {active.resourceIds.map((id) => {
                const resource = catalog.resources.find((r) => r.id === id);
                const href =
                  resource && resource.storagePath
                    ? `/recursos/${resource.id}`
                    : resource?.url && safeUrl.safeParse(resource.url).success
                      ? resource.url
                      : null;
                return href ? (
                  <a
                    className="button button-ghost resource-link"
                    key={id}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir {resource?.name ?? "recurso"}
                  </a>
                ) : null;
              })}
              <details className="editor-choices">
                <summary>
                  Actividades paralelas ({active.subactivities.length})
                </summary>
                {active.subactivities.map((s, i) => (
                  <fieldset
                    className="editor-fields parallel-activity"
                    disabled={busy}
                    key={s.clientKey}
                  >
                    <label className="field">
                      Nombre de la actividad paralela
                      <input
                        value={s.title}
                        onChange={(e) =>
                          edit({
                            subactivities: active.subactivities.map((v, j) =>
                              j === i ? { ...v, title: e.target.value } : v,
                            ),
                          })
                        }
                      />
                    </label>
                    <div className="field-grid">
                      <label className="field">
                        Comienza a los (segundos)
                        <input
                          type="number"
                          min={0}
                          value={s.offsetSeconds}
                          onChange={(e) =>
                            edit({
                              subactivities: active.subactivities.map((v, j) =>
                                j === i
                                  ? {
                                      ...v,
                                      offsetSeconds: Number(e.target.value),
                                    }
                                  : v,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        Duración (segundos)
                        <input
                          type="number"
                          min={0}
                          value={s.durationSeconds}
                          onChange={(e) =>
                            edit({
                              subactivities: active.subactivities.map((v, j) =>
                                j === i
                                  ? {
                                      ...v,
                                      durationSeconds: Number(e.target.value),
                                    }
                                  : v,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                    <label className="field">
                      Equipo de la actividad paralela
                      <select
                        value={s.teamId ?? ""}
                        onChange={(e) =>
                          edit({
                            subactivities: active.subactivities.map((v, j) =>
                              j === i
                                ? { ...v, teamId: e.target.value || null }
                                : v,
                            ),
                          })
                        }
                      >
                        <option value="">Heredar equipo principal</option>
                        {catalog.teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Responsable de la actividad paralela
                      <select
                        value={s.personId ?? ""}
                        onChange={(event) =>
                          editSub(i, { personId: event.target.value || null })
                        }
                      >
                        <option value="">Sin responsable</option>
                        {catalog.people.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Notas de la actividad paralela
                      <textarea
                        value={s.notes}
                        rows={2}
                        onChange={(e) =>
                          edit({
                            subactivities: active.subactivities.map((v, j) =>
                              j === i ? { ...v, notes: e.target.value } : v,
                            ),
                          })
                        }
                      />
                    </label>
                    <CustomFields
                      schema={s.fieldSchema}
                      values={s.customFields}
                      disabled={busy}
                      onSchema={(fieldSchema) => editSub(i, { fieldSchema })}
                      onValues={(customFields) => editSub(i, { customFields })}
                    />
                    <Button
                      variant="ghost"
                      onClick={() =>
                        edit({
                          subactivities: active.subactivities.filter(
                            (_, j) => i !== j,
                          ),
                        })
                      }
                    >
                      Quitar actividad paralela
                    </Button>
                  </fieldset>
                ))}
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() =>
                    edit({
                      subactivities: [
                        ...active.subactivities,
                        {
                          clientKey: crypto.randomUUID(),
                          title: "Nueva actividad paralela",
                          teamId: null,
                          personId: null,
                          offsetSeconds: 0,
                          durationSeconds: Math.min(60, active.durationSeconds),
                          notes: "",
                          fieldSchema: [],
                          customFields: {},
                        },
                      ],
                    })
                  }
                >
                  Agregar actividad paralela
                </Button>
                <p className="muted">
                  Las paralelas no desplazan el cronograma principal.
                </p>
              </details>
            </>
          ) : (
            <p className="empty muted">
              Seleccioná una actividad para editar sus detalles.
            </p>
          )}
        </section>
      </div>
      <details className="panel duplicate-panel" id="duplicar-reunion">
        <summary>Duplicar reunión</summary>
        <p className="muted">
          Elegí qué copiar. Todas las confirmaciones de la copia vuelven a
          Pendiente.
        </p>
        <fieldset disabled={busy} className="copy-options">
          {(Object.keys(copyLabels) as (keyof CopyOptions)[]).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={copyOptions[key]}
                onChange={(e) =>
                  setCopyOptions((s) => ({ ...s, [key]: e.target.checked }))
                }
              />
              {copyLabels[key]}
            </label>
          ))}
        </fieldset>
        <Button
          disabled={busy}
          variant="outline"
          onClick={async () => {
            if (pending.current) return;
            pending.current = true;
            setBusy(true);
            setError("");
            try {
              if (demo) {
                const next = copyForPreview(snapshot, copyOptions);
                setSnapshot(next);
                setLastSaved(next);
                setSelected(next.blocks[0]?.clientKey ?? "");
                setMessage("Copia ficticia creada; confirmaciones pendientes.");
              } else {
                if (dirty)
                  throw new Error("Guardá el borrador antes de duplicarlo.");
                const next = await duplicateMeeting(
                  snapshot.meetingId,
                  {
                    ...snapshot.metadata,
                    title: snapshot.metadata.title + " (copia)",
                  },
                  copyOptions,
                );
                router.push(`/cronograma/${next.meetingId}`);
              }
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "No se pudo duplicar.",
              );
            } finally {
              pending.current = false;
              setBusy(false);
            }
          }}
        >
          {demo ? "Simular duplicación" : "Duplicar como borrador"}
        </Button>
      </details>
      {!demo && snapshot.publishedRevisionId && (
        <Link
          className="button button-ghost"
          href={`/reuniones/${snapshot.meetingId}`}
        >
          Ver agenda pública publicada
        </Link>
      )}
    </>
  );
}

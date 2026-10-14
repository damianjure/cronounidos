"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  saveMeeting,
  duplicateMeeting,
} from "@/app/(interno)/cronograma/actions";
import {
  safeUrl,
  emptyBlock,
  reorder,
  plannedTimes,
  snapshotSchema,
  defaultCopyOptions,
  copyForPreview,
  type Catalog,
  type CatalogItem,
  type EditorSnapshot,
  type EditorBlock,
  type CopyOptions,
} from "@/lib/editor/model";
import { optimisticSave } from "@/lib/editor/transaction";
import { CustomFields } from "./custom-fields";
import { SortableBlock } from "./sortable-block";
const copyLabels: Record<keyof CopyOptions, string> = {
  structure: "Estructura y duraciones",
  responsibles: "Responsables",
  songs: "Canciones",
  announcements: "Anuncios",
  notes: "Notas y mensaje",
  resources: "Recursos",
};
function Choices({
  label,
  items,
  value,
  onChange,
  disabled,
}: {
  label: string;
  items: CatalogItem[];
  value: string[];
  onChange: (s: string[]) => void;
  disabled: boolean;
}) {
  return (
    <details className="editor-choices">
      <summary>
        {label} ({value.length})
      </summary>
      <fieldset disabled={disabled}>
        {items.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={value.includes(item.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, item.id]
                    : value.filter((id) => id !== item.id),
                )
              }
            />
            {item.name}
          </label>
        ))}
        {!items.length && (
          <p className="muted">No hay elementos de catálogo disponibles.</p>
        )}
      </fieldset>
      {value.map((id, index) => (
        <div className="selection-row" key={`${id}-${index}`}>
          <span>
            {items.find((i) => i.id === id)?.name || "Elemento no disponible"}
          </span>
          <button
            type="button"
            className="icon-button"
            disabled={disabled || index === 0}
            aria-label={`Mover ${items.find((i) => i.id === id)?.name || "elemento"} antes`}
            onClick={() => {
              const next = [...value];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              onChange(next);
            }}
          >
            <ArrowUp size={16} />
          </button>
        </div>
      ))}
    </details>
  );
}
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
  const pending = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [failDemo, setFailDemo] = useState(false);
  const [copyOptions, setCopyOptions] = useState(defaultCopyOptions);
  const [newType, setNewType] = useState("");
  const [person, setPerson] = useState("");
  const [team, setTeam] = useState("");
  const [role, setRole] = useState("");
  const durationBefore = useRef<EditorSnapshot | null>(null);
  const router = useRouter();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const times = plannedTimes(snapshot.metadata, snapshot.blocks);
  const active = snapshot.blocks.find((b) => b.clientKey === selected);
  const [lastSaved, setLastSaved] = useState(initial);
  const dirty = JSON.stringify(snapshot) !== JSON.stringify(lastSaved);
  const edit = (patch: Partial<EditorBlock>) => {
    setSnapshot((s) => ({
      ...s,
      blocks: s.blocks.map((b) =>
        b.clientKey === selected ? { ...b, ...patch } : b,
      ),
    }));
    setMessage("");
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
  }
  async function move(key: string, offset: number) {
    const index = snapshot.blocks.findIndex((b) => b.clientKey === key);
    await persist({
      ...snapshot,
      blocks: reorder(snapshot.blocks, key, index + offset),
    });
  }
  function dragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const target = snapshot.blocks.findIndex(
      (b) => b.clientKey === event.over?.id,
    );
    if (target < 0) return;
    void persist({
      ...snapshot,
      blocks: reorder(snapshot.blocks, String(event.active.id), target),
    });
  }
  return (
    <>
      <div className="page-heading">
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
        </div>
      </div>
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
            <span className="pill">
              {Math.round(
                snapshot.blocks.reduce(
                  (total, b) => total + b.durationSeconds,
                  0,
                ) / 60,
              )}{" "}
              min
            </span>
          </div>
          <p className="muted editor-hint">
            Arrastrá desde el handle o usá las flechas. También podés reordenar
            con el teclado.
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={dragEnd}
          >
            <SortableContext
              items={snapshot.blocks.map((b) => b.clientKey)}
              strategy={verticalListSortingStrategy}
            >
              <ol className="editor-timeline">
                {snapshot.blocks.map((b, index) => (
                  <SortableBlock
                    key={b.clientKey}
                    block={b}
                    time={times[index]}
                    index={index}
                    count={snapshot.blocks.length}
                    selected={selected === b.clientKey}
                    busy={busy}
                    onSelect={() => setSelected(b.clientKey)}
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
          <div className="editor-add">
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
        <section className="panel block-detail">
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
              <fieldset className="editor-fields" disabled={busy}>
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
                    maxLength={12000}
                    value={active.notes}
                    onChange={(e) => edit({ notes: e.target.value })}
                  />
                </label>
              </fieldset>
              <CustomFields
                schema={active.fieldSchema}
                values={active.customFields}
                disabled={busy}
                onSchema={(fieldSchema) => edit({ fieldSchema })}
                onValues={(customFields) => edit({ customFields })}
              />
              <details className="editor-choices">
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
                    Persona
                    <select
                      value={person}
                      onChange={(e) => setPerson(e.target.value)}
                      disabled={busy}
                    >
                      <option value="">Seleccionar</option>
                      {catalog.people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
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
                label="Canciones en orden"
                items={catalog.songs}
                value={active.songIds}
                disabled={busy}
                onChange={(songIds) => edit({ songIds })}
              />
              <Choices
                label="Anuncios"
                items={catalog.announcements}
                value={active.announcementIds}
                disabled={busy}
                onChange={(announcementIds) => edit({ announcementIds })}
              />
              <Choices
                label="Mensaje"
                items={catalog.messages}
                value={active.messageIds}
                disabled={busy}
                onChange={(messageIds) => edit({ messageIds })}
              />
              <Choices
                label="Recursos y enlaces"
                items={catalog.resources}
                value={active.resourceIds}
                disabled={busy}
                onChange={(resourceIds) => edit({ resourceIds })}
              />
              {active.resourceIds.map((id) => {
                const resource = catalog.resources.find((r) => r.id === id);
                return resource?.url &&
                  safeUrl.safeParse(resource.url).success ? (
                  <a
                    className="button button-ghost resource-link"
                    key={id}
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir {resource.name}
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
      <details className="panel duplicate-panel">
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

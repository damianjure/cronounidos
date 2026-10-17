"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { browserClient } from "@/lib/supabase/browser";
import {
  durationLabel,
  liveSnapshot,
  liveTiming,
  type LiveSnapshot,
} from "@/lib/live/model";
import {
  operateLive,
  type LiveResult,
} from "@/app/(interno)/en-vivo/[id]/actions";
// Reads go straight from the browser to Supabase (RPC under RLS), not through
// Vercel: many devices behind one church Wi-Fi IP polling a Vercel function
// can trip Vercel's automatic bot mitigation mid-meeting. See
// docs/REVIEW-2026-10-17.md. Commands still use the server action.
const POLL_MS = 10000;
const POLL_WITH_REALTIME_MS = 45000;
const REALTIME_JITTER_MS = 2500;
type Command = "start" | "next" | "finish_block" | "close";
export function LiveConsole({ initial }: { initial: LiveSnapshot }) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(initial);
  const [now, setNow] = useState(Date.parse(initial.serverNow));
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [online, setOnline] = useState(true);
  const [realtime, setRealtime] = useState(false);
  const [closeAcknowledged, setCloseAcknowledged] = useState(false);
  const reference = useRef<{ server: number; local: number } | null>(null);
  const latest = useRef(initial);
  const request = useRef<{
    meetingId: string;
    version: number;
    requestId: string;
    command: Command;
  } | null>(null);
  const mounted = useRef(true);
  const denied = useRef(false);
  const supabase = useRef<ReturnType<typeof browserClient> | null>(null);
  const realtimeOk = useRef(false);
  const lastRead = useRef(0);
  const apply = useCallback((result: LiveResult, started: number) => {
    if (!mounted.current) return;
    if (!result.ok) {
      setMessage(result.message);
      if (result.denied) {
        denied.current = true;
        setSnapshot(null);
      }
      return;
    }
    if (denied.current) return;
    const next = result.snapshot;
    if (
      next.version < latest.current.version ||
      (next.version === latest.current.version &&
        Date.parse(next.serverNow) < Date.parse(latest.current.serverNow))
    )
      return;
    latest.current = next;
    setSnapshot(next);
    const local = performance.now();
    const server = Date.parse(next.serverNow) + (local - started) / 2;
    reference.current = { local, server };
    setNow(server);
  }, []);
  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    const started = performance.now();
    try {
      lastRead.current = Date.now();
      const { data, error } = await (supabase.current ??= browserClient()).rpc("get_live_snapshot", {
        p_meeting: initial.meetingId,
      });
      // supabase-js reports transport failures as errors without a PostgREST
      // code: treat them like a thrown network error (offline handling below).
      if (error && !error.code) throw new Error("network");
      const parsed = error ? null : liveSnapshot.safeParse(data);
      const result: LiveResult =
        parsed && parsed.success
          ? { ok: true, snapshot: parsed.data }
          : {
              ok: false,
              message:
                "No se pudo sincronizar la reunión. Revisá tu conexión y permisos.",
              denied:
                !!error &&
                (error.message.includes("Forbidden") ||
                  error.message.includes("Published meeting")),
            };
      apply(result, started);
      // A successful read may arrive after the browser emitted `offline`.
      // Keep the latest connectivity state instead of reviving stale controls.
      if (result.ok && mounted.current) setOnline(navigator.onLine);
    } catch {
      if (mounted.current) {
        setOnline(false);
        setMessage(
          "No se pudo sincronizar. Se conserva la última lectura; no se encolan operaciones offline.",
        );
      }
    }
  }, [apply, initial.meetingId]);
  useEffect(() => {
    mounted.current = true;
    reference.current = {
      server: Date.parse(initial.serverNow),
      local: performance.now(),
    };
    const initialize = setTimeout(() => {
      setOnline(navigator.onLine);
      void refresh();
    }, 0);
    const tick = setInterval(() => {
      const ref = reference.current;
      if (ref) setNow(ref.server + performance.now() - ref.local);
    }, 1000);
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      // With Realtime healthy, polling is only a safety net.
      const every = realtimeOk.current ? POLL_WITH_REALTIME_MS : POLL_MS;
      if (Date.now() - lastRead.current >= every - 500) void refresh();
    }, POLL_MS);
    const reconnect = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void refresh();
    };
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", reconnect);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    const client = (supabase.current ??= browserClient());
    let channel: RealtimeChannel | null = null;
    async function connect() {
      const { data, error } = await client.auth.getSession();
      if (!mounted.current) return;
      if (error || !data.session) {
        setRealtime(false);
        return;
      }
      await client.realtime.setAuth(data.session.access_token);
      if (!mounted.current) return;
      channel = client
        .channel(`meeting-live:${initial.meetingId}`, {
          config: { postgres_changes_options: { wait: true } },
        })
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "meeting_live_state",
            filter: `meeting_id=eq.${initial.meetingId}`,
          },
          () => {
            // Spread the refetch so every device does not hit at once.
            setTimeout(
              () => void refresh(),
              Math.random() * REALTIME_JITTER_MS,
            );
          },
        )
        .on("system", {}, (payload) => {
          if (!mounted.current || payload.extension !== "postgres_changes")
            return;
          realtimeOk.current = payload.status === "ok";
          setRealtime(payload.status === "ok");
          if (payload.status === "ok") void refresh();
          else
            setMessage(
              "Realtime no disponible. La consulta periódica sigue activa; podés sincronizar manualmente.",
            );
        })
        .subscribe((status) => {
          if (mounted.current && status !== "SUBSCRIBED") {
            realtimeOk.current = false;
            setRealtime(false);
          }
        });
    }
    void connect().catch(() => {
      if (mounted.current) setRealtime(false);
    });
    return () => {
      mounted.current = false;
      clearTimeout(initialize);
      clearInterval(tick);
      clearInterval(poll);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", reconnect);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      if (channel) void client.removeChannel(channel);
    };
  }, [initial.meetingId, initial.serverNow, refresh]);
  async function operate(command: Command) {
    if (pending || !snapshot || !navigator.onLine) return;
    setPending(true);
    setMessage("");
    // Keep the exact request after an uncertain network failure: retrying cannot
    // advance twice even if the server committed before the response was lost.
    if (
      !request.current ||
      request.current.command !== command ||
      request.current.version !== snapshot.version
    )
      request.current = {
        meetingId: snapshot.meetingId,
        version: snapshot.version,
        requestId: crypto.randomUUID(),
        command,
      };
    const started = performance.now();
    try {
      const result = await operateLive(request.current);
      apply(result, started);
      request.current = null;
      if (!result.ok) await refresh();
    } catch {
      setMessage(
        "Respuesta no recibida. Sincronizá antes de reintentar; el mismo pedido es seguro.",
      );
      await refresh();
    } finally {
      if (mounted.current) setPending(false);
    }
  }
  if (!snapshot)
    return (
      <>
        <h1>Modo en vivo</h1>
        <p role="alert" className="notice">
          Acceso no autorizado o reunión no disponible. No se conserva
          información en pantalla.
        </p>
      </>
    );
  const timing = liveTiming(snapshot, now);
  const active = timing.blocks.find((b) => b.id === snapshot.activeBlockId);
  const next = timing.blocks.find((b) => b.status === "pending");
  const clock = (instant: number) =>
    new Intl.DateTimeFormat("es-AR", {
      timeStyle: "medium",
      timeZone: snapshot.timezone,
    }).format(new Date(instant));
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>En vivo · {snapshot.title}</h1>
          <p className="muted">
            Plan publicado congelado · versión operativa {snapshot.version}
          </p>
        </div>
        <Link className="button button-outline" href="/cronograma">
          Cronograma
        </Link>
      </div>
      <p className="notice" role="status">
        {!online
          ? "Sin conexión: lectura estimada. Operaciones deshabilitadas."
          : realtime
            ? "Sincronización Realtime activa"
            : "Sincronización por consulta periódica (respaldo cada 10 s)"}
      </p>
      {message && (
        <p role="alert" className="notice error">
          {message}
        </p>
      )}
      <section className="panel live-focus" aria-label="Actividad en curso">
        <p>
          Reloj de referencia del servidor: <time>{clock(now)}</time>
        </p>
        <h2>
          {snapshot.status === "finished"
            ? "Reunión cerrada"
            : active
              ? active.name
              : snapshot.status === "ready"
                ? "Lista para iniciar"
                : "En espera entre actividades"}
        </h2>
        {active && (
          <>
            <p className="live-timer" aria-label="Tiempo transcurrido">
              {durationLabel(active.elapsedSeconds)}
            </p>
            <p>
              Duración prevista: {durationLabel(active.durationSeconds)} ·{" "}
              {active.elapsedSeconds > active.durationSeconds
                ? `Excedida ${durationLabel(active.elapsedSeconds - active.durationSeconds)}`
                : `Restante ${durationLabel(active.durationSeconds - active.elapsedSeconds)}`}
            </p>
            <p>
              {active.deviationSeconds > 0
                ? "Demora al iniciar"
                : active.deviationSeconds < 0
                  ? "Adelanto al iniciar"
                  : "Inicio puntual"}
              : {durationLabel(Math.abs(active.deviationSeconds))}
            </p>
          </>
        )}
        <p>
          Próxima:{" "}
          {snapshot.status === "finished"
            ? "No corresponde"
            : (next?.name ?? "Sin actividades pendientes")}
        </p>
        <p>
          {snapshot.status === "finished"
            ? "Cierre efectivo"
            : "Fin estimado (ETA)"}
          : {clock(timing.eta)}
        </p>
        {snapshot.canOperate && snapshot.status !== "finished" && (
          <div className="live-controls">
            <div className="editor-toolbar">
              {snapshot.status === "ready" ? (
                <Button
                  disabled={pending || !online || !snapshot.blocks.length}
                  onClick={() => void operate("start")}
                >
                  Iniciar reunión y primera actividad
                </Button>
              ) : (
                <>
                  <Button
                    disabled={pending || !online || (!active && !next)}
                    onClick={() => void operate("next")}
                  >
                    {active
                      ? "Finalizar y avanzar"
                      : "Iniciar siguiente actividad"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending || !online || !active}
                    onClick={() => void operate("finish_block")}
                  >
                    Finalizar actividad sin avanzar
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                disabled={pending || !online}
                onClick={() => void refresh()}
              >
                Sincronizar ahora
              </Button>
            </div>
            {snapshot.status === "running" && (
              <details>
                <summary>Cerrar reunión</summary>
                <p>
                  El cierre es irreversible. Las actividades aún pendientes
                  quedarán sin ejecutar. El feedback se programará desde el
                  cierre efectivo, no desde la hora prevista.
                </p>
                <label className="live-close-confirm">
                  <input
                    type="checkbox"
                    checked={closeAcknowledged}
                    onChange={(e) => setCloseAcknowledged(e.target.checked)}
                  />{" "}
                  Confirmo el cierre definitivo de la reunión.
                </label>
                <Button
                  variant="outline"
                  disabled={pending || !online || !closeAcknowledged}
                  onClick={() => void operate("close")}
                >
                  Cerrar reunión definitivamente
                </Button>
              </details>
            )}
          </div>
        )}
        {!snapshot.canOperate && (
          <p className="muted">
            Vista de consulta. Para operar se necesita permiso global de
            operación en vivo.
          </p>
        )}
      </section>
      <section
        className="panel"
        style={{ marginTop: 24 }}
        aria-label="Ejecución de actividades"
      >
        <h2>Planificado vs. real</h2>
        <ol className="member-list">
          {timing.blocks.map((b) => (
            <li
              key={b.id}
              aria-current={
                b.id === snapshot.activeBlockId ? "step" : undefined
              }
            >
              <h3>{b.name}</h3>
              <p>
                {b.status === "running"
                  ? "En curso"
                  : b.status === "finished"
                    ? "Finalizada"
                    : snapshot.status === "finished"
                      ? "No ejecutada"
                      : "Pendiente"}
              </p>
              <p>
                Previsto: {clock(Date.parse(b.plannedStart))} —{" "}
                {clock(Date.parse(b.plannedStart) + b.durationSeconds * 1000)}
              </p>
              <p>
                Real: {b.actualStart ? clock(Date.parse(b.actualStart)) : "—"} —{" "}
                {b.actualEnd ? clock(Date.parse(b.actualEnd)) : "—"}
              </p>
              {b.actualStart && (
                <p>
                  Tiempo real: {durationLabel(b.elapsedSeconds)} · Desvío de
                  inicio: {durationLabel(b.deviationSeconds)}
                </p>
              )}
              {b.status === "pending" && snapshot.status !== "finished" && (
                <p>Inicio estimado: {clock(b.estimatedStart)}</p>
              )}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

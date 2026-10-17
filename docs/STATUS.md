# Estado actual — Crono Unidos

> Documento vivo de una página. Actualizarlo en cada cambio de estado. Los `SPRINT-*.md`, `EMAIL.md` y `SETUP.md` conservan el historial y la evidencia detallada.

**Última actualización:** 17/10/2026 · rama `codex/sprint-2-editor` · Production **deshabilitada** · Preview protegida en Vercel · Supabase independiente `ivmhgizuofxdvvvzdxnl` (33 migraciones, sin seed).

## Qué funciona (verificado en local/CI/Preview)

| Área | Estado |
|---|---|
| Auth email, aprobación, permisos granulares, RLS | ✅ Sprints 0–1 |
| Editor: crear/duplicar/publicar, drag táctil/mouse/teclado, plantillas, contenidos, archivos privados, edición acotada por equipo | ✅ Sprint 2 |
| Confirmaciones, reemplazos, conflictos, calendario, matriz de cobertura | ✅ Sprint 3 |
| Modo en vivo: cronómetros con reloj de servidor, ETA, Realtime + polling, sin operaciones offline | ✅ Sprint 4 |
| Feedback +10 min in-app, panel solo admin | ✅ Sprint 5 (in-app) |
| Correo de feedback (Brevo) | ✅ Aceptación y recepción del aviso técnico verificadas en Gmail/Promociones; Production pendiente |

Última CI remota verde comprobada: **`34aa19a` (run 39030215209)**, con foundation y authenticated-local aprobados. F1–F4 reparados en `bd76ed4`, `b219ae3` y `52f01bc`: lint sin warnings, typecheck, **239 tests / 19 suites**, build y **54 E2E Chrome** aprobados. Estrés SQL aislado de 200/1000 usuarios también aprobado. Correcciones pusheadas y desplegadas en Preview Ready; smoke remoto y aviso seguro de administración verificados. Ver resolución en `REVIEW-2026-10-17-CODEX.md`.

## Gates antes de Production

1. **Brevo:** ~~bloqueo de IP~~ resuelto y envío aceptado en Preview (17/10). Recepción comprobada en Gmail/Promociones (Message-ID coincide con el outbox). Faltan variables de Production y confirmar bandeja/alias de respuestas (ver `EMAIL.md`).
2. ~~**CSP**~~ aplicada (17/10, `0f37490`): se recorrieron en Preview las páginas públicas e internas con sesión de admin (inicio, cronograma, editor, contenidos, catálogos, calendario, cobertura, confirmaciones, personas, administración, feedback, en vivo con Realtime). No hubo violaciones propias; la prueba `new Function` de zod se evita con `jitless`. Subida bajo CSP verificada nuevamente en Chrome local desktop/mobile; falta repetirla en Preview remota.
3. **Supabase Auth:** activar protección de contraseñas filtradas (el advisor la sigue marcando el 17/10; se activa en el panel: Auth → Password security).
4. **Scheduler:** ✅ en Preview (17/10): `pg_cron` y `pg_net` presentes, los 2 jobs activos y más de 1000 ejecuciones `succeeded` en 24 h. Repetir `scripts/check-scheduler.sql` si Production usa otro proyecto Supabase.
5. **QA remota** de Auth/RLS con cuentas de distintos roles y aceptación de invitación.
6. **PWA en dispositivos físicos** iOS/Android (instalación y gestos). El propietario tiene ambos teléfonos disponibles; falta ejecutar y registrar el recorrido.
7. **Región `gru1`:** ✅ desplegada y medida (17/10, 12 pedidos espaciados por ruta): `/` p50 250 ms (antes ~700 ms en `iad1`), `/ingresar` p50 171 ms. Falta probar el modo en vivo con muchos dispositivos reales detrás de una misma IP; las lecturas en vivo ya van directo a Supabase (ver `REVIEW-2026-10-17.md`).
8. **Reparaciones del review:** ✅ F1–F4 reparados, pusheados y desplegados/verificados en Preview; CI 39030215209 aprobada en `34aa19a`. No habilita Production mientras sigan abiertos los demás gates.
9. **Dominio** `crono.damianjure.com` (DNS en Cloudflare), redirects de Auth y variables de Production.

## Cambios del 17/10/2026 (CI comprobada hasta `87f67ae`)

- Test de contrato `SECURITY DEFINER` (`tests/integration/security-definer.test.ts`, ver `DATABASE.md`).
- CSP aplicada (`next.config.ts`, tras checkpoint inicial Report-Only).
- Compensación de alta/invitación: F1 reparado localmente; ante un fallo o resultado incierto se conserva Auth y se exige revisión de membresía, nunca borrado automático.
- Validación zod en acciones de administración (`tests/admin-input.test.ts`).
- Editor: F2 reparado localmente; movimientos disponibles durante el guardado, edición restante bloqueada y regresiones de persistencia/rollback en desktop/mobile.
- `scripts/check-scheduler.sql` para verificar pg_cron/pg_net y jobs.
- Limpieza local de builds `.next-*` viejos.
- Región `gru1`, lecturas en vivo directas a Supabase con polling adaptativo y `SubmitButton` contra doble envío (eslint/tsc/219 tests/build verdes; E2E verde en CI `ab65774`).

## Review y estrés del 17/10/2026

Ver `REVIEW-2026-10-17.md`. La concurrencia y los cortes pasaron sin pérdidas ni duplicados. Gates nuevos: **región de Vercel → `gru1`**, **riesgo de bloqueo del firewall de Vercel con IP compartida en modo en vivo**, **doble envío en formularios**.

## Próximos pasos sugeridos

**Mejora desktop autorizada:** implementada y verificada localmente (`b462517`, `33712d6`): alta guiada, cabecera/acciones compactas, detalle por secciones, búsqueda de bibliotecas/personas y feedback de movimiento/guardado. Lint/tipos/build y **245 tests**, Chrome **38 base + 24 autenticados** aprobados. [Entrega y límites](DESKTOP-EDITOR.md). Push/CI/Preview de esta mejora pendientes de verificar. Rediseño móvil pospuesto por el propietario; sus regresiones existentes siguen pasando. Sin migraciones, cambios de secretos ni activación de Production.

1. Completar instalación/recorrido de la PWA en Android e iPhone. Preview ya está desplegada; la región `gru1` no requiere otro cambio de infraestructura.
2. Completar los gates abiertos (seguridad, QA remota, PWA física, alias de respuestas y Production) y operar **una reunión real** con 2–3 líderes antes de sumar funcionalidades.
3. Deuda técnica: dividir `meeting-editor.tsx` (plan en `IMPLEMENTATION-NOTES.md`).

### Referencia UX desktop — 17/10/2026

Se revisó Tecnoiglesia One en Brave con sesión existente: pestañas, selector de bloques, formularios de predicación/canción, biblioteca, alta de rol por área, recursos/notas, datos del servicio y selector vacío de plantillas. Primer recorrido cancelado sin guardar; sin escrituras de contenido desde Codex. [Propuesta y límites](REFERENCIA-DESKTOP-TECNOIGLESIA.md): adoptar carga guiada por tipo, toolbar compacta y detalle contextual sobre el modelo actual. **Análisis, no rediseño implementado ni ampliación del PRD.** El propietario cargó tres bloques: filas con handle/icono/título/duración/notas/acciones, total 46/90 min (44 restantes). Después se observó el cambio de orden del propietario (lectura antes de bienvenida), con duraciones intactas; no se verificaron trayectoria/animación ni persistencia. Se abrió Editar Bloque de bienvenida sin cambiar campos ni guardar; Cancelar/cierre no mostró cambio verificable y puede quedar abierto para cierre manual. Scroll/arrastre nativo sigue bloqueado con `noWindowsAvailable` incluso con Brave visible; Chrome alternativo mostró pantalla vacía. Codex no reordenó ni eliminó bloques. PWA física y gates de Production permanecen pendientes.

## Segunda revisión integral — 17/10/2026

**Actualización de referencia UX:** el propietario adjuntó una grabación de 24,15 s; se observaron el bloque atenuado siguiendo el puntero, desplazamiento anticipado de filas y asentamiento al soltar. La referencia visual del drag ya está revisada sin depender del control de Brave. No verifica persistencia/red/teclado/táctil ni implica cambios de código o cierre de gates de Production; detalle en `REFERENCIA-DESKTOP-TECNOIGLESIA.md`.

[Informe y reproducciones](REVIEW-2026-10-17-CODEX.md). Pruebas existentes: 219/219, SQL/RLS 95/95 (incluidas en las 219), Chrome base 30/30 y autenticado 18/18. Sondas CSP + subida local 2/2; cola del editor falla 2/2 y compensación administrativa falla 1/1 al exigir el comportamiento seguro/documentado. **No está todo aprobado por el solo hecho de que CI esté verde.** Remoto: 33 migraciones, RLS en todas las tablas públicas, dos jobs activos y una fila de correo accepted; la recepción se comprobó después por Gmail (ver actualización). En ese checkpoint del review no se cambiaron funciones ni servicios.

### Reparaciones verificadas en local — 17/10/2026

F1 conserva Auth y exige reconciliación ante errores de membresía (14 pruebas de orquestación). F2 permite encolar movimientos: 6 E2E nuevas comprueban orden final, versión, recarga y rollback del primer/segundo guardado. F3/F4 usan directorios propios y aserciones de estrés; 6 regresiones verifican protección de rutas y fallos con exit code no cero. Estrés SQL: 200 usuarios / 121 solicitudes y 1000 usuarios / 761 solicitudes, sin duplicados y con aserciones completas, ambos exit 0. **No son 1000 navegadores ni una prueba del Wi-Fi real.** Sin cambios remotos ni activación de Production.

### Avance de Preview y correo — 17/10/2026

Cuatro commits hasta `34aa19a` pusheados a `codex/sprint-2-editor`. Preview **Ready**, `dpl_23o524cSA1jstjv56QxpkvpPYbK7`, funciones `gru1`; CI **39030215209 aprobada**. Smoke: manifest 200, cronograma sin sesión 307 a ingreso, worker sin secreto 401. Chrome con sesión existente muestra el nuevo aviso seguro de membresía (solo lectura; no se simuló fallo de alta remoto). Correo técnico anterior recibido en Gmail/Promociones, correlacionado por Message-ID; sin reenvío. Production no activa, rama main y sin variables; sin cambios de configuración.

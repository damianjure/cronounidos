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
| Correo de feedback (Brevo) | ✅ Aceptado por Brevo en Preview (17/10, tras desactivar el bloqueo de IP); falta confirmar la recepción |

Última CI remota verde comprobada: `87f67ae` (run 39005226983), **anterior a las reparaciones**. F1–F4 se repararon localmente en `bd76ed4`, `b219ae3` y `52f01bc`: lint sin warnings, typecheck, **239 tests / 19 suites**, build y **54 E2E Chrome** aprobados. Estrés SQL aislado de 200/1000 usuarios también aprobado. **Estas reparaciones todavía no están pusheadas ni desplegadas en Preview; su nueva CI está pendiente.** Ver resolución en `REVIEW-2026-10-17-CODEX.md`.

## Gates antes de Production

1. **Brevo:** ~~bloqueo de IP~~ resuelto y envío aceptado en Preview (17/10). Falta confirmar la recepción en la bandeja y configurar las variables de Production (ver `EMAIL.md`).
2. ~~**CSP**~~ aplicada (17/10, `0f37490`): se recorrieron en Preview las páginas públicas e internas con sesión de admin (inicio, cronograma, editor, contenidos, catálogos, calendario, cobertura, confirmaciones, personas, administración, feedback, en vivo con Realtime). No hubo violaciones propias; la prueba `new Function` de zod se evita con `jitless`. Subida bajo CSP verificada nuevamente en Chrome local desktop/mobile; falta repetirla en Preview remota.
3. **Supabase Auth:** activar protección de contraseñas filtradas (el advisor la sigue marcando el 17/10; se activa en el panel: Auth → Password security).
4. **Scheduler:** ✅ en Preview (17/10): `pg_cron` y `pg_net` presentes, los 2 jobs activos y más de 1000 ejecuciones `succeeded` en 24 h. Repetir `scripts/check-scheduler.sql` si Production usa otro proyecto Supabase.
5. **QA remota** de Auth/RLS con cuentas de distintos roles y aceptación de invitación.
6. **PWA en dispositivos físicos** iOS/Android (instalación y gestos).
7. **Región `gru1`:** ✅ desplegada y medida (17/10, 12 pedidos espaciados por ruta): `/` p50 250 ms (antes ~700 ms en `iad1`), `/ingresar` p50 171 ms. Falta probar el modo en vivo con muchos dispositivos reales detrás de una misma IP; las lecturas en vivo ya van directo a Supabase (ver `REVIEW-2026-10-17.md`).
8. **Reparaciones del review:** F1–F4 reparados y validados localmente. Falta push, CI nueva y deploy/verificación de Preview antes de promover el candidato; no confundir CI verde de `87f67ae` con CI de las correcciones.
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

1. Subir las correcciones locales F1–F4, verificar su nueva CI y Preview protegida. La región `gru1` ya estaba configurada; no requiere otro cambio de infraestructura.
2. Completar los gates abiertos (recepción, seguridad, QA remota, PWA física y Production) y operar **una reunión real** con 2–3 líderes antes de sumar funcionalidades.
3. Deuda técnica: dividir `meeting-editor.tsx` (plan en `IMPLEMENTATION-NOTES.md`).

## Segunda revisión integral — 17/10/2026

[Informe y reproducciones](REVIEW-2026-10-17-CODEX.md). Pruebas existentes: 219/219, SQL/RLS 95/95 (incluidas en las 219), Chrome base 30/30 y autenticado 18/18. Sondas CSP + subida local 2/2; cola del editor falla 2/2 y compensación administrativa falla 1/1 al exigir el comportamiento seguro/documentado. **No está todo aprobado por el solo hecho de que CI esté verde.** Remoto: 33 migraciones, RLS en todas las tablas públicas, dos jobs activos y una fila de correo accepted; recepción aún no confirmada. Sin cambios funcionales ni de servicios en esta revisión.

### Reparaciones verificadas en local — 17/10/2026

F1 conserva Auth y exige reconciliación ante errores de membresía (14 pruebas de orquestación). F2 permite encolar movimientos: 6 E2E nuevas comprueban orden final, versión, recarga y rollback del primer/segundo guardado. F3/F4 usan directorios propios y aserciones de estrés; 6 regresiones verifican protección de rutas y fallos con exit code no cero. Estrés SQL: 200 usuarios / 121 solicitudes y 1000 usuarios / 761 solicitudes, sin duplicados y con aserciones completas, ambos exit 0. **No son 1000 navegadores ni una prueba del Wi-Fi real.** Sin cambios remotos ni activación de Production.

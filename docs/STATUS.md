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

Última CI verde: `ab65774` (17/10, run 39004001214: lint, typecheck, 219 tests / 17 suites, build y E2E autenticada). La E2E de modo en vivo fallaba de forma intermitente en `976bc4d` y anteriores; con lecturas directas a Supabase la espera apuntaba a la server action vieja y se corrigió en `ab65774`.

## Gates antes de Production

1. **Brevo:** ~~bloqueo de IP~~ resuelto y envío aceptado en Preview (17/10). Falta confirmar la recepción en la bandeja y configurar las variables de Production (ver `EMAIL.md`).
2. **CSP:** recorrer Preview sin violaciones en consola y pasar `Content-Security-Policy-Report-Only` → `Content-Security-Policy` (`DECISIONS.md`).
3. **Supabase Auth:** activar protección de contraseñas filtradas.
4. **Scheduler:** `scripts/check-scheduler.sql` sin errores en el entorno destino (`SETUP.md`).
5. **QA remota** de Auth/RLS con cuentas de distintos roles y aceptación de invitación.
6. **PWA en dispositivos físicos** iOS/Android (instalación y gestos).
7. **Región `gru1`** (ya configurada en `vercel.json`, falta deploy) y prueba del modo en vivo con muchos dispositivos detrás de una misma IP; las lecturas en vivo ya van directo a Supabase (ver `REVIEW-2026-10-17.md`).
8. **Dominio** `crono.damianjure.com` (DNS en Cloudflare), redirects de Auth y variables de Production.

## Cambios del 17/10/2026 (verificados en CI `ab65774`)

- Test de contrato `SECURITY DEFINER` (`tests/integration/security-definer.test.ts`, ver `DATABASE.md`).
- CSP en modo Report-Only (`next.config.ts`).
- Alta de usuario: se borra la cuenta Auth si falla la membresía.
- Validación zod en acciones de administración (`tests/admin-input.test.ts`).
- Editor: movimientos durante un guardado se encolan en vez de ignorarse.
- `scripts/check-scheduler.sql` para verificar pg_cron/pg_net y jobs.
- Limpieza local de builds `.next-*` viejos.
- Región `gru1`, lecturas en vivo directas a Supabase con polling adaptativo y `SubmitButton` contra doble envío (eslint/tsc/219 tests/build verdes; E2E verde en CI `ab65774`).

## Review y estrés del 17/10/2026

Ver `REVIEW-2026-10-17.md`. La concurrencia y los cortes pasaron sin pérdidas ni duplicados. Gates nuevos: **región de Vercel → `gru1`**, **riesgo de bloqueo del firewall de Vercel con IP compartida en modo en vivo**, **doble envío en formularios**.

## Próximos pasos sugeridos

1. ~~Verificar los cambios del 17/10 en CI~~ hecho (`ab65774`). Falta deploy a Preview para medir `gru1`.
2. Cerrar los gates 1–4 (configuración) y operar **una reunión real** con 2–3 líderes antes de sumar funcionalidades.
3. Deuda técnica: dividir `meeting-editor.tsx` (plan en `IMPLEMENTATION-NOTES.md`).

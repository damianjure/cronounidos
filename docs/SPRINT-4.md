# Sprint 4 — Publicación y modo en vivo

## Entrega local en verificación (16/10/2026)

Implementadas consola `/en-vivo/[id]`, transiciones autorizadas/versionadas/idempotentes, revisión publicada congelada, tiempos reales, cronómetro, adelanto/demora, ETA y recuperación por Realtime/polling. El cierre es explícito; no se da por ejecutado lo pendiente. El borrador puede guardarse, pero publicar o cancelar después de iniciar se rechaza atómicamente. El snapshot de ejecución no incluye notas ni personas; anon no puede leerlo.

### Pruebas locales
- `npm run check`: lint, typecheck, **183 pruebas / 12 suites** y build correctos.
- SQL/PGlite: 85 pruebas, incluidas 5 nuevas de transición, scopes, reloj, reintento, conflicto, cierre anticipado, espera, publicación congelada y RLS de estado/auditoría.
- Chrome autenticado desktop/mobile + Supabase local: **16/16**. Nuevos flujos usan dos contextos de navegador con Realtime activo y esperan propagación antes del intervalo de polling, desconectan uno, avanzan desde el otro, reconectan y verifican estado/cierre sin duplicación. Axe y overflow de consola; el comentario privado del plan no aparece en pantalla.
- Cobertura de 12 módulos críticos configurados: 98,52% líneas, 92,22% ramas; cálculo live 100% líneas y 96,15% ramas. No cubre por sí sola UI remota ni infraestructura.
- SQL lint: sin errores nuevos; conserva warnings anteriores del writer y duplicador.

### Pendiente antes del cierre
Repetir base PWA/drag, revisar screenshots, verificar CI/Preview y aplicar la migración 24 al Supabase independiente después del dry-run. No declarar todavía Sprint 4 cerrado ni Sprint 5 implementado. Dispositivos físicos y QA Auth remota integral siguen pendientes para producción.

## Operación
El inicio comienza la primera actividad; `Finalizar y avanzar` registra fin/inicio en un mismo instante del servidor. `Finalizar actividad sin avanzar` permite una espera real. La última actividad no cierra sola la reunión. Cerrar requiere checkbox y confirma un instante efectivo inmutable; futuras solicitudes de feedback partirán de él (+10 min), no de la hora planificada.

La operación requiere grant global `operate_live`; consulta mediante agenda, planificación u operación global. Un grant de equipo no opera el cronograma completo. La columna mínima publicada por Realtime tiene RLS y no actores/comentarios; auditoría y ejecuciones están en esquema privado. Los clientes vuelven a consultar con su sesión, reconcilian al enfocar/reconectar y cada 10 s como respaldo. Sin conexión no se encolan transiciones; no se usa service role.

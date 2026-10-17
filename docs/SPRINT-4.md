# Sprint 4 — Publicación y modo en vivo

## Cerrado funcionalmente (16/10/2026)

Implementadas consola `/en-vivo/[id]`, transiciones autorizadas/versionadas/idempotentes, revisión publicada congelada, tiempos reales, cronómetro, adelanto/demora, ETA y recuperación por Realtime/polling. El cierre es explícito; no se da por ejecutado lo pendiente. El borrador puede guardarse, pero publicar o cancelar después de iniciar se rechaza atómicamente. El snapshot de ejecución no incluye notas ni personas; anon no puede leerlo.

### Pruebas locales
- `npm run check`: lint, typecheck, **185 pruebas / 12 suites** (incluye captura inicial de Sprint 5 y regresión de metadatos Realtime) y build correctos.
- SQL/PGlite: 87 pruebas, incluidas 5 nuevas de transición, scopes, reloj, reintento, conflicto, cierre anticipado, espera, publicación congelada y RLS de estado/auditoría.
- Chrome autenticado desktop/mobile + Supabase local: **16/16**. Nuevos flujos usan dos contextos de navegador con Realtime activo y verifican un frame WebSocket de cambio de negocio de esa reunión (no deducen Realtime por velocidad de polling), desconectan uno, avanzan desde el otro, reconectan y verifican estado/cierre sin duplicación. Axe y overflow de consola; el comentario privado del plan no aparece en pantalla.
- Cobertura de 12 módulos críticos configurados: 98,52% líneas, 92,22% ramas; cálculo live 100% líneas y 96,15% ramas. No cubre por sí sola UI remota ni infraestructura.
- SQL lint: sin errores nuevos; conserva warnings anteriores del writer y duplicador.

### Checkpoint previo al cierre (histórico)
La base PWA/drag pasó 30/30 y se revisaron screenshots desktop/mobile. La migración 24 ya se aplicó al remoto independiente tras dry-run limitado al archivo nuevo, sin seeds. Se verificaron grants: las dos RPCs nuevas no son ejecutables por anon; advisor sin ERROR (avisos intencionales de DEFINER/tablas privadas y Leaked Password Protection pendiente). Resta verificar CI/Preview. No declarar todavía Sprint 4 cerrado ni Sprint 5 implementado. Dispositivos físicos y QA Auth remota integral siguen pendientes para producción.

## Operación
El inicio comienza la primera actividad; `Finalizar y avanzar` registra fin/inicio en un mismo instante del servidor. `Finalizar actividad sin avanzar` permite una espera real. La última actividad no cierra sola la reunión. Cerrar requiere checkbox y confirma un instante efectivo inmutable; futuras solicitudes de feedback partirán de él (+10 min), no de la hora planificada.

La operación requiere grant global `operate_live`; consulta mediante agenda, planificación u operación global. Un grant de equipo no opera el cronograma completo. La columna mínima publicada por Realtime tiene RLS y no actores/comentarios; auditoría y ejecuciones están en esquema privado. Los clientes vuelven a consultar con su sesión, reconcilian al enfocar/reconectar y cada 10 s como respaldo. Sin conexión no se encolan transiciones; no se usa service role.

## Hallazgo inicial de CI (corregido y verificado)

El primer CI `38951934474` pasó foundation pero falló la E2E móvil esperando el cambio en el segundo contexto en 7 s (desktop sí pasó). La traza mostró una consola aún en versión 0 con canal suscrito, sin error de permisos. Se reemplaza esa inferencia temporal por una aserción explícita de recepción del frame `postgres_changes` de la reunión; no se deshabilita Realtime ni se agrega retry automático. Falta repetir CI con esa instrumentación antes de cerrar el sprint.

## Causa verificada y corrección

El frame `system` expuso `invalid column for filter meeting_id`. Se verificó en PostgreSQL que `supabase_realtime_admin` no veía esa columna en `information_schema`, aunque authenticated sí tenía SELECT. El canal podía emitir SUBSCRIBED sin que PostgreSQL Changes estuviera listo. La migración `20261016191636_sprint4_realtime_metadata_access.sql` concede a ese rol interno **solo SELECT(meeting_id)**, sin política RLS de filas, sin permisos anon ni acceso a otras columnas. Nueva prueba SQL comprueba columna visible, cero filas y rechazo de otras columnas. No se reinició el proyecto ni se deshabilitó RLS.

La consola establece explícitamente el JWT de sesión, pide confirmación de suscripción y escucha `system`: solo informa Realtime activo ante confirmación real de PostgreSQL Changes. Un rechazo conserva polling y muestra advertencia, no éxito falso. La E2E ahora inspecciona frames de negocio de la reunión y adjunta únicamente metadata de diagnóstico (nunca tokens). La pasada posterior volvió a 16/16 local; se repite nuevamente con todo el esquema aplicado antes de CI.

## Estado al checkpoint previo (histórico)

Corrección y captura privada aplicadas local/remoto: **26 migraciones**, sin seeds ni fixtures remotos. `npm run check` verde con 185 pruebas; suite autenticada completa repetida sobre el esquema actualizado **16/16**, incluidos frames reales de PostgreSQL Changes. Base Chrome/PWA/drag **30/30**. Código correctivo `b11a56b` pusheado; CI nuevo pendiente. El fallo del CI anterior no se marca como resuelto hasta verificar el nuevo run. Sprint 4 sigue en verificación, no cerrado; Sprint 5 solo tiene captura de destinatarios.


## Cierre funcional verificado — 16/10/2026

Las ejecuciones GitHub Actions **38954074578** (corrección `b11a56b`) y **38954173338** (`1335176`) terminaron **success**, tanto `foundation` como `authenticated-local`. Se verificó la recepción real de PostgreSQL Changes en Chrome desktop/mobile; el CI fallido anterior queda registrado como antecedente, no como resultado actual.

Preview **Ready**, deployment `dpl_4scF26NMvw2jfHFAvgPocc28q3z2`: https://crono-unidos-bfleb774s-damianjure-5692s-projects.vercel.app . Alias de rama asociado. Una petición sin sesión a `/en-vivo/00000000-0000-4000-8000-000000000001` devolvió **307 a `/ingresar`** usando el bypass de protección autorizado de Vercel CLI, sin exponer credenciales. Esta comprobación no sustituye QA autenticada remota.

Con esto se cierra **funcionalmente Sprint 4**, no el MVP ni Production. Se conservan como gates de Sprint 5: QA integral con roles/Auth remotos, aceptación de invitación pendiente, dispositivos físicos/PWA, dominio/remitente exclusivos y despliegue de producción. El núcleo de feedback iniciado después tiene su propia evidencia y pendientes en `SPRINT-5.md`.

## Regresión de desconexión: respuesta tardía — 16/10/2026

El CI `38969223682` falló en móvil: después de `offline`, el botón de avance volvió a estar habilitado. Las ejecuciones posteriores `38993116371` y `38993129802` pasaron ambos jobs, pero eso no descartaba la carrera. Se agregó una prueba determinista que retiene una respuesta real de `readLive`, desconecta el contexto y recién entonces entrega la respuesta. Antes del arreglo, falló en **desktop y mobile** por el mismo botón habilitado (16/18 pruebas restantes correctas).

Causa: `refresh()` escribía `setOnline(true)` al recibir cualquier lectura exitosa, aunque el navegador ya hubiera emitido `offline`. Ahora consulta `navigator.onLine` al resolver; conserva la última lectura sin reactivar controles offline. Se mantiene además el guard de conectividad al operar, las RPCs/versiones/idempotencia y la recuperación por Realtime. No se agregaron retries de test ni se relajó la aserción. El control de red existe solamente en la prueba, no en código de producción.

Verificación posterior local: `npm run check` **212/212 pruebas, 15 suites**, lint, typecheck y build correctos; `npm run test:e2e:auth:local` **18/18 Chrome desktop/mobile**, con la respuesta tardía controlada en ambos proyectos y avance/reconexión/cierre posteriores. Logs locales `/tmp/crono-offline-check.log` y `/tmp/crono-offline-regression-after.log`; la pasada roja se conserva en `/tmp/crono-offline-regression-before.log`. No hay migraciones nuevas ni cambios de configuración remota. Falta verificar CI/Preview de este arreglo; no implica QA física ni habilitación de correo/Production.

# Sprint 5 — Feedback y salida a producción

## En curso: captura inicial; resto pendiente

El cierre efectivo y la revisión congelada provienen de Sprint 4. No se considera suficiente mostrar un formulario ni ejecutar un job manual: hay que probar scheduler, permisos, idempotencia, entrega in-app y, cuando esté configurado, email.

## Contrato y verificación requerida

1. Capturar participantes de la revisión operada y responsables autorizados de sus equipos; deduplicar persona/usuario. No incluir responsables de borradores ni duplicar destinatarios por varios roles. Conservar participantes que fueron reemplazados durante la ejecución.
2. Crear solicitudes recién a `closed_at + 10 minutos`, no al finalizar la última actividad ni a la hora planificada. Scheduler de servidor con reintentos idempotentes; no delegar el disparo al navegador de un usuario.
3. Avisos internos personales sin comentarios privados. Personas sin cuenta conservan solicitud y se vinculan de forma segura; no enviar a destinatarios deducidos de datos editables por el usuario.
4. Una respuesta propia por solicitud: Todo bien / Hubo problema / Algo pendiente / Sugerencia, comentario opcional breve. Confirmar estado de envío sin conceder SELECT de comentarios ni respuesta ajena al autor.
5. Panel y estadísticas identificadas exclusivamente de administradores, con RLS además de guards de ruta. Probar usuario pendiente, suspendido, integrante, responsable, planificador, otra organización y anon.
6. Email fuera del payload de notificaciones públicas, con proveedor/identidad remitente exclusivos configurados en servidor, outbox/idempotencia y reintentos auditados. SMTP de Supabase Auth no implica por sí solo que la app pueda enviar feedback por Brevo. Sin configuración de proveedor de aplicación, in-app sigue siendo obligatorio; no declarar email enviado ni mostrar éxito ficticio.
7. E2E mobile/desktop: cerrar, antes/después de +10 min, notificación, responder, idempotencia y panel admin; inspeccionar tráfico/grants para probar que no se filtran comentarios.
8. Antes de Production: resolver dominio/remitente/redirects/variables, QA remota integral de Auth/RLS/invitación y pruebas PWA en dispositivos físicos. El usuario ya recibió una consulta sobre el dominio/remitente; continuar trabajo local sin bloquearlo por esa respuesta. No cambiar facturación ni lanzar públicamente una entrega incompleta.

Pruebas y evidencias deben agregarse cuando realmente se ejecuten; este contrato no declara implementado el Sprint 5.

## Primer componente implementado (solo probado con SQL/PGlite)

La migración `20261016190641_sprint5_feedback_participants.sql` captura el plan publicado, roles responsables y operadores; conserva reemplazados durante ejecución y deduplica persona/usuario. Nueva regresión con persona que es a la vez responsable de equipo y varios roles, una persona exclusiva del borrador y un reemplazo en vivo: SQL verde (86 pruebas totales). Ya se aplicó localmente y al remoto independiente, sin fixtures y tras verificar que no había ejecuciones remotas previas. No hay scheduler ni solicitudes/notificaciones/formulario/email, y no se declara Sprint 5 cerrado. La limpieza E2E incluye el fixture privado; la suite autenticada completa se repitió en verde (16/16).

## Segundo componente: núcleo de solicitudes y despacho (local)

Migraciones `20261016192255_sprint5_feedback_requests.sql` y `20261016192417_sprint5_feedback_scheduler.sql`: solicitudes privadas por participante, avisos personales con RLS, respuesta propia inmutable/idempotente, DTO propio sin categoría/comentario y consulta administrativa identificada. Despacho privado sin reloj proporcionado por el cliente; espera el cierre efectivo +10 min. Job `crono-unidos-feedback-dispatch` cada minuto mediante pg_cron (latencia normal adicional hasta un minuto).

Ambas migraciones aplicadas **solo localmente** en esta etapa. SQL/PGlite prueba antes/después del vencimiento, dos despachos, deduplicación de avisos, respuestas repetidas, denegación de comentarios por roles no administrativos, suspensión y vinculación posterior de persona sin cuenta sin transferencia de destinatario. La prueba de tiempo usa exclusivamente un cambio de fixture en la base embebida; no existe endpoint para adelantar el reloj. El job local está registrado y activo; `cron.job_run_details` confirmó una invocación `succeeded` (`1 row`). Esto no prueba todavía la entrega E2E a un destinatario. SQL/PGlite: **89/89**; `npm run check`: **187 pruebas/12 suites**, lint, typecheck y build verdes. Aún faltan interfaz/formulario/panel, E2E integral del scheduler con destinatario, email/outbox, aplicación/verificación remota y gates de Production. No se considera Sprint 5 cerrado.

# Sprint 5 — Feedback y salida a producción

## En curso: feedback y worker de correo implementados; activación y Production pendientes

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

## Primer componente: captura de participantes (checkpoint histórico)

La migración `20261016190641_sprint5_feedback_participants.sql` captura el plan publicado, roles responsables y operadores; conserva reemplazados durante ejecución y deduplica persona/usuario. Nueva regresión con persona que es a la vez responsable de equipo y varios roles, una persona exclusiva del borrador y un reemplazo en vivo: SQL verde (86 pruebas totales). Ya se aplicó localmente y al remoto independiente, sin fixtures y tras verificar que no había ejecuciones remotas previas. En ese checkpoint todavía no había scheduler ni solicitudes/notificaciones/formulario/email; ver los avances posteriores debajo. Sprint 5 no estaba cerrado. La limpieza E2E incluye el fixture privado; la suite autenticada completa se repitió en verde (16/16).

## Segundo componente: núcleo de solicitudes y despacho

Migraciones `20261016192255_sprint5_feedback_requests.sql` y `20261016192417_sprint5_feedback_scheduler.sql`: solicitudes privadas por participante, avisos personales con RLS, respuesta propia inmutable/idempotente, DTO propio sin categoría/comentario y consulta administrativa identificada. Despacho privado sin reloj proporcionado por el cliente; espera el cierre efectivo +10 min. Job `crono-unidos-feedback-dispatch` cada minuto mediante pg_cron (latencia normal adicional hasta un minuto).

Ambas migraciones se probaron primero localmente y después se aplicaron al remoto independiente, sin fixtures ni seeds remotos. SQL/PGlite prueba antes/después del vencimiento, dos despachos, deduplicación de avisos, respuestas repetidas, denegación de comentarios por roles no administrativos, suspensión y vinculación posterior de persona sin cuenta sin transferencia de destinatario. La prueba de tiempo usa exclusivamente un cambio de fixture en la base embebida; no existe endpoint para adelantar el reloj. El job local está registrado y activo; `cron.job_run_details` confirmó una invocación `succeeded` (`1 row`). Esto no prueba todavía la entrega E2E a un destinatario. SQL/PGlite: **89/89**; `npm run check`: **187 pruebas/12 suites**, lint, typecheck y build verdes. En este checkpoint todavía faltaban interfaz/E2E, completadas en el avance siguiente. Email/outbox y gates de Production siguen pendientes. No se considera Sprint 5 cerrado.


## Tercer componente: interfaz y flujo real verificados — 16/10/2026

- `/feedback`: solicitudes propias, formulario breve, estado enviado sin volver a consultar comentario/categoría. Validación de UUID/categoría y longitud, revalidación de sesión en Server Action y RPC. Sin service role en operaciones de negocio.
- `/inicio`: aviso personal de solicitudes pendientes, sin texto privado. Accesos desde Inicio, navegación desktop y Más en mobile.
- `/feedback/admin`: guard administrativo antes de consultar datos; solicitudes/respuestas identificadas, categorías y totales. Se resuelven perfiles por IDs autorizados, incluyendo cuentas sin `profiles.org_id` todavía. Un integrante recibe 404 de la ruta y Forbidden del RPC.
- Nueva migración `20261016193352_sprint5_feedback_lookup_indexes.sql`: índice de destinatario y cobertura completa de reunión, también para personas sin cuenta. El advisor remoto detectó una FK sin índice de usuario; tras aplicar, **no quedan hallazgos de FK sin índice en las tablas nuevas de feedback/notificaciones**. No se corrigieron los hallazgos anteriores de otros módulos como si fueran parte de este cambio.

### Evidencia actual

- **29 migraciones** local/remoto independiente `ivmhgizuofxdvvvzdxnl`, dry-runs limitados a los archivos nuevos, sin semillas remotas. Job remoto activo cada minuto e historial `succeeded` comprobado; usuarios autenticados no pueden ejecutar el dispatcher, anon no puede enviar feedback.
- `npm run check`: lint, typecheck, **191 pruebas / 13 suites** y build verdes. SQL/PGlite **89/89**. Regresión Unicode: el panel admite los 500 puntos de código permitidos por `char_length` de PostgreSQL, sin romperse por caracteres de dos unidades UTF-16.
- Chrome real contra Supabase local: **18/18** desktop/mobile, repetidas dos pasadas completas. La última agrega JWT real de integrante contra RPC administrativo, DTO propio sin comentario/categoría, reintento idéntico exitoso y cambio de respuesta rechazado.
- Nueva E2E cierra por UI, verifica ausencia inmediata de solicitud, adelanta exclusivamente el fixture SQL local, **espera al job real de pg_cron sin invocar el dispatcher desde el test/navegador**, verifica aviso, responde y consulta el panel admin. Exige un run exitoso nuevo del job. No se esperaron diez minutos de reloj de pared; la frontera temporal sí se prueba en SQL antes/después de +10 min.
- Respuesta HTTP personal sin comentario enviado; ruta administrativa denegada a integrante, REST/RPC administrativo Forbidden con JWT real. Avisos personales sin comentario y sin filas ajenas. Axe sin violaciones en formulario/panel; overflow verificado y screenshots desktop/mobile revisados. No es QA en dispositivos físicos.
- Base PWA/drag/privacidad **30/30** otra vez. Cobertura de 13 módulos críticos configurados: **98,57% líneas / 92,22% ramas** en la pasada previa a la regresión Unicode final; no representa cobertura integral de todas las rutas/UI. SQL lint `public,private --level error --fail-on error`: sin errores.
- Advisor de seguridad remoto sin ERROR; conserva avisos intencionales de tablas privadas sin políticas y RPCs DEFINER restringidos. Leaked Password Protection sigue pendiente según plan/configuración, sin cambiar facturación. Ver [referencia del aviso](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- CI del núcleo (`38955049091`) **success**. Commit UI `4150ea1` pusheado; su CI/Preview siguen pendientes de verificar en este checkpoint. No declarar aún entrega remota autenticada de feedback validada.

### Trabajo pendiente

1. Completar flujo autenticado remoto, sin copiar fixtures locales a producción. El CI del worker `38968856850` y las ejecuciones posteriores `38993116371` / `38993129802` terminaron success. La carrera de desconexión detectada en el run intermedio `38969223682` se documenta y corrige en `SPRINT-4.md`; su nueva regresión requiere su propio CI.
2. Activar y probar realmente el outbox/transporte Brevo ya implementado: API key segura, remitente verificado, secreto de worker/Vault y protección de Preview. Auth SMTP no equivale a este transporte. No se enviaron correos de feedback ni se declara ese canal operativo.
3. Preparar/verificar subdominio y remitente elegidos, redirects y variables de Production, QA remota de roles/Auth/invitación y pruebas PWA físicas. No lanzar Production antes de estos gates.


## Cuarto componente: worker de correo preparado — 16/10/2026

- Commits `2e05a3f` (outbox/scheduler) y `2482a23` (worker Brevo). **33 migraciones local/remoto**, sin fixtures ni seeds remotos. `pg_net` no estaba instalado en el remoto: migración 32 lo habilitó en `extensions`, sin cambiar exposición de esquemas.
- Outbox privado, destinatario Auth confirmado/aprobado, payload congelado, leases, intentos auditados y reintentos con la misma clave/payload. Expiración conservadora de diez minutos y revisión manual, no reenvío infinito. Migración 33 retiene payloads de otro remitente/origen; no permite arrastrar el remitente temporal de Preview a Production.
- `POST /api/internal/feedback-email` protegido por secreto independiente; no lo ejecutan cookies de administrador. Brevo recibe contenido genérico y login requerido, nunca feedback ni título de reunión. Respuestas del endpoint: solo contadores o errores sanitizados. Canal deshabilitado por defecto; no se agregó cron de Vercel ni se cambió facturación.
- CI previo de la UI (`38956144905` y `38956229545`) **success**. Nueva Preview del worker **Ready**, `https://crono-unidos-bkysc93pi-damianjure-5692s-projects.vercel.app`: POST sin secreto devolvió **401 / unauthorized**, incluso usando bypass autorizado de Deployment Protection; `/feedback` sin sesión devolvió **307 a ingreso**. CI nuevo `38968856850` sigue en curso en este checkpoint.

### Pruebas de esta entrega

- `npm run check`: lint/typecheck/**212 pruebas / 15 suites**/build verdes. SQL/PGlite **91/91**; nuevas regresiones cubren reclamos simultáneos, acks antiguos, ventana expirada, destinatario congelado, suspensión/no confirmación, solicitud respondida y configuración de otro entorno.
- Transportes HTTP y Vault/net simulados en pruebas unitarias/SQL: respuestas 201, duplicado, 400, 401, 429, 5xx, timeout, JSON inválido, ID inválido y fallo de persistencia de ack; ningún fallo se cuenta como éxito. Estas pruebas **no son envíos reales a Brevo**.
- Chrome autenticado **18/18**, con POST del worker rechazado incluso desde sesión admin y `Accept-Profile: net` rechazado con JWT de integrante. Base PWA/drag/privacidad **30/30** repetida.
- Cobertura de 15 módulos críticos configurados: **98,86% líneas / 93,60% ramas**; módulo de transporte 100% líneas, 98,41% ramas. No es cobertura de toda la UI ni verificación de entrega física. Runtime audit **0 vulnerabilidades**. SQL lint `public,private` sin errores.
- Comprobaciones remotas: anon/authenticated no leen Vault; authenticated no reclama mail, `service_role` sí; anon no hace ack. Job email activo cada minuto, pero sin secretos retorna NULL y **no hace HTTP**. PostgREST rechazó `net` con 406/PGRST106 antes/después de habilitar la extensión. GraphQL remoto no está habilitado; en local la introspección no incluyó tipos de red. Advisor de seguridad sin ERROR, con avisos intencionales ya documentados y Leaked Password Protection aún pendiente.

Las credenciales avanzaron después de este checkpoint: API key real cargada por el propietario en Vercel y secreto del worker gestionado con Infisical/copiado a Vercel y Vault. Falta verificar remitente, conectar el callback protegido y probar recepción real. Configuración/seguridad/diagnóstico en **`EMAIL.md`**. Se consultó al propietario cómo abrir las claves API de Brevo, expresamente sin pegarlas en el chat. Sprint 5 permanece abierto por estos gates y Production.


## Avance de configuración Preview — 16/10/2026

Remitente exclusivo de feedback creado/verificado en Brevo: `crono@damianjure.com`, nombre Crono Unidos, dominio autenticado y DMARC configurado. Agregadas variables Preview de esa identidad y `FEEDBACK_EMAIL_ENABLED=false` explícito, sin habilitar envíos. Falta confirmar bandeja/alias de respuestas; SMTP de Auth no cambió. Vault aún sin callback/bypass; se pidió al propietario completar la credencial dedicada de automatización, sin revelarla por chat. Outbox remoto vacío, jobs activos. Ver `EMAIL.md` para alcance exacto y pasos seguros.

Chrome remoto con sesión administrativa: `/feedback` y `/feedback/admin` abrieron estados vacíos esperados, sin escrituras ni fixtures. No prueba entrega de feedback ni aislamiento con otras sesiones remotas. Production continúa pendiente.

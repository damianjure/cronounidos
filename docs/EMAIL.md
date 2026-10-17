# Correo de feedback — implementación y activación pendiente

## Estado al 16/10/2026

Código preparado y migraciones 30–33 aplicadas en local y en el proyecto independiente `ivmhgizuofxdvvvzdxnl` (33 en total). **Correo todavía desactivado**: `BREVO_API_KEY` ya está en Vercel Preview y el secreto de worker se generó en Infisical con copias iniciales en Vercel/Vault. El remitente exclusivo `crono@damianjure.com` ya está verificado en Brevo y configurado en Vercel Preview, con `FEEDBACK_EMAIL_ENABLED=false` explícito. Faltan callback/protección y prueba real; no se enviaron correos de feedback. Ver la actualización de Infisical al final antes de crear o rotar claves. La notificación in-app funciona sin este canal. Supabase Auth usa su configuración SMTP separada.

## Diseño

1. Cada aviso personal crea una fila única en `private.feedback_email_outbox`. Los avisos ya existentes y aún sin respuesta se incluyen una vez. No hay comentario, categoría ni título de reunión en la cola ni en el correo.
2. `claim_feedback_emails` y `finish_feedback_email` solo admiten el rol de máquina `service_role`; administradores de la app, integrantes y anon no pueden invocarlos. El worker usa la clave segura existente de servidor, nunca una sesión del navegador.
3. El destinatario proviene de `auth.users.email` confirmado, con perfil y membresía aprobados; no de metadata editable ni parámetros del cliente. Un usuario suspendido o sin email confirmado no se reclama. Una solicitud ya respondida deja de generar envíos.
4. El primer reclamo congela destinatario, remitente y origen. Lease de dos minutos, hasta cinco trabajos por lote y cinco intentos por trabajo; otra ejecución no reclama un lease vigente. Un ack antiguo no modifica un lease más nuevo. Los intentos se conservan en `private.feedback_email_attempts`.
5. POST al endpoint fijo de Brevo con timeout de ocho segundos, redirects prohibidos y `headers.idempotencyKey` igual al UUID de la solicitud. Texto genérico con `/feedback`, que exige login. No se mandan feedback, personas ni claves en ese texto.
6. Timeout/respuesta incierta, 429 y 5xx conservan el mismo payload y clave, con backoff. Tras diez minutos desde el primer intento o agotamiento de intentos, estado `review`, sin reenvío automático. Un 201 válido registra aceptación por Brevo; un `duplicate_parameter` registra procesamiento previo sin asumir recepción en la bandeja. `accepted` **no significa delivered**. Errores permanentes quedan `failed`; no se ocultan como éxito.
7. Cambiar remitente/origen o pasar de Preview a Production NO autoriza enviar el payload anterior: se conserva sin modificar y se retiene en `review / configuration_changed`. Production rechaza además el remitente temporal `hola@damianjure.com`. Revisar explícitamente estos casos antes de un cambio de entorno; nunca resetear masivamente trabajos aceptados.
8. `crono-unidos-feedback-email` ejecuta cada minuto una función privada. Solo si hay destinatarios elegibles y configuración válida en Vault llama al worker Next.js. La creación de solicitudes espera al cierre +10 min y al siguiente sondeo; el correo puede requerir otro ciclo y tiempo adicional por cola/límites del proveedor. No se promete entrega exactamente al segundo diez minutos. No requiere Vercel Cron de frecuencia por minuto ni un navegador abierto. Sin configuración retorna NULL y no hace HTTP.

El TTL documentado por Brevo es limitado; la ventana automática conservadora de diez minutos evita tratar una clave como protección eterna después de una caída prolongada. Referencias: [idempotencia de Brevo](https://developers.brevo.com/docs/heterogenous-versions-batch-emails), [API de envío](https://developers.brevo.com/reference/send-transac-email), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [Cron + Vault](https://supabase.com/docs/guides/functions/schedule-functions).

## Activación segura, paso a paso — todavía NO ejecutada

### 1. Preparar Brevo

Crear una **clave API** dedicada a Crono Unidos (no la contraseña SMTP), con el menor alcance disponible. No enviarla por chat ni Git. Crear/verificar el remitente exclusivo; candidato aún pendiente de validar: `crono@damianjure.com`, con dominio/DKIM y bandeja o alias de verificación si Brevo lo requiere. El remitente temporal continúa autorizado solamente para Preview.

### 2. Configurar Vercel Preview

Limitar primero estas variables al proyecto `crono-unidos`, entorno Preview y rama `codex/sprint-2-editor`:

| Variable | Valor/función |
| --- | --- |
| `BREVO_API_KEY` | Secret, ingresado directamente en Vercel. |
| `FEEDBACK_WORKER_SECRET` | Otro Secret independiente, aleatorio, 32–256 caracteres ASCII; recomendado 64 hex. Nunca reutilizar la API key ni una clave de Supabase. |
| `FEEDBACK_FROM_EMAIL` | Remitente verificado de Brevo, explícitamente seleccionado. |
| `FEEDBACK_EMAIL_ENABLED` | Mantener `false` hasta revisar cola, remitente, límites del proveedor y plan de prueba controlado. |
| `APP_URL` | Origen canónico de ese entorno, sin path/query/credenciales; HTTPS salvo desarrollo local. |
| `SUPABASE_SECRET_KEY` | Clave segura de servidor ya usada en Preview; ahora también requerida por el worker. No cambiarla por una clave pública. |

Redeploy para aplicar cambios. La ruta es `POST /api/internal/feedback-email`. Solo acepta `Authorization: Bearer <FEEDBACK_WORKER_SECRET>`, no cookies de administrador ni tokens en URL. Sin autenticación da 401; sin proveedor habilitado/configurado da 503. No devuelve emails ni secretos. Un resultado 200 contiene contadores, no prueba de recepción de correo. `deferred` puede incluir revisión manual, no promete reintento infinito.

### 3. Configurar Supabase Vault

Solo en `ivmhgizuofxdvvvzdxnl`, ingresando los valores directamente en Vault, sin publicarlos ni mostrarlos en logs:

| Nombre | Valor |
| --- | --- |
| `crono_unidos_feedback_worker_url` | URL estable de la aplicación + `/api/internal/feedback-email`, HTTPS, sin query. |
| `crono_unidos_feedback_worker_secret` | El mismo secreto independiente del worker configurado en Vercel. |
| `crono_unidos_feedback_vercel_bypass` | Solo si la Preview tiene Deployment Protection: token dedicado de automatización de Vercel, enviado por header, nunca en URL. Omitir cuando no haga falta. |

Mantener `net`, `vault` y `private` fuera de los esquemas expuestos por las APIs. Vault cifra almacenamiento, pero pg_net necesita materializar headers temporalmente; **roles con conexión SQL y grants sobre su cola pueden leer esos headers**. No distribuir credenciales SQL ni exponer `net` para diagnosticar. La comprobación remota después de habilitar pg_net devolvió 406/PGRST106 para `Accept-Profile: net`; anon/authenticated no leen Vault. GraphQL remoto no está habilitado; en local la introspección no expuso tipos de red. Si se habilita GraphQL o cambia la exposición de esquemas, repetir estas pruebas. [Permisos de pg_net](https://supabase.com/docs/guides/database/extensions/pg_net#permissions).

### 4. Prueba real antes de Production

Revisar cuántos trabajos pendientes se habilitarían, confirmar remitente/cuota y un destinatario controlado. Habilitar explícitamente el canal, esperar el job real y comprobar aceptación, recepción y ausencia de duplicados. No adelantar el reloj de reuniones remotas ni sembrar personas ficticias en Production. Todavía falta esta prueba, además del recorrido remoto integral de Auth/RLS y los dispositivos físicos/PWA.

## Diagnóstico sin revelar secretos

Desde SQL Editor del proyecto correcto, solo como propietario confiable:

```sql
select status, count(*) from private.feedback_email_outbox group by status;
select request_id, attempts, last_error, accepted_at
from private.feedback_email_outbox where status in ('review','failed');
select jobname, active, schedule from cron.job
where jobname in ('crono-unidos-feedback-dispatch','crono-unidos-feedback-email');
select d.network_request_id, r.status_code, r.timed_out
from private.feedback_email_dispatches d
left join net._http_response r on r.id=d.network_request_id
order by d.created_at desc limit 10;
```

No seleccionar `vault.decrypted_secrets`, headers ni cuerpos de colas HTTP para pegarlos en el chat. El historial de dispatch conserva solo IDs/fechas por siete días; los intentos de correo conservan su auditoría. La respuesta de pg_net es temporal: consultar metadata a tiempo. Un cron `succeeded` con `1 row` no prueba que el canal esté configurado: sin secretos el resultado puede ser NULL.

Estados `review`/`failed` requieren diagnóstico y decisión explícita del operador, no un reset indiscriminado. No hay todavía panel de reenvío manual ni webhook de entrega/bounce; no confundir aceptación de Brevo con entrega física.

## Actualización: Infisical como gestor del secreto de worker — 16/10/2026

Por pedido explícito del propietario se generó `FEEDBACK_WORKER_SECRET` con `crypto.randomBytes(32)` (64 caracteres hex, sin reutilizar claves existentes). Fuente: **Infisical → Desarrollo IA → Development (`dev`) → `/crono-unidos/preview`**, versión inicial 1. No se modificó ni eliminó `CODEX_TEST`.

La misma credencial se aprovisionó inicialmente en **Vercel `crono-unidos`, Preview, rama `codex/sprint-2-editor`, Sensitive/Secret**, por stdin sin pasar el valor en argumentos de CLI, y en el **Vault de `ivmhgizuofxdvvvzdxnl`** como `crono_unidos_feedback_worker_secret`. Se verificaron existencia, scope y metadata sin recuperar claves guardadas. El archivo temporal de transferencia tuvo permisos 0600/directorio 0700 y fue eliminado tras confirmar las escrituras. Ningún valor se guardó en Git/documentación ni se mostró en la respuesta.

**Esto es aprovisionamiento inicial, no una integración de sincronización automática de Infisical.** El MCP actual devuelve valores enmascarados al leerlos; no afirmar que puede recuperar/repropagar una clave almacenada. Una futura rotación deberá coordinar Infisical, Vercel/redeploy y Vault, pausando el job si ya está activo, o configurar una integración nativa autorizada. No cambiar solo una copia.

`BREVO_API_KEY` fue creada previamente por el propietario y está presente en Vercel Preview con el nombre exacto. Se dejó intacta; no se leyó ni se copió a Infisical. Centralizar también esa API key requiere ingreso directo del propietario en Infisical o una integración autorizada; nunca inventar un valor aleatorio como reemplazo de una credencial emitida por Brevo.

La URL `crono_unidos_feedback_worker_url` sigue ausente; `private.kick_feedback_email_worker()` retorna NULL sin HTTP. No se activó `FEEDBACK_EMAIL_ENABLED`, no se eligió un remitente no verificado y no se enviaron correos. Restan remitente, callback/protección de Preview, activación controlada y prueba de recepción real. Las variables nuevas entran en vigor en el siguiente despliegue de Preview; no se modificó Production.


## Remitente exclusivo verificado y canal explícitamente desactivado — 16/10/2026

Se creó en Brevo **Crono Unidos <crono@damianjure.com>**, usando el dominio ya autenticado. La lista de remitentes confirmó **Verificado**, firma DKIM `damianjure.com` y DMARC configurado. El remitente anterior se dejó intacto. Esto verifica identidad de envío en Brevo, **no demuestra que exista una bandeja o alias que reciba respuestas en `crono@damianjure.com`**; confirmar ese destino antes del lanzamiento. No se modificaron DNS ni SMTP de Supabase Auth: este último todavía usa la identidad temporal de Preview.

En Vercel se agregaron `FEEDBACK_FROM_EMAIL=crono@damianjure.com` y `FEEDBACK_EMAIL_ENABLED=false`, solo Preview / rama `codex/sprint-2-editor`; existencia/scope comprobados por CLI, sin leer credenciales. Requieren un despliegue posterior para entrar en vigor. Production permanece intacta.

La consulta remota mostró outbox vacío, ambos jobs registrados/activos y ausencia de callback/bypass en Vault. La Preview mantiene Vercel Authentication. Se abrió el formulario **Add Bypass** y se pidió al propietario crear una credencial dedicada con nota `crono-unidos-feedback-preview`, guardándola directamente en Vault como `crono_unidos_feedback_vercel_bypass`, sin compartirla por chat ni revelar/modificar el bypass existente. No se creó esa credencial ni se amplió acceso automáticamente. El callback seguirá sin configurarse hasta verificar la protección; no activar el canal por el solo hecho de tener remitente.

Verificación remota de interfaz con sesión administrativa existente: `/feedback` mostró el estado vacío de solicitudes y `/feedback/admin` abrió el panel sin reuniones cerradas. Fue lectura, sin fixtures ni respuestas inventadas; no sustituye el recorrido con solicitudes reales ni la QA de roles distintos.

# Correo de feedback — implementación y activación pendiente

## Estado al 16/10/2026

Código preparado y migraciones 30–33 aplicadas en local y en el proyecto independiente `ivmhgizuofxdvvvzdxnl` (33 en total). **Prueba real ejecutada: in-app correcto, Brevo rechazó la IP; canal nuevamente desactivado**: `BREVO_API_KEY` ya está en Vercel Preview y el secreto de worker se generó en Infisical con copias iniciales en Vercel/Vault. El remitente exclusivo `crono@damianjure.com` ya está verificado en Brevo y configurado en Vercel Preview, con `FEEDBACK_EMAIL_ENABLED=false` tras un único intento rechazado. Callback y acceso protegido verificados después de corregir el bypass de Vault: la segunda prueba llegó al worker y obtuvo el 503 esperado con canal desactivado. El scheduler creó una solicitud y un aviso luego de +10 min; el envío fue rechazado y no hubo aceptación ni recepción confirmadas. Ver la actualización de Infisical al final antes de crear o rotar claves. La notificación in-app funciona sin este canal. Supabase Auth usa su configuración SMTP separada.

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

## Conexión Vault y diagnóstico del bypass — 16/10/2026

El propietario guardó `crono_unidos_feedback_vercel_bypass` en Vault. Se verificó existencia sin leer su valor. Se creó `crono_unidos_feedback_worker_url` apuntando a la URL estable de rama Preview + `/api/internal/feedback-email`; no se modificaron secretos existentes.

Con outbox remoto vacío y canal todavía desactivado se hizo **una prueba HTTP explícita** desde pg_net usando ambos headers de Vault, sin imprimirlos; quedó registrada en dispatches con request ID **1**. Respuesta **401**, JSON de Deployment Protection (no el `unauthorized` de la app), sin timeout/error de transporte. No se declara conexión exitosa por el simple hecho de haber creado la URL. No hubo envío ni reclamo de correo.

Comprobaciones internas booleanas: valor sin CR/LF ni espacios de borde y longitud válida; **bypass igual al secreto de worker**. Se pidió al propietario corregir solo `crono_unidos_feedback_vercel_bypass` con la credencial dedicada de Vercel, distinta de `crono_unidos_feedback_worker_secret`. No se mostraron hashes/valores, no se rotó el worker y no se revocó el bypass anterior de Vercel. Repetir la prueba tras la corrección: el resultado esperado con canal desactivado es **503 / email_not_configured** de la app, no un 401 de Vercel.

La URL ya existe; los jobs automáticos no hacen HTTP mientras la cola siga vacía. No habilitar el canal hasta resolver el acceso, revisar destinatario y realizar prueba controlada. Si se agregan reuniones entretanto, no confundir el error de protección con un fallo de Brevo.


## Bypass corregido y acceso al worker verificado — 16/10/2026

El propietario corrigió el bypass de Vault. La comparación interna confirmó que **ya es distinto del secreto de worker**, sin recuperar ni mostrar valores. Se repitió una única prueba explícita de pg_net con outbox vacío (request ID **2**, metadata en dispatches). Resultado: **HTTP 503**, sin timeout, cuerpo exacto `{"error":"email_not_configured"}`. Esto prueba que se superó Deployment Protection y la autenticación independiente del worker, y que el guard de canal desactivado está funcionando. No es un fallo de Brevo ni evidencia de envío; no se llamó al proveedor.

Callback, secreto de worker y bypass están configurados en Vault del proyecto independiente. El remitente exclusivo está configurado/verificado; `FEEDBACK_EMAIL_ENABLED=false` sigue vigente en Preview. No se cambiaron Production, SMTP de Auth ni las credenciales del worker. Se consultó al propietario para una prueba controlada con reunión técnica claramente identificada, un solo destinatario y espera real de +10 min; todavía no se creó esa reunión ni se activó el canal.

### Prueba real autorizada: borrador preparado

El propietario autorizó la reunión técnica identificada, un único aviso a su cuenta y espera de diez minutos reales, conservando historial. Se creó por UI **un solo borrador** «Prueba técnica de correo», con una actividad de un minuto «Prueba técnica de correo — sin convocatoria», sin personas, equipos, notas ni recursos. Se comprobó existencia en DB para no repetir el alta ante una navegación demorada. El cambio de duración se guardó automáticamente como borrador.

La confirmación `window.confirm` de publicación bloqueó las llamadas CDP del navegador; una pestaña nueva recuperó el mismo borrador, sin crear otro. La comprobación posterior sigue mostrando `draft / published=false`: **no está publicada, iniciada ni cerrada**. Se pidió al propietario pulsar Publicar cambios y aceptar desde la UI. No se eludió el guard mediante SQL privilegiado. Canal de correo todavía desactivado, sin entrega ni solicitudes nuevas de esta reunión. Tras publicación: iniciar/cerrar por operador, verificar exactamente un participante/destinatario autorizado, habilitar Preview y esperar el scheduler real sin modificar timestamps.


## Prueba controlada en curso con reloj real — 16/10/2026

El propietario publicó el borrador preparado. Después se inició y cerró desde la consola autenticada de Preview, sin SQL de transición ni timestamps manipulados. Cierre efectivo **2026-10-17 02:44:57.968343 UTC** (16/10 23:44:57 Buenos Aires), vencimiento **02:54:57.968343 UTC**. Captura: **un participante**, cuenta exactamente igual al destinatario autorizado (comprobación booleana, sin volcar Auth). Antes del vencimiento: cero solicitudes y cero avisos; outbox global vacío. No se agregaron personas/equipos ni seeds remotos.

Se actualizó `FEEDBACK_EMAIL_ENABLED=true` solo en Preview / rama `codex/sprint-2-editor` y se redeplegó explícitamente a Preview (`dpl_AM5bzz6SHPxxWDep6NJxsQS6pfpW`, `crono-unidos-fem99y70b-damianjure-5692s-projects.vercel.app`), conservando alias estable. La CLI `env update` no acepta `--no-sensitive` en esta versión; el primer intento no cambió nada y se repitió por stdin con los argumentos admitidos. No se tocaron valores de credenciales ni Production.

Prueba de configuración con cola vacía: pg_net request **3**, HTTP **200**, contadores `processed=0 / accepted=0 / failed=0 / deferred=0`. Esto valida acceso y configuración del worker, **no API key aceptada por Brevo ni correo entregado**. La entrega real se deja al cron al cumplirse +10 min; no invocar el dispatcher manualmente. Desactivar nuevamente el canal tras el único aviso de prueba para no ampliar el alcance autorizado a envíos futuros.


## Resultado de la primera prueba real y bloqueo de IP — 16/10/2026

- El scheduler creó la solicitud a **02:55:00.104152 UTC**, después del vencimiento **02:54:57.968343 UTC**, sin adelantar reloj ni ejecutar el dispatcher manualmente. En la comprobación previa **02:53:24 UTC** seguían en cero solicitud/aviso/outbox. Una solicitud, un aviso y un destinatario; Chrome mostró el formulario real de la reunión técnica en `/feedback`, sin responderlo aún.
- El cron de correo ejecutó un intento: outbox **failed**, `attempts=1`, `last_error=provider_rejected`, sin `accepted_at`. **No es correo enviado ni entregado**. Se preservó la fila y auditoría; no se reencoló ni se resetearon tiempos/intentos. Tras nuevos ciclos, solicitud y aviso siguen únicos.
- Diagnóstico de solo lectura en Brevo: bloqueo de IP para API activo (SMTP desactivado); la lista de IP no autorizadas mostró **un bloqueo nuevo de salida Amazon a las 23:56**, coincidente con el intento. Los logs de correo no muestran un envío aceptado nuevo. No se expusieron ni leyeron valores de claves.
- Se actualizó `FEEDBACK_EMAIL_ENABLED=false` en la rama Preview y se redeplegó a Preview `crono-unidos-7vlzo11qc-damianjure-5692s-projects.vercel.app` (`dpl_KE2HYugVtwehXX3J41zLnaxLQpvF`), sin tocar Production. Prueba pg_net **5** devolvió **503 / email_not_configured**, confirmando desactivación efectiva, no solo edición de la variable.
- Se pidió autorización explícita para agregar **solo la IP bloqueada observada**, sin rangos ni desactivar el bloqueo general. No se autorizó ninguna IP automáticamente: esa lista afecta API/SMTP de toda la cuenta Brevo, no solo a Crono Unidos. Autorizar una IP dinámica puede servir para la prueba, **no resuelve estabilidad de egress para Production**.

Referencias: [bloqueo y lista compartida de Brevo](https://help.brevo.com/hc/en-us/articles/5740111683858-Authorize-and-block-IP-addresses-for-API-and-SMTP-security), [egress dinámico y allowlist en Vercel](https://vercel.com/kb/guide/how-to-allowlist-deployment-ip-address). No se cambió facturación, plan de Vercel ni seguridad global de Brevo. Antes de reintentar, resolver permiso/IP y revisar la ventana de idempotencia; no resetear masivamente trabajos fallidos ni volver a enviar aceptados.

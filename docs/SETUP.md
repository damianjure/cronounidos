# Preparación de servicios y entorno

> Estado vigente 16/10/2026: Sprints 0–4 cerrados funcionalmente; Sprint 5 implementa feedback in-app y worker Brevo, pero sigue abierto por activación/prueba real de correo y gates de Production. **33 migraciones** aplicadas en local y en el Supabase independiente `ivmhgizuofxdvvvzdxnl`. Estado del canal y credenciales en `EMAIL.md`; las entradas posteriores son checkpoints históricos, no el estado vigente.

## Estado actual

La Preview protegida de Vercel `crono-unidos` está conectada solo a `damianjure/cronounidos` y al Supabase independiente **Crono Unidos** (`ivmhgizuofxdvvvzdxnl`, São Paulo), sin seed remota. La organización `Unidos para Servir` (`unidos`) y el primer administrador están configurados. Variables y credenciales están limitadas a Preview; no se habilitó Production.

SMTP de Auth usa temporalmente el remitente autorizado solo para Preview. La API key de Brevo está cargada en Vercel y el secreto independiente de worker se aprovisionó desde Infisical en Vercel/Vault; no hay sincronización automática. El callback y acceso protegido al worker de correo están verificados después de corregir el bypass de Vault; pg_net obtuvo el 503 esperado del canal desactivado. El canal permanece deshabilitado, sin envíos de feedback. El remitente exclusivo de feedback `crono@damianjure.com` quedó verificado en Brevo; faltan callback/protección y recepción real, QA remota integral de Auth/RLS/invitaciones, dominio/redirects de Production y PWA en dispositivos físicos. No usar **caja-chica**, **docu-media-us** ni ningún proyecto ajeno.

## Historial y procedimientos de configuración

Los recuentos de migraciones, pruebas y pendientes en los checkpoints siguientes describen su fecha de ejecución; se conservan como evidencia histórica. Para el estado actual usar este encabezado, `ROADMAP.md`, `SPRINT-5.md` y `EMAIL.md`.

## 1. Entorno local

Node.js 24 LTS, npm y Supabase CLI. Se verificó con CLI 2.101.0. Docker debe estar iniciado para usar el stack completo de Supabase. En este host Colima ya funciona; `supabase start` completo chocó con el bind mount del socket Docker del servicio opcional `vector`, pero `supabase start --exclude vector` levantó el resto de servicios necesarios. No usar `db reset` en el entorno local ya probado si se desea conservar sus cuentas ficticias.

```sh
npm ci
cp .env.example .env.local
supabase start
supabase db reset --local
npm run dev
```

`db reset --local` es destructivo **solo para la base local de este proyecto**. Usarlo únicamente en un entorno de desarrollo descartable. Nunca agregar `--linked` sin revisar y confirmar el destino. El `project_id` de `supabase/config.toml` es `cronounidos`.

Las seeds locales contienen una organización `unidos-demo`, personas y equipos totalmente ficticios. No contienen correos, contraseñas, notas ni datos reales. No cargar la seed de demostración en producción.

### Variables

| Variable | Ubicación | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente/servidor | URL del proyecto nuevo o del stack local |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Cliente/servidor | Publishable key pública del mismo proyecto |
| `SUPABASE_SECRET_KEY` | **Solo servidor** | Clave privilegiada para altas/invitaciones del administrador; no se usa para saltarse RLS en consultas normales |
| `APP_URL` | Servidor | Origen canónico de la app, ej. `http://localhost:3000` o el dominio HTTPS final |

Nunca poner secret/service-role keys en `NEXT_PUBLIC_*`, GitHub, logs o formularios. Guardar valores reales solo en variables de entorno seguras; `.env.local` está ignorado. Sin las dos variables públicas la app funciona como base **sin conectar**. Sin clave segura funcionan las sesiones normales, pero no las altas/invitaciones administrativas.

## 2. Supabase independiente

1. **Hecho:** proyecto nuevo `Crono Unidos`, ref `ivmhgizuofxdvvvzdxnl`, organización Supabase `damianjure`, región `sa-east-1`. El checkout local está vinculado solo a ese ref; comprobar `supabase/.temp/project-ref` antes de cualquier `--linked`.
2. **Hecho:** veintitrés migraciones aplicadas al proyecto vinculado `ivmhgizuofxdvvvzdxnl` con `supabase db push --linked`, sin seed. La sexta crea `crono-resources` privado, PNG/JPEG/WebP/PDF hasta 5 MB; la séptima agrega cancelación; la octava revoca `EXECUTE` público del activador opcional `public.rls_auto_enable()`. La novena, `20261015035204_apply_template_selected.sql`, agrega aplicación selectiva y atómica de plantillas; el dry-run previo listó solo esa migración. La décima, `20261015140846_resource_file_lifecycle.sql`, añade reemplazo/eliminación de archivos no vinculados y cola de limpieza; su dry-run listó solo esta migración y se aplicó al mismo proyecto. La undécima, `20261015141804_team_scoped_block_notes.sql`, agrega edición estrecha de notas por equipo con grants `plan` y `read_content`; se aplicó luego de un dry-run que listó solo esa migración. La duodécima, `20261015144902_team_scoped_custom_fields.sql`, amplía la edición acotada a valores de campos personalizados; el dry-run listó solo esa migración, se aplicó al mismo proyecto y el dry-run posterior quedó al día. La decimotercera, `20261015151719_team_scoped_resource_links.sql`, agrega URL HTTPS y desvinculación por equipo; se aplicó tras dry-run limitado a esa migración. La decimocuarta agrega responsables acotados por equipo y la decimoquinta exige versión no nula en las cuatro RPCs previas del editor por equipo; su dry-run listó solo ambas migraciones. No usar `--include-seed` en remoto.
3. **Verificado:** 30/30 tablas `public` con RLS; bucket privado; una organización `Unidos para Servir` con slug `unidos` y zona horaria `America/Argentina/Buenos_Aires`. No se cargó la seed. El proyecto contiene la primera cuenta Auth real, su perfil/membresía aprobados y un grant global de administrador; `people` y `teams` no se poblaron. `anon` y `authenticated` no pueden ejecutar `rls_auto_enable()`. El advisor aún marca deliberadamente `public_agenda` para `anon` y RPCs autorizadas `SECURITY DEFINER` para usuarios autenticados: cada función debe mantener comprobaciones internas de identidad/permiso y GRANT explícito. [Aviso de Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
4. **Verificación remota parcial (15/10/2026):** en Data API, `public` y `graphql_public` figuran expuestos; `private` no. Con la publishable key, PostgREST anónimo devolvió HTTP 401 (`42501`) al intentar `SELECT` de `profiles` y `meetings`; la RPC mínima `public_agenda` devolvió HTTP 200 con `[]` (no hay reuniones publicadas), y solicitar `Accept-Profile: private` devolvió HTTP 406 (`PGRST106`). Sigue pendiente probar API con JWT de cuenta pendiente y miembros de dos organizaciones, sin datos personales de la comunidad todavía. Generar tipos al preparar las siguientes funcionalidades.
5. **Rendimiento:** advisor remoto informa 9 advertencias `auth_rls_initplan` y avisos informativos de índices. Revisarlos antes del lanzamiento público, priorizando consultas reales; no crear indiscriminadamente índices para todas las FKs.

## 3. Auth email

- Habilitar email/contraseña, autorregistro y **confirmación de correo**. En `config.toml` local está habilitada la confirmación y la contraseña mínima es de 10 caracteres.
- Site URL igual a `APP_URL`. Agregar exactamente los redirect URLs necesarios para `/auth/callback`, `/auth/confirm` y `/actualizar-clave`. Configurar cada preview explícitamente; no usar comodines generales en producción. El registro, la invitación y la recuperación envían `redirectTo` a `/auth/confirm`; el servidor verifica OTP y después redirige al destino canónico `APP_URL`. El callback PKCE permanece para otros enlaces con `code`.
- Configurar SMTP en producción y los límites de Auth. Para registro público, habilitar CAPTCHA/protección contra abuso desde Supabase antes de una apertura amplia; no se integró un proveedor CAPTCHA en estos sprints.
- Google OAuth y anonymous sign-ins deben mantenerse deshabilitados: no forman parte de esta etapa.
- Las tres plantillas de desarrollo local están versionadas en `supabase/templates/` y configuradas en `config.toml`. Reproducirlas en el proyecto remoto: los enlaces SSR deben ir al verificador con `token_hash`, no al enlace de verificación implícita de Supabase que devuelve la sesión en el fragmento. No incluir tokens en logs:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=signup">Verificar correo</a>
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=invite">Aceptar invitación</a>
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery">Recuperar contraseña</a>
```

Cada fragmento corresponde a su propia plantilla. Invitación/recuperación verifican OTP en servidor y luego abren `/actualizar-clave`. `/auth/callback` también admite el intercambio PKCE de `code` de la SDK. No pasar destinos arbitrarios por query string. Al cambiar las plantillas locales, reiniciar con `supabase stop` (sin `--no-backup`) y `supabase start --exclude vector` si Colima no admite el bind mount de ese servicio opcional.

Flujo: registrarse → verificar correo → ingresar → solicitar acceso con el slug `unidos` → administrador aprueba. Hasta entonces, `/inicio`, `/personas`, `/administracion`, `/cronograma` y `/calendario` no entregan datos internos. Las altas/invitaciones desde administración también quedan pendientes. Las contraseñas creadas por admin no tienen caducidad forzada implementada: preferir invitación por email; si se usa alta directa, entregar la clave por canal seguro y pedir cambio inmediato.

## 4. Primer administrador (bootstrap confiable)

No hay endpoint público ni autoasignación de administrador. El primer administrador debe habilitarse mediante una operación confiable en la **base nueva confirmada**, después de crear/verificar su cuenta Auth.

La organización real `unidos` ya existe. Usar UUIDs reales solo en el SQL Editor seguro del proyecto confirmado, no en commits. Ejemplo **con placeholders que deben reemplazarse**:

```sql
begin;
-- La organización y el auth.users.id deben existir en ESTE proyecto.
insert into public.profiles(user_id,display_name)
values ('USER_UUID'::uuid,'Administrador inicial')
on conflict (user_id) do nothing;
update public.profiles set approved_at=now() where user_id='USER_UUID'::uuid;
insert into public.memberships(org_id,user_id,status)
values ('ORG_UUID'::uuid,'USER_UUID'::uuid,'approved')
on conflict(org_id,user_id) do update set status='approved';
insert into public.permission_grants(org_id,subject_user_id,permission)
values ('ORG_UUID'::uuid,'USER_UUID'::uuid,'administer')
on conflict do nothing;
commit;
```

En desarrollo local se puede usar el org UUID ficticio de `seed.sql`, pero **no** para producción. Luego ingresar, abrir `/administracion` y aprobar cuentas, vincular personas, configurar permisos y suspender miembros. Los permisos iniciales son **aditivos**, no reemplazan ni revocan otros permisos: revocarlos explícitamente en el panel cuando corresponda. `administer` es de organización; planificación/lectura de agenda global requieren un grant global. Acciones sobre personas/roles/asignaciones/notas admiten scope de equipo. No suspender tu propia cuenta ni revocar el único grant de administrador sin contar con recuperación confiable. Si una invitación creó Auth pero falló la membresía, recuperar el usuario y registrar la membresía pendiente antes de reintentar; nunca conceder acceso por metadata.

## 5. Vercel

Convención de nombres aprobada: nombre visible de la app y del proyecto Supabase **Crono Unidos**; proyecto Vercel **`crono-unidos`** (Vercel usa identificadores tipo slug). La organización de datos dentro de Supabase es **Unidos para Servir** (`unidos`), no otro proyecto de infraestructura. El repositorio existente sigue siendo [`damianjure/cronounidos`](https://github.com/damianjure/cronounidos); no renombrarlo solo para uniformar. Cada recurso debe pertenecer al proyecto nuevo, sin reutilizar proyectos, variables de entorno ni bases de datos de otras aplicaciones.

**Creado:** proyecto Vercel independiente [`crono-unidos`](https://vercel.com/damianjure-5692s-projects/crono-unidos) (`prj_htQ8u4QUEnC4C0eAYHvkqA92f574`) en el equipo Hobby `damianjure-5692s-projects`, verificado por dashboard y listado del conector. La configuración Git muestra conectado únicamente [`damianjure/cronounidos`](https://github.com/damianjure/cronounidos). Se configuraron `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **solo en Preview**, apuntando al proyecto Supabase `ivmhgizuofxdvvvzdxnl`; Vercel confirmó ambos nombres/target y el valor esperado sin mostrar la clave. También se agregó `APP_URL` como Config **solo para la rama Preview `codex/sprint-2-editor`**, con el origen HTTPS estable `https://crono-unidos-git-codex-sprint-fa2adf-damianjure-5692s-projects.vercel.app`. No hay variables en Production. No se agregó `SUPABASE_SECRET_KEY`. No se modificaron los otros proyectos del equipo.

**Preview verificada:** se subió `codex/sprint-2-editor` a GitHub por SSH (la credencial HTTPS local carece del permiso `workflow` para el archivo de CI). Vercel inició un primer build como Production pese a que la rama Production configurada es `main`; se canceló antes de quedar activo. Luego se creó explícitamente una [Preview de esa rama](https://vercel.com/damianjure-5692s-projects/crono-unidos/367SMnbQw5nZwiAoRhCxXf38nEuz), estado `READY`, commit `f005021`, con preset Next.js y Node 24. URL estable de rama: `https://crono-unidos-git-codex-sprint-fa2adf-damianjure-5692s-projects.vercel.app`. En Chrome autenticado se verificaron la portada, la agenda vacía, la redirección de `/inicio` a `/ingresar` y el manifiesto PWA. Una solicitud HTTP sin sesión fue redirigida al login de Vercel. El proyecto sigue sin Production activa (`live=false`).

**Auth de Preview (15/10/2026):** en el proyecto Supabase correcto se cambió Site URL al origen HTTPS estable de esa rama y se agregaron **sin comodines** los tres redirect URLs exactos `/auth/confirm`, `/auth/callback` y `/actualizar-clave`. Email/contraseña, autorregistro y confirmación de correo estaban habilitados; OAuth Google y acceso anónimo deshabilitados. Se elevó la longitud mínima remota de contraseña de 6 a 10 caracteres, igual que local. Una [nueva Preview](https://vercel.com/damianjure-5692s-projects/crono-unidos/BdJ9Xu3f5HCS9uGL7WhCFseAuk52) se redeplegó desde `7af8520` para incorporar `APP_URL`, entorno Preview y estado `READY`.

**SMTP y plantillas de Preview (15/10/2026):** el propietario autorizó usar temporalmente el remitente Brevo verificado `hola@damianjure.com` **solo mientras la app está en Preview**. En el proyecto Supabase `ivmhgizuofxdvvvzdxnl` quedó activo SMTP personalizado con `smtp-relay.brevo.com:587`, nombre visible `Crono Unidos (Preview)` y la clave Brevo separada `crono-unidos-preview`, creada e ingresada directamente por el propietario; la clave no se leyó ni se guardó en Git/chat. Las plantillas remotas de confirmación, invitación y recuperación se copiaron desde `supabase/templates/*.html` con enlaces SSR `RedirectTo` + `TokenHash` y se verificó el guardado en el dashboard. El registro del propietario devolvió «Revisá tu correo» y luego Auth mostró correo confirmado e inicio de sesión: esto valida el flujo de confirmación, aunque no se inspeccionó el contenido del mensaje ni los logs de entrega de Brevo. La configuración SMTP aplica al proyecto Supabase completo, no a una rama: reemplazar este remitente personal por uno dedicado antes de activar Production o invitar a terceros.

**Primer administrador (15/10/2026):** con la cuenta Auth confirmada, se ejecutó una única transacción confiable en `ivmhgizuofxdvvvzdxnl` para aprobar su perfil y membresía en `unidos` y asignar `administer` global. Se verificó por consulta que `email_confirmed`, `profile_approved` y `org_admin` son verdaderos, y la membresía está `approved`. El correo y UUID del propietario no se versionaron. El propietario ingresó en la Preview y Chrome abrió `/administracion`: se vio «Damian Aprobado», el grant `administer / Organización` y ninguna solicitud pendiente. El intento anterior sin cookie redirigió a `/ingresar`, como corresponde. Aún no se probó una operación de administración con escritura.

**Secret de Preview e invitación de prueba (15/10/2026):** el propietario creó una clave Secret dedicada del proyecto Supabase `Crono Unidos` y la ingresó directamente en Vercel como `SUPABASE_SECRET_KEY`, tipo **Secret**, limitada a la rama Preview `codex/sprint-2-editor`. No se leyó ni se versionó el valor. Al pushear el commit documental `566a8ad`, Vercel generó la Preview `99qrzaDUwvs9XMNtjU7nEp1iKNoL`, estado **Ready**, con la URL estable de rama apuntando a ella; `/administracion` siguió funcionando. Desde ese panel se envió una única invitación a un alias de prueba controlado por el propietario, con nombre ficticio «Prueba Preview». La UI devolvió «Operación completada» y la solicitud aparece pendiente. Una consulta remota verificó `invited=true`, `email_confirmed=false`, membresía `pending`, perfil sin aprobación y **cero grants**. No se aprobó ni se habilitó acceso al alias. La dirección de prueba no se versiona aquí.

**Invitación recibida; pendiente de acceso:** el propietario confirmó la recepción del correo de invitación. Auth remoto muestra el correo del alias confirmado, pero su perfil sigue sin aprobar, la membresía continúa `pending` y tiene **cero grants**. No se aprobó al alias. La sesión observada en Chrome seguía siendo la del administrador, por lo que **no** se ha demostrado en navegador que el alias ingrese, cambie/establezca contraseña o quede restringido a `/pendiente`; hacerlo en una sesión separada. Probar también cookies SSR/renovación y recuperación remota. Revisar si Brevo registró la entrega del correo de confirmación. Configurar Production por separado cuando el MVP y las pruebas remotas estén listos, con remitente dedicado. También falta confirmar dominio final. Build: `npm run build`; preset Next.js, Node 24. Se recomienda mantener el repositorio privado. La CLI local de Vercel sigue sin sesión; usar el dashboard o autenticar la CLI antes de ejecutar comandos `vercel`. El conector Vercel de esta sesión respondió 403 para el scope; se verificaron la variable y el despliegue en Chrome en su lugar.

**Actualización posterior (15/10/2026):** al verificar el directorio nuevo, la UI de administración y una consulta de solo lectura mostraron que el alias de prueba pasó a membresía/perfil `approved` y tiene un grant. Ese cambio **no lo hizo Codex en esta continuación** y no se probó el inicio de sesión del alias; ya no sirve para demostrar el estado pendiente sin crear otra cuenta de prueba. Por pedido del propietario, se posponen las pruebas de invitación y no se envía otra.

No se hizo lanzamiento a Production. Cualquier dominio como `app.unidosparaservir.org` debe confirmarse por el usuario. El bucket privado Storage está versionado, probado localmente y creado remoto; el flujo de subida/descarga remoto aún no fue probado con usuarios reales. Realtime, scheduler de feedback y proveedor de correo de feedback corresponden a Sprints 4–5. No se simulan como servicios disponibles.

## 6. Verificación que falta sobre servicios reales

- Supabase remoto independiente: las veintitrés migraciones, RLS estructural, bucket y advisors ya se verificaron. SMTP y plantillas SSR están configurados; la primera cuenta quedó confirmada y aprobada como administrador, y `/administracion` abrió en Chrome con su sesión. La invitación remota fue recibida y el alias tiene correo confirmado; posteriormente apareció aprobado con un grant (ver actualización anterior), sin que Codex modificara ese estado. La API anónima denegó `profiles`/`meetings`, permitió solo la proyección vacía de `public_agenda` y no expuso `private`. Faltan ingreso/cambio de contraseña del alias, recuperación, renovación y PostgREST/RLS con JWT pendientes/aprobados y dos organizaciones. Localmente se probaron registro, confirmación, invitación y recuperación **hasta cambiar la contraseña** con plantillas SSR; las cuentas quedaron pendientes hasta aprobación. También se probaron PostgREST/JWT/RLS, aprobación y suspensión por UI, ACL por equipo y aislamiento de dos organizaciones.
- Playwright CLI pasó **28/28** casos base desktop/mobile con Chrome. La suite autenticada local pasó **10/10** en Chrome desktop/mobile, incluidos catálogos, Storage privado, directorio, cancelación y aplicación selectiva de plantilla. También pasaron en CI con Supabase local en la ejecución 38756088731; falta Preview remota y dispositivos reales.
- Instalación PWA en dispositivos reales iOS/Android, modo standalone y lectores de pantalla; el navegador integrado verificó manifest, worker, offline y teclado, pero no dispositivos reales.
- Operaciones de administración con escritura y otros flujos Auth/RLS/Storage reales en la Preview, despliegue Production, advisors y observabilidad. No afirmar listo para producción hasta completar esas comprobaciones.
- El directorio de personas/equipos/roles del Sprint 2 quedó desplegado en Preview desde `20a1d76` (`Ready`); Chrome mostró los formularios de administración en `/personas` con la organización aún vacía. Las escrituras E2E se probaron solo con Supabase local; no se cargaron datos de prueba en Supabase remoto.

### Suite E2E autenticada local

Con Colima/Docker, Supabase local (`supabase start --exclude vector` si corresponde), `psql` y Chrome/Chromium disponibles:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e:auth:local
```

El script `scripts/run-auth-e2e-local.mjs` admite **solo** API `127.0.0.1:54321` y PostgreSQL `127.0.0.1:54322`; aborta si el destino no es local. Lee `supabase status` en memoria, construye el build `.next-auth-e2e`, y corre `playwright.authenticated.config.ts` en puerto 3101. No necesita `.env.local` ni revela claves en consola. El setup conserva una cuenta/organización ficticias `crono-e2e` para repetir pruebas; genera una clave aleatoria nueva por corrida. El teardown borra únicamente registros y archivos Storage de esa organización, no hace `db reset` ni toca otros proyectos. Las pruebas 10/10 desktop/mobile se aprobaron localmente; este comando ya corre en el job `authenticated-local` de CI (primera ejecución 38756088731 verde), pero no demuestra comportamiento de Supabase/Vercel remotos.

### Restricciones de artefactos de este host

Algunas limpiezas bajo el workspace fallan con `EPERM` (`rmdir`), aunque se pueden generar nuevos artefactos. No borrar carpetas a ciegas ni eludir permisos. Se verificó usando rutas de salida soportadas:

```sh
npm run test:coverage -- --coverage.reportsDirectory=/tmp/chrono-coverage-NUEVO
NEXT_BUILD_DIR=.next-validation-NUEVO npm run build
NEXT_BUILD_DIR=.next-validation-NUEVO npm run start
```

Cambiar `NUEVO` por un identificador nuevo en cada ejecución. Playwright admite `E2E_PORT` (3100 por defecto), `E2E_OUTPUT_DIR`, `E2E_REPORT_DIR` y, si corresponde, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Estas opciones facilitan probar un servidor de producción ya iniciado en otro puerto y ubicar artefactos. En este host Chrome instalado funcionó con `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; el navegador descargado de Playwright no estaba presente. Los reportes/builds están ignorados por Git. En un checkout limpio de CI usar las rutas predeterminadas.

## Referencias técnicas verificadas

- [Supabase SSR para Next.js](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Next.js App Router](https://nextjs.org/docs/app/getting-started/installation)

## Cierre Sprint 3 — configuración pendiente

Las migraciones 19–23 no necesitan API keys ni variables nuevas. Ver `SPRINT-3-CLOSURE.md` para evidencia y límites. Antes de Production: revisar Leaked Password Protection (actualmente desactivada y sujeta al plan disponible), remitente/SMTP exclusivos, variables de Production y redirects/dominio; repetir QA Auth/RLS remota con roles distintos y dispositivos físicos. No se cambió plan de Supabase ni facturación.

## Preferencia de Production confirmada — 16/10/2026

El usuario eligió usar un subdominio de `damianjure.com` y crear un remitente exclusivo para Crono Unidos. Candidatos a verificar por disponibilidad: `crono.damianjure.com` y `crono@damianjure.com`. No se modificó DNS ni se habilitó Production; primero completar verificación del MVP, configurar identidad remitente en Brevo y validar dominio/redirects. El remitente temporal sigue autorizado solo en Preview.

## Estado de ejecución y feedback — 16/10/2026

Migraciones 24–26 aplicadas localmente y en `ivmhgizuofxdvvvzdxnl`, con dry-runs limitados a los archivos nuevos y sin seeds remotos. Realtime publica `meeting_live_state`; anon no ejecuta las RPCs de live ni lee el estado. El rol técnico `supabase_realtime_admin` recibe solo SELECT de `meeting_id` para descubrir el filtro, manteniendo RLS sin política para ese rol y sin grants de otras columnas. La comprobación previa al primer componente de feedback confirmó cero ejecuciones remotas existentes, por lo que no hubo participantes históricos que reconstruir.

La captura privada de participantes de Sprint 5 ya existe, pero aún no hay generación de solicitudes +10 min, notificaciones, formulario, panel ni envío de email. No se debe interpretar la captura ni el texto de cierre de la consola como feedback funcionando. No hay variables nuevas de configuración para live/captura. El CI del arreglo de Realtime y la Preview se verifican antes de cerrar Sprint 4; ver `SPRINT-4.md` y `SPRINT-5.md`.

### Núcleo de feedback local — 16/10/2026

Local: **28 migraciones**. Remoto independiente: **26**; todavía NO se enviaron las migraciones 27–28. No hay variables nuevas para el despacho SQL ni para avisos internos. `crono-unidos-feedback-dispatch` está activo cada minuto en el PostgreSQL local; se verificó `cron.job_run_details.status = succeeded` y `return_message = 1 row` (ejecución del dispatcher, no evidencia de email ni aún E2E de entrega). Las comprobaciones reales de privilegios dieron `authenticated` sin EXECUTE del dispatcher y `anon` sin EXECUTE de envío de feedback. Configuración de correo de aplicación, interfaz y verificación remota siguen pendientes. Nunca usar el remitente temporal fuera de Preview.


### Feedback in-app y scheduler aplicados — 16/10/2026

Estado actualizado: **29 migraciones local y remoto** independiente `ivmhgizuofxdvvvzdxnl`. Las migraciones 27–29 se aplicaron después de dry-run limitado a esos archivos, sin seeds/fixtures remotos. Job `crono-unidos-feedback-dispatch` activo cada minuto con historial remoto `succeeded`; no requiere variables nuevas, tokens de cron ni navegador abierto. Los grants comprobados siguen denegando dispatcher a authenticated y envío de feedback a anon.

Interfaz `/feedback`, aviso en `/inicio` y panel `/feedback/admin` implementados y probados en Chrome local desktop/mobile. CI/Preview de `4150ea1` deben verificarse antes de afirmar entrega remota. Email de feedback NO configurado: falta outbox/transporte de aplicación, credencial API segura de Brevo y remitente exclusivo validado. No reutilizar automáticamente la configuración SMTP de Supabase Auth ni exponer claves en documentación. Subdominio/remitente candidatos siguen sin DNS cambiado y Production deshabilitada.


### Worker Brevo preparado, no activado — 16/10/2026

Estado actualizado: **33 migraciones en local y remoto** independiente, incluyendo outbox, scheduler de correo, habilitación de pg_net faltante y guard de cambio de entorno. Preview del worker Ready; POST sin secreto devuelve 401, sin operar la cola. `net` sigue fuera del Data API (406/PGRST106), Vault no es legible por anon/authenticated. El job email está registrado, pero sin secretos de Vault no despacha HTTP. No se cargó API key de Brevo ni se habilitó envío real; SMTP de Auth no cambia.

Seguir **[EMAIL.md](EMAIL.md)** para cargar API key y secreto independiente como Secrets de Vercel, verificar remitente, configurar los nombres dedicados en Vault y probar recepción. Mantener `FEEDBACK_EMAIL_ENABLED=false` hasta acordar la prueba y revisar la cola. Production permanece deshabilitada; el remitente temporal solo está autorizado para Preview y no se reutiliza automáticamente en otro entorno.

### Credencial aleatoria gestionada con Infisical — 16/10/2026

El propietario autorizó generar y gestionar el secreto de worker con Infisical. Se creó `FEEDBACK_WORKER_SECRET` en **Desarrollo IA / Development / `/crono-unidos/preview`** y se aprovisionó el mismo valor en Vercel Preview (rama `codex/sprint-2-editor`, Sensitive/Secret) y en Vault del Supabase independiente con nombre `crono_unidos_feedback_worker_secret`. Valores no mostrados ni versionados; archivo temporal privado eliminado. Se verificaron metadata/existencia, no se descifraron secretos existentes. Infisical todavía no tiene sincronización automática configurada. La API key real de Brevo permanece en Vercel, intacta y no copiada a Infisical. El callback URL sigue ausente y el canal no fue habilitado: no hubo HTTP ni correo. Ver el estado actualizado en `EMAIL.md` antes de repetir o rotar credenciales.

### Preflight de dominio y automatización — 16/10/2026

Consulta DNS de solo lectura: los servidores autoritativos de `damianjure.com` son **Cloudflare** (`donna.ns.cloudflare.com`, `lee.ns.cloudflare.com`), no Vercel. La consulta autoritativa de A y CNAME para el candidato `crono.damianjure.com` devolvió **NXDOMAIN**. El equipo Vercel todavía no tiene dominios registrados en su listado. Esto no reserva el subdominio ni constituye una conexión de Production.

Al conectar el dominio aprobado, obtener primero de Vercel el destino DNS exacto del proyecto y cargar solo el registro del subdominio en **Cloudflare**. No inventar un CNAME universal, trasladar nameservers ni modificar MX, DKIM o DMARC existentes. Los MX actuales apuntan a Cloudflare Email Routing; eso no demuestra que el alias `crono@damianjure.com` exista. Confirmar su entrega por separado.

El propietario confirmó la creación del bypass de automatización y Vercel mostró una segunda credencial recién agregada, sin revelar su valor ni modificar la anterior. La consulta de metadata en Supabase aún no encontró `crono_unidos_feedback_vercel_bypass`: se dejó el formulario Vault del proyecto correcto con nombre/descripcion preparados, para que el propietario pegue el valor directamente. Callback ausente y canal desactivado. No confundir bypass creado en Vercel con credencial ya disponible en Vault.

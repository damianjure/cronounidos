# Preparación de servicios y entorno

## Estado actual

La app de Sprints 0/1 y un tramo avanzado de Sprint 2 están implementados (ver SPRINT-2.md). El usuario confirmó y creó un proyecto Supabase **independiente**, `Crono Unidos` (`ivmhgizuofxdvvvzdxnl`, São Paulo), el 15/10/2026. Se aplicaron allí las ocho migraciones versionadas, **sin seed ni usuarios reales**. Se creó únicamente la organización real `Unidos para Servir` (`unidos`). También existe el proyecto Vercel independiente `crono-unidos`, conectado solo a `damianjure/cronounidos`, con las dos variables públicas de Supabase en Preview y todavía sin despliegues. Faltan Auth/SMTP, primer administrador, otras variables necesarias, despliegue y los sprints restantes; no está lista para público. No usar **caja-chica**, **docu-media-us** ni ningún proyecto ajeno.

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
2. **Hecho:** ocho migraciones en `supabase/migrations/`, aplicadas con `supabase db push --linked` y verificadas en `supabase_migrations.schema_migrations`. La sexta crea `crono-resources` privado, PNG/JPEG/WebP/PDF hasta 5 MB; la séptima agrega cancelación; la octava revoca `EXECUTE` público del activador opcional `public.rls_auto_enable()`. No usar `--include-seed` en remoto.
3. **Verificado:** 30/30 tablas `public` con RLS; bucket privado; una organización `Unidos para Servir` con slug `unidos` y zona horaria `America/Argentina/Buenos_Aires`. No se cargó la seed: `people`, `teams`, `memberships`, `auth.users` y `permission_grants` permanecen vacías. `anon` y `authenticated` no pueden ejecutar `rls_auto_enable()`. El advisor aún marca deliberadamente `public_agenda` para `anon` y RPCs autorizadas `SECURITY DEFINER` para usuarios autenticados: cada función debe mantener comprobaciones internas de identidad/permiso y GRANT explícito. [Aviso de Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
4. **Pendiente:** crear/verificar la cuenta Auth del primer administrador y habilitarla mediante bootstrap confiable; configurar Auth y probar API con identidades de prueba (`anon`, pendiente y miembros de dos organizaciones), sin datos personales de la comunidad todavía. Exponer solo `public` en Data API; `private` **no** debe estar expuesto. Generar tipos al preparar las siguientes funcionalidades.
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

**Creado:** proyecto Vercel independiente [`crono-unidos`](https://vercel.com/damianjure-5692s-projects/crono-unidos) (`prj_htQ8u4QUEnC4C0eAYHvkqA92f574`) en el equipo Hobby `damianjure-5692s-projects`, verificado por dashboard y listado del conector. La configuración Git muestra conectado únicamente [`damianjure/cronounidos`](https://github.com/damianjure/cronounidos). Se configuraron `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **solo en Preview**, apuntando al proyecto Supabase `ivmhgizuofxdvvvzdxnl`; Vercel confirmó ambos nombres/target y el valor esperado sin mostrar la clave. No hay variables en Production ni despliegues Production o Preview. No se agregaron `SUPABASE_SECRET_KEY` ni `APP_URL`. No se modificaron los otros proyectos del equipo.

**Pendiente:** completar Preview con `APP_URL` canónica y, para altas/invitaciones administrativas, una `SUPABASE_SECRET_KEY` **solo servidor**; configurar Production por separado cuando el MVP y las pruebas remotas estén listos. También faltan HTTPS/dominio final y subir una rama preparada para generar una Preview. Build: `npm run build`; Next.js detectado automáticamente. Node 24. Se recomienda mantener el repositorio privado. La CLI local de Vercel sigue sin sesión; usar el dashboard o autenticar la CLI antes de ejecutar comandos `vercel`.

No se hizo deploy ni se publicó una preview en esta entrega. Cualquier dominio como `app.unidosparaservir.org` debe confirmarse por el usuario. El bucket privado Storage está versionado, probado localmente y creado remoto; el flujo de subida/descarga remoto aún no fue probado con usuarios reales. Realtime, scheduler de feedback y proveedor de correo de feedback corresponden a Sprints 4–5. No se simulan como servicios disponibles.

## 6. Verificación que falta sobre servicios reales

- Supabase remoto independiente: las ocho migraciones, RLS estructural, bucket y advisors ya se verificaron. Falta Auth/SMTP, redirecciones, cookies SSR y renovación, PostgREST/RLS con identidades reales de prueba y comprobación de que `private` no se exponga. Localmente se probaron registro, confirmación, invitación y recuperación **hasta cambiar la contraseña** con plantillas SSR; las cuentas quedaron pendientes hasta aprobación. También se probaron PostgREST/JWT/RLS, aprobación y suspensión por UI, ACL por equipo y aislamiento de dos organizaciones.
- Playwright CLI pasó **28/28** casos desktop/mobile con el Chrome instalado en este host usando `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Falta repetir en CI y automatizar E2E autenticadas de catálogos/Storage/cancelación; el navegador integrado sí verificó esos flujos localmente.
- Instalación PWA en dispositivos reales iOS/Android, modo standalone y lectores de pantalla; el navegador integrado verificó manifest, worker, offline y teclado, pero no dispositivos reales.
- Email y bootstrap; deploy/preview Vercel, advisors, observabilidad. No afirmar listo para producción hasta completar esas comprobaciones.

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

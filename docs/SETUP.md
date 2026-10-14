# Preparación de servicios y entorno

## Estado actual

La app de Sprints 0/1 y el primer tramo de Sprint 2 están implementados (ver SPRINT-2.md); no se creó ni modificó ningún proyecto remoto. Falta confirmar el nuevo proyecto Supabase y configurar Auth, el primer administrador y Vercel. No usar **caja-chica**, **docu-media-us** ni ningún proyecto ajeno.

## 1. Entorno local

Node.js 24 LTS, npm y Supabase CLI. Se verificó con CLI 2.101.0. Docker debe estar iniciado para usar el stack completo de Supabase; en este host estaba inactivo.

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

1. Crear un proyecto nuevo llamado `cronounidos` en la organización elegida por el usuario. **Pendiente de elección/confirmación de project ref**.
2. Revisar las cuatro migraciones en `supabase/migrations/` y probarlas localmente.
3. Confirmar el project ref de destino antes de vincular o aplicar a remoto. No se ejecutó SQL remoto en esta entrega.
4. Aplicar migraciones usando la CLI a ese proyecto confirmado; exponer solo `public` en Data API. `private` **no** debe estar expuesto. Las tablas tienen GRANT explícitos y RLS activo.
5. Ejecutar los advisors de Supabase y una prueba de API con identidades reales de prueba, incluyendo `anon`, pendientes y miembros de dos organizaciones.
6. Generar tipos desde la base local o proyecto confirmado al preparar el editor. Los clientes actuales usan validación y autorización DB; no hay tipos generados contra un proyecto remoto inexistente.

## 3. Auth email

- Habilitar email/contraseña, autorregistro y **confirmación de correo**. En `config.toml` local está habilitada la confirmación y la contraseña mínima es de 10 caracteres.
- Site URL igual a `APP_URL`. Agregar exactamente los redirect URLs necesarios para `/auth/callback`, `/auth/confirm` y `/actualizar-clave`. Configurar cada preview explícitamente; no usar comodines generales en producción.
- Configurar SMTP en producción y los límites de Auth. Para registro público, habilitar CAPTCHA/protección contra abuso desde Supabase antes de una apertura amplia; no se integró un proveedor CAPTCHA en estos sprints.
- Google OAuth y anonymous sign-ins deben mantenerse deshabilitados: no forman parte de esta etapa.
- Para plantillas email SSR de confirmación, invitación y recuperación usar un enlace hacia el verificador del servidor con `token_hash` (no incluir tokens en logs):

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Verificar correo</a>
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Aceptar invitación</a>
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Recuperar contraseña</a>
```

Cada fragmento corresponde a su propia plantilla. Invitación/recuperación verifican OTP en servidor y luego abren `/actualizar-clave`. `/auth/callback` también admite el intercambio PKCE de `code` de la SDK. No pasar destinos arbitrarios por query string.

Flujo: registrarse → verificar correo → ingresar → solicitar acceso con el slug de organización → administrador aprueba. Hasta entonces, `/inicio`, `/personas`, `/administracion`, `/cronograma` y `/calendario` no entregan datos internos. Las altas/invitaciones desde administración también quedan pendientes. Las contraseñas creadas por admin no tienen caducidad forzada implementada: preferir invitación por email; si se usa alta directa, entregar la clave por canal seguro y pedir cambio inmediato.

## 4. Primer administrador (bootstrap confiable)

No hay endpoint público ni autoasignación de administrador. El primer administrador debe habilitarse mediante una operación confiable en la **base nueva confirmada**, después de crear/verificar su cuenta Auth.

Crear primero una organización real con su slug. Usar UUIDs reales solo en el SQL Editor seguro del proyecto confirmado, no en commits. Ejemplo **con placeholders que deben reemplazarse**:

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

Pendiente vincular el proyecto Vercel a este GitHub, configurar el entorno (Preview y Production separados), HTTPS y dominio. Build: `npm run build`; Next.js detectado automáticamente. Node 24. El repositorio oficial es https://github.com/damianjure/cronounidos; se recomienda mantenerlo privado.

No se hizo deploy ni se publicó una preview en esta entrega. Cualquier dominio como `app.unidosparaservir.org` debe confirmarse por el usuario. Realtime, bucket privado Storage, scheduler de feedback y proveedor de correo de feedback se configuran en Sprints 2–5; no se simulan como servicios disponibles.

## 6. Verificación que falta sobre servicios reales

- Supabase completo: Auth/confirmación/invitación/reset, cookies SSR y renovación, PostgREST/RLS, esquema privado no expuesto.
- Aprobación, suspensión y ACL por equipo usando cuentas de prueba reales; navegación autenticada y logout entre dos usuarios.
- Playwright en un runner donde Chrome pueda arrancar; el host actual aborta con `SIGABRT` antes de las aserciones.
- Instalación PWA en dispositivos reales iOS/Android, modo standalone, teclado y lectores de pantalla; no se verificó visualmente en este host.
- Email y bootstrap; deploy/preview Vercel, advisors, observabilidad. No afirmar listo para producción hasta completar esas comprobaciones.

### Restricciones de artefactos de este host

Algunas limpiezas bajo el workspace fallan con `EPERM` (`rmdir`), aunque se pueden generar nuevos artefactos. No borrar carpetas a ciegas ni eludir permisos. Se verificó usando rutas de salida soportadas:

```sh
npm run test:coverage -- --coverage.reportsDirectory=/tmp/chrono-coverage-NUEVO
NEXT_BUILD_DIR=.next-validation-NUEVO npm run build
NEXT_BUILD_DIR=.next-validation-NUEVO npm run start
```

Cambiar `NUEVO` por un identificador nuevo en cada ejecución. Playwright admite `E2E_OUTPUT_DIR`, `E2E_REPORT_DIR` y, si corresponde, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Esas opciones solo resuelven la ubicación de artefactos: **no** resuelven el aborto de Chrome. Los reportes/builds están ignorados por Git. En un checkout limpio de CI usar las rutas predeterminadas.

## Referencias técnicas verificadas

- [Supabase SSR para Next.js](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Next.js App Router](https://nextjs.org/docs/app/getting-started/installation)

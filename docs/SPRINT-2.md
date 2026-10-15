# Sprint 2 — editor (14/10/2026)

## Estado

Continuación solicitada por el usuario, incluyendo reintento de Chrome. **Sprint 2 avanzado, todavía no cerrado.** No se declara completo el MVP ni producción lista. Se mantienen PRD/DECISIONS/AGENTS, sin WhatsApp, OAuth Google ni ProPresenter.

## Implementado

- Listado `/cronograma`, creación `/cronograma/nueva` y editor `/cronograma/[id]` para usuarios aprobados/autorizados.
- Crear reunión vacía o desde una plantilla existente del mismo org.
- Timeline por handle con sensores mouse/touch/teclado, flechas arriba/abajo, duración editable y cálculo inmediato. Claves `client_key` estables aunque cambien los UUIDs físicos del snapshot.
- Guardado optimista y rollback exacto del estado anterior, guardado manual de notas y mensajes de errores/conflictos. Las duraciones se guardan al salir del campo; notas/catálogos se guardan al pulsar Guardar.
- Guardar borrador y Publicar cambios (guardar+publicar en **una transacción**). Metadatos título/fecha/hora/tipo/serie también se versionan: guardar un borrador no cambia los metadatos publicados.
- Duplicar con seis grupos seleccionables. Confirmaciones de responsables y puestos copiados vuelven a `pending`, `responded_at=null`, IDs nuevos; historial del original intacto. Sin estructura se crea una reunión vacía. Notas incluye valores de campos personalizados y mensaje; recursos selecciona los vínculos de recursos normalizados.
- Responsables por persona/equipo/rol de catálogo, canciones ordenadas, anuncios, mensaje, recursos/enlaces HTTPS; datos normalizados, no nombres escritos en custom fields.
- Campos por instancia: texto/número/URL/fecha/selección/checkbox; validación Zod **y** SQL. Rechazo de claves que sustituyen columnas fundamentales.
- Paralelas con título/equipo/offset/duración/notas, validadas dentro del bloque; no desplazan el eje principal.
- Copia de plantillas no altera reuniones existentes; test del cambio de definición afectando solo instancias nuevas.
- Demo `/demo/editor` con banner inequívoco, datos ficticios, persistencia/publicación simuladas y casilla de fallo para probar rollback. No tiene acceso a datos reales y no cambia autorizaciones; Server Actions siguen autorizando por sesión/RLS.
- Gestión de tipos de bloque y plantillas en `/cronograma/catalogos`: creación, edición, eliminación y copia de la estructura de una reunión a una plantilla. Los cambios de definición solo se aplican automáticamente a instancias nuevas; actualizar un bloque ya existente requiere selección y confirmación explícitas. Versiones de tipo/plantilla con control de concurrencia.
- Subactividad paralela con responsable opcional de `people` y edición de campos personalizados. La migración versiona el responsable y el refresco explícito del esquema del tipo.
- CRUD de series, canciones, anuncios, mensajes y recursos externos HTTPS en `/cronograma/contenidos`. El editor selecciona esos registros normalizados.
- Subida de imágenes PNG/JPEG/WebP y PDF de hasta 5 MB al bucket **privado** `crono-resources`. El servidor valida MIME, tamaño y firma binaria; Storage exige RLS por organización/acción. La descarga usa `/recursos/[id]`, exige sesión autorizada y emite un enlace firmado de 60 segundos, sin URL pública persistente. Los archivos cargados se muestran de solo lectura en el catálogo por ahora para evitar objetos huérfanos.
- Cancelación explícita de reunión con confirmación, permiso `plan` y versión esperada. Conserva revisiones/confirmaciones históricas, bloquea nuevas ediciones y retira la reunión inmediatamente de la agenda pública.

## Contrato de datos

La cuarta migración `20261014042412_meeting_editor.sql` agrega `draft_revision_id`, snapshots de metadatos, claves client_key, roles/equipos de asignación y `block_assignment_links` (tabla 30, con RLS). La quinta agrega responsable de subactividad y actualización explícita de tipos; la sexta configura el bucket privado, sus políticas Storage y la restricción de ruta por organización en `resources`; la séptima agrega la cancelación transaccional/versionada.

Cada guardar crea una revisión nueva con lock de reunión y versión esperada. Publicados siguen inmutables; se revocaron escrituras directas de tablas del editor a `authenticated`. Las mutaciones pasan por RPCs autorizadas y atómicas. También se revocan cambios directos de asignaciones: no se puede transferir una confirmación a otra persona ni confirmar usando solo permiso assign. Confirmaciones usan su RPC estrecha; asignación/reemplazo de equipos sin permisos del editor requerirá sus RPCs del Sprint 3. No se borran versiones históricas automáticamente.

Al guardar dentro de la misma reunión, las asignaciones canónicas se **reutilizan**, no se clonan sus confirmaciones. Al duplicar entre reuniones se crean asignaciones nuevas en Pendiente. Quitar una asignación del plan publicado registra `removed_from_published_plan`, no borra su respuesta previa. Los futuros consumidores deben consultar los vínculos de la revisión activa, no deducir el plan vigente únicamente desde `assignments.block_id` (ancla histórica).

El editor de esta primera etapa exige grants de **organización** `plan`, `read_content`, `read_people`, `assign` o `administer`; el preset planificador ya los incluye. Un grant de equipo no se convierte automáticamente en acceso global. La edición parcial restringida a un equipo no está implementada todavía; queda pendiente, sin ampliar permisos para simularla.

Horarios cliente y PostgreSQL usan IANA; casos DST ambiguos/no existentes se resuelven al instante más tardío, como PostgreSQL. Al teclear un horario/zona inválidos, el preview muestra un marcador en vez de romper el render. Índices de relaciones por bloque y caché React por request reducen consultas redundantes sin caché compartida entre usuarios.

## Verificación

- **132 pruebas / 6 suites** aprobadas: Auth/dominio/PWA, editor/rollback/fechas, RLS y RPCs SQL ejecutados en PGlite.
- Cobertura de 7 módulos críticos: **97,57% líneas**, **88,65% ramas**, 93,87% funciones; umbral global 80%. No representa toda la UI ni los servicios externos.
- Lint sin errores/warnings, typecheck strict y build de producción aprobados.
- Audit de dependencias runtime: 0 vulnerabilidades; advisories dev de lint ya documentados en Sprints 0/1.
- HTTP local del build: `/demo/editor`, `/`, `/cronograma`, manifest respondieron 200. HTML de demo contiene banner y timeline. Esto **no** valida hidratación, drag ni layout visual.
- Playwright CLI: **28/28 casos desktop/mobile aprobados** con Google Chrome instalado, incluyendo teclado, recálculo, rollback, duplicación, overflow, axe, temas, PWA/offline y rutas protegidas. La suite base corre con backend desconectado; la demo de editor no depende de Supabase. No sustituye E2E autenticada de todos los flujos del editor.
- En la continuación: **140 pruebas / 6 suites** aprobadas, lint, typecheck y build de producción aprobados. `supabase db lint --local` no reportó problemas nuevos; conserva tres warnings preexistentes (una variable no usada y dos inicializaciones `text`→`jsonb` en funciones antiguas). En navegador Playwright integrado con Supabase local se comprobó crear tipo, plantilla y reunión desde plantilla, aplicar versión nueva a un bloque existente, guardar responsable/campos de paralela, crear contenidos y seleccionarlos tras recarga. La subida PNG al bucket privado funcionó y `/recursos/[id]` devolvió 307 hacia Storage firmado; una petición sin sesión redirigió a `/ingresar`. Un archivo HTML disfrazado de PNG fue rechazado. Cancelar una reunión publicada hizo pasar `/reuniones/[id]` de HTTP 200 a 404 y el listado a «Cancelada». Ninguna prueba usó datos personales reales ni Supabase remoto.

### Chrome y cobertura de navegador

El primer intento histórico terminó con `SIGABRT` antes de abrir la página. En esta continuación, Chrome instalado sí arrancó con `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Se corrigieron selectores de `role=alert` que también coincidían con el anunciante de Next.js y se esperó la transición de dnd-kit en la prueba de teclado. Se repitieron las dos suites: **10/10 editor** y **18/18 base** verdes.

Los reportes de este turno quedaron en `/tmp/chrono-sprint2-e2e-report-chrome3` y `/tmp/chrono-sprint2-foundation-report2`; no son artefactos versionados/portátiles. Falta ejecutar en CI y en dispositivos reales.

## Pendiente para cerrar Sprint 2

- La gestión de contenidos, tipos/plantillas y cancelación ya está implementada; los archivos privados aún no tienen reemplazo/eliminación transaccional.
- Selección explícita de varias instancias anteriores para actualizar desde una plantilla; hoy la aplicación explícita se hace bloque por bloque desde el tipo, sin propagación masiva.
- Permisos de edición parcial por equipo, preservando campos/relaciones que el usuario no pueda leer.
- E2E automatizada autenticada para los flujos nuevos (catálogos, plantillas, Storage y cancelación) en CI, además de pruebas reales de PWA/dispositivos. El navegador integrado ya validó esos flujos con Supabase local, pero las 28 E2E CLI cubren base y demo. No se aplicó ninguna migración remota.
- Continuar Sprints 3–5: confirmaciones UI, reemplazos/conflictos, cobertura/calendario/matriz, modo vivo/Realtime y feedback +10 min.

### Continuación del directorio (15/10/2026)

Se agregó alta, edición, desactivación y eliminación explícita (solo si no está en uso) de personas, equipos y roles, además de alta/baja de integrantes por equipo, desde `/personas`. Los formularios respetan grants globales o de equipo; cada Server Action vuelve a comprobar autorización y RLS sigue siendo la barrera final. No se agregaron columnas ni migraciones. Los nombres se validan y los UUID de equipos/personas no se aceptan sin formato válido. La eliminación requiere abrir una sección de confirmación; desactivar conserva las referencias históricas.

Lint, typecheck, 144 pruebas (7 suites) y build pasaron. Las pruebas SQL nuevas cubren admin, responsable acotado a Media, pendiente y aislamiento de organización. Las 28 E2E existentes en Chrome desktop/mobile pasaron, pero **no cubren aún el CRUD autenticado del directorio**. El commit `20a1d76` quedó en Preview Vercel `Ready` y Chrome mostró `/personas` con la sesión administradora y los formularios de alta, sin personas/equipos remotos. No se ejecutaron escrituras de prueba en la base remota. La organización remota sigue sin seed ni personas reales.

## Configuración

Se mantiene `SETUP.md`: proyecto remoto **independiente pendiente de confirmación**; aplicar las **siete** migraciones en orden, bootstrap de admin, variables, SMTP/templates/redirects y Vercel. El bucket se crea por migración; no hacerlo público. No se creó ni modificó otro Supabase remoto. Sin configuración, el espacio interno muestra aviso y la demo sigue separada.

Para probar solo la demo local, sin backend:

```sh
npm ci
npm run dev
# http://localhost:3000/demo/editor
```

En este host se usó `NEXT_BUILD_DIR=.next-sprint2-delivery` y puerto 3100 para preview de producción. Cambiar nombre de outputs cuando la limpieza de carpetas workspace esté restringida; coverage en `/tmp` funciona. No hubo push ni deploy.

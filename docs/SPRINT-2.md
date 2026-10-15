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

- La gestión de contenidos, tipos/plantillas y cancelación ya está implementada. Los archivos privados ahora tienen reemplazo/eliminación de recursos **sin vínculos**, con cambio de catálogo y cola de limpieza en una misma transacción; la eliminación física en Storage es posterior, idempotente y reintentable. No se permite reemplazar un recurso referenciado por una revisión para no modificar contenido histórico de forma implícita.
- La actualización selectiva de plantillas ya crea borradores para hasta 20 reuniones elegidas explícitamente en una transacción; queda pendiente validar UX en dispositivos físicos y decidir si hace falta un modo de fusión más fino por bloque.
- Edición parcial por equipo: la ruta estrecha de notas y campos personalizados preserva campos/relaciones no legibles. Ya permite agregar URL HTTPS y desvincular recursos en un borrador; aún faltan asignaciones y el flujo de archivos privados desde este acceso acotado.
- E2E autenticadas en CI, además de pruebas reales de PWA/dispositivos. Las 28 E2E CLI originales cubren base y demo; la nueva suite local autenticada cubre los flujos principales del editor/directorio, pero todavía no corre en CI ni en Preview remota.
- Continuar Sprints 3–5: confirmaciones UI, reemplazos/conflictos, cobertura/calendario/matriz, modo vivo/Realtime y feedback +10 min.

### Continuación del directorio (15/10/2026)

Se agregó alta, edición, desactivación y eliminación explícita (solo si no está en uso) de personas, equipos y roles, además de alta/baja de integrantes por equipo, desde `/personas`. Los formularios respetan grants globales o de equipo; cada Server Action vuelve a comprobar autorización y RLS sigue siendo la barrera final. No se agregaron columnas ni migraciones. Los nombres se validan y los UUID de equipos/personas no se aceptan sin formato válido. La eliminación requiere abrir una sección de confirmación; desactivar conserva las referencias históricas.

Lint, typecheck, 144 pruebas (7 suites) y build pasaron. Las pruebas SQL nuevas cubren admin, responsable acotado a Media, pendiente y aislamiento de organización. Las 28 E2E existentes en Chrome desktop/mobile pasaron. El commit `20a1d76` quedó en Preview Vercel `Ready` y Chrome mostró `/personas` con la sesión administradora y los formularios de alta, sin personas/equipos remotos. No se ejecutaron escrituras de prueba en la base remota. La organización remota sigue sin seed ni personas reales.

**E2E autenticadas locales posteriores:** `npm run test:e2e:auth:local` obtuvo las claves del stack Supabase local sin imprimirlas ni guardarlas en Git, creó/reutilizó una cuenta y organización ficticias aisladas y generó un password aleatorio por ejecución. En Chrome desktop y mobile pasaron **8/8** casos: CRUD de persona/equipo/rol/integrante, canción y catálogo, tipo versionado/plantilla, subida PNG privada con descarga autorizada y rechazo sin sesión, y reunión borrador cancelada. El teardown eliminó los datos de dominio y los objetos Storage del fixture: `people=teams=meetings=storage.objects=0` para la organización E2E. La cuenta y organización ficticias locales quedan para reutilización. La primera corrida 5/6 reveló un selector ambiguo (nombre también presente en `<option>`); se corrigió el test y se repitió completo 8/8. No se usaron contraseñas ni datos reales de la comunidad. La suite exige Supabase local/psql y no se ejecuta en CI actual.

### Actualización selectiva de plantillas (15/10/2026)

La novena migración agrega `apply_template_selected`: el usuario con los permisos completos del editor selecciona explícitamente 1–20 reuniones y confirma el reemplazo de estructura/contenido. Se validan versión de plantilla y versiones esperadas de todas las reuniones; la transacción entera falla ante un conflicto, cierre, proyecto ajeno o borrador ya abierto en una reunión publicada. La revisión publicada y su agenda pública permanecen intactas: la aplicación crea una revisión borrador que requiere publicación posterior separada. Los bloques con mismo nombre y tipo conservan responsables/asignaciones canónicas y confirmaciones; los nuevos quedan sin responsables para no copiar personas de otra reunión. Las asignaciones de bloques retirados siguen en el historial. La UI explica estas reglas antes de confirmar. El cotejo nombre+tipo no resuelve renombres como el mismo bloque: en ese caso el responsable debe revisarse manualmente en el nuevo borrador.

PGlite probó autorización, versión obsoleta, selección repetida, atomicidad ante borrador previo, preservación de confirmación y agenda pública. La migración se aplicó al Supabase local y al remoto independiente `ivmhgizuofxdvvvzdxnl`; el dry-run remoto listó únicamente esa migración. Lint SQL local conservó solo los tres warnings anteriores; advisor de seguridad local sin hallazgos. El advisor remoto no reportó errores, pero sí warnings: RPCs `SECURITY DEFINER` expuestas intencionalmente (la nueva incluida, con `auth.uid`/ACL interna y `EXECUTE` solo a authenticated), la proyección pública `public_agenda` y protección de contraseñas filtradas desactivada. Esa última configuración sigue pendiente antes de Production. `npm run check` pasó con **145 tests / 7 suites**. E2E autenticada local en Google Chrome desktop/mobile pasó **8/8**, incluido el formulario nuevo; el primer intento falló antes de abrir páginas por falta del Chromium descargado y se corrigió usando Chrome instalado. El runner local ahora lo detecta automáticamente en macOS. No se probó este flujo contra datos remotos reales ni dispositivos físicos.

### Ciclo de vida de archivos privados (15/10/2026)

La décima migración añade unicidad de `storage_path`, RPCs estrechas para reemplazar/eliminar solo recursos **no vinculados**, y una cola privada de limpieza. Una acción sube a una ruta UUID nueva e inmutable, valida MIME, tamaño y firma, y la RPC bloquea el recurso, vuelve a verificar permisos, ruta, existencia del objeto, valor anterior y ausencia de vínculos. El cambio de registro y el encolado de la ruta antigua se confirman juntos en PostgreSQL. Luego Storage elimina el objeto; si falla, la cola conserva la tarea y la UI ofrece reintento. No se promete atomicidad entre PostgreSQL y Storage, porque son servicios distintos. La nueva subida se compensa o se encola si falla la actualización de DB. La UI exige confirmación explícita para eliminar. Los archivos ligados a revisiones deben desvincularse en un borrador o permanecer históricos.

PGlite cubrió permisos, ruta de otra organización, reemplazo, cola/acuso y rechazo de recurso en uso. Supabase local y el remoto independiente aplicaron la décima migración; `db lint` local conservó solo los tres warnings previos, advisor local sin hallazgos. El advisor remoto reportó **0 errores y 22 warnings**: 20 RPCs `SECURITY DEFINER` para usuarios autenticados (cada una requiere revisión de guardas), `public_agenda` deliberadamente anónima y protección de contraseñas filtradas desactivada. Chrome E2E autenticado desktop/mobile: **8/8** tras corregir una carrera del test entre el redirect de reemplazo y el formulario de eliminación; incluyó subida, acceso autorizado, rechazo anónimo, reemplazo y eliminación. Al terminar, la org ficticia tenía `resource_file_cleanup=0` y `storage.objects=0`. `npm run check`: **146 tests / 7 suites**, lint/typecheck/build verdes. Falta repetir en Preview remota con datos ficticios y en dispositivos físicos; no se usaron recursos reales.

### Edición estrecha de notas por equipo (15/10/2026)

La undécima migración incorpora RPCs para listar equipos editables, leer solo bloques de un equipo y guardar **solo la nota** de un bloque. Requiere membresía aprobada y grants `plan` + `read_content` sobre el equipo; el editor global sigue cerrado a grants de equipo. La RPC bloquea la reunión y exige versión vigente, crea una revisión borrador y mantiene la publicada intacta. Internamente clona el snapshot completo para conservar notas, campos personalizados, responsables, recursos y vínculos de otros equipos, pero nunca los devuelve al cliente ni acepta cambios sobre ellos. `/cronograma/[id]/equipos/[teamId]` ofrece el formulario acotado; el cronograma enlaza esa ruta para usuarios sin permiso global. La edición parcial de campos personalizados/relaciones/asignaciones continúa pendiente: **no se presenta Sprint 2 como terminado**.

PGlite comprobó denegación sin permisos, aislamiento de otro equipo, prohibición del editor global, versionado optimista y preservación de otro bloque y sus canciones. La undécima migración se aplicó en Supabase local **y** en el remoto `ivmhgizuofxdvvvzdxnl`: lint local solo mostró los tres warnings anteriores y el advisor local no encontró problemas. El advisor remoto reportó **0 errores y 25 warnings** (23 RPCs `SECURITY DEFINER` autenticadas, `public_agenda` anónima y protección de contraseñas filtradas desactivada). Chrome E2E autenticado pasó **10/10** en desktop/mobile, incluido el nuevo flujo; el primer intento **8/10** encontró únicamente un selector ambiguo por el `role=status` de dnd-kit y se corrigió. `npm run check` pasó con **147 tests / 7 suites**. Falta verificar la nueva Preview contra el servicio remoto sin datos reales y completar los otros campos de edición parcial.

### Campos personalizados acotados por equipo (15/10/2026)

La duodécima migración amplía la proyección del equipo con **solo** los esquemas y valores personalizados de sus propios bloques y agrega una RPC separada para guardar esos valores. La definición del campo se toma del snapshot confiable en PostgreSQL, no del formulario; se validan tipo, enlace HTTPS, claves conocidas, tamaño, grants `plan` + `read_content` y versión esperada. La operación genera un nuevo borrador y conserva notas, vínculos, asignaciones y bloques ajenos, sin enviarlos al cliente. La UI no deja crear ni alterar definiciones desde el acceso acotado.

PGlite cubrió aislamiento, clave desconocida, URL insegura, versión obsoleta y preservación de la revisión publicada y valores ocultos. La migración se aplicó al Supabase local y al remoto independiente `ivmhgizuofxdvvvzdxnl` tras un dry-run que listó **solo** este archivo; el dry-run posterior quedó al día y el advisor remoto de seguridad no mostró errores. `npm run check` pasó con **147/147 pruebas en 7 suites**; Chrome E2E autenticado local pasó **10/10** desktop/mobile, incluida la edición de campos. `supabase db lint --local` conserva solo los tres warnings preexistentes. Falta cubrir edición acotada de vínculos/asignaciones, E2E autenticada en CI/Preview remota y dispositivos físicos. No se escribieron datos de prueba en Supabase remoto.

El commit `fa3ed0f` se subió a `codex/sprint-2-editor`. GitHub Actions `Verificación` [38755351498](https://github.com/damianjure/cronounidos/actions/runs/38755351498) terminó **success** con lint, typecheck, cobertura, audit runtime, build y E2E base. Vercel creó la Preview `dpl_6EUpYXiPyrqVws9UhvZYSC9brbMb`, estado **Ready**, sin promocionar a Production; el alias estable permanece protegido por autenticación Vercel. La suite E2E **autenticada** no había corrido aún en CI en ese commit; ver ejecución posterior en esta sección. Sigue sin correr contra remoto.

## Configuración

El estado operativo actualizado está en `SETUP.md`: proyecto Supabase remoto independiente confirmado, doce migraciones aplicadas sin seed, administrador inicial y Preview configurados. Falta QA remota integral y Production; el bucket permanece privado. No se creó ni modificó otro Supabase remoto.

Para probar solo la demo local, sin backend:

```sh
npm ci
npm run dev
# http://localhost:3000/demo/editor
```

En este host se usó `NEXT_BUILD_DIR=.next-sprint2-delivery` y puerto 3100 para preview de producción. Cambiar nombre de outputs cuando la limpieza de carpetas workspace esté restringida; coverage en `/tmp` funciona. No hubo push ni deploy.

### CI E2E autenticada (15/10/2026)

Se agregó un job independiente `authenticated-local` que inicia Supabase local efímero en GitHub Actions, instala Chromium y ejecuta la suite autenticada desktop/mobile con fixture ficticio. El comando de inicio no imprime las claves temporales del stack; el runner de la suite rechaza endpoints fuera de `127.0.0.1:54321/54322`. Se suben reportes solo ante fallo y se detiene el stack al terminar. La primera ejecución [38756088731](https://github.com/damianjure/cronounidos/actions/runs/38756088731) terminó **success** en ambos jobs (`foundation` y `authenticated-local`). No equivale a pruebas contra la Preview remota ni dispositivos físicos.

### Enlaces acotados por equipo (15/10/2026)

La decimotercera migración proyecta solo los recursos vinculados a los bloques del equipo autorizado y añade RPCs estrechas para crear un recurso de URL HTTPS y vincularlo al bloque, o desvincular un recurso de ese bloque. Exige membresía aprobada, grants `plan` + `read_content` de ese equipo, versión esperada y pertenencia del bloque; la nueva revisión queda en borrador sin cambiar la publicada. Desvincular no borra el registro del recurso ni el historial. El formulario no ofrece subir archivos: la política Storage actual requiere `plan` global, por lo que esa capacidad sigue pendiente para un editor acotado. Los archivos ya asociados se muestran por nombre, sin prometer descarga desde ese permiso.

PGlite verificó rechazo anónimo/sin grants/otra organización/otro bloque, URL insegura, recurso ajeno, versión obsoleta, aislamiento de recursos de otro equipo y persistencia de la publicada. `npm run check` pasó con 147 pruebas en 7 suites; Chrome E2E autenticado local pasó 10/10 desktop/mobile, incluida alta y desvinculación de un enlace. Lint SQL local conservó los tres warnings preexistentes; advisor de seguridad local y remoto sin errores. El dry-run remoto listó solo `20261015151719_team_scoped_resource_links.sql`; se aplicó al proyecto independiente `ivmhgizuofxdvvvzdxnl` y el dry-run posterior quedó al día. No se cargaron datos de prueba remotos. Falta CI de este commit, E2E de Preview remota y dispositivos físicos.

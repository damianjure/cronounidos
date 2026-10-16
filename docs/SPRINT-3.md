# Sprint 3 — Equipos y cobertura

## Estado vigente — 16/10/2026

**Cerrado funcionalmente.** Ver [cierre y evidencia vigente](SPRINT-3-CLOSURE.md): puestos por plantilla/reunión, reemplazos, conflictos con excepción y matriz/calendario completos. Las secciones siguientes conservan el historial de las entregas iniciales y sus pruebas. Sprints 4 y 5 no iniciados; Production y QA remota integral pendientes.

## Implementado

- `/confirmaciones`, accesible desde Inicio, barra lateral y Más. Lista reuniones con asignaciones vigentes que la sesión puede responder; muestra persona/equipo/rol/actividad y estado, sin notas ni contenidos privados.
- Confirmar, declarar No disponible o volver a Pendiente, por asignación o en un lote de hasta 100 roles visibles de **una persona en una reunión**.
- Los integrantes responden solo sus asignaciones mediante la vinculación confiable a `people`; gestores requieren `confirm` global o del equipo correspondiente. `assign` no concede confirmación. Los nombres ajenos requieren `read_people`; de lo contrario se usa una etiqueta neutra.
- Lotes transaccionales con lock de reunión y filas en orden UUID; cada elemento lleva estado e instante de respuesta esperado. Cualquier falta de permiso, asignación retirada/reemplazada o conflicto revierte el lote completo. Repetir el mismo estado vigente no agrega eventos innecesarios.
- El historial conserva creación, respuestas previas y rechazo. La vista proyecta solo evento/estado/fecha, no actor, notas ni payload privado.
- La revisión **publicada** es el plan operativo mientras existe un borrador de edición. Antes de la primera publicación, solo un planificador global autorizado puede gestionar respuestas del borrador inicial; integrantes esperan publicación. No se responde una reunión cancelada/finalizada ni una asignación ya retirada del plan operativo.
- La RPC individual anterior se conserva por compatibilidad y ahora delega en la misma operación estrecha, con los mismos controles de vigencia y permisos. La UI nueva envía precondiciones explícitas para detectar pestañas obsoletas.

## Migración

`20261016034630_sprint3_confirmations.sql`: helper privado de vigencia y RPCs de lectura/respuesta. Search path vacío, EXECUTE explícito solo a authenticated; no tablas nuevas ni grants amplios. Se conserva RLS existente y la autorización canónica de Sprint 2. No usa clave privilegiada en las acciones de confirmación.

## Verificación local

- `npm run check`: lint, typecheck, **163 pruebas / 9 suites** y build verdes.
- SQL/PGlite: **71 pruebas**; nuevas regresiones de alcance por equipo/organización, rechazo anónimo, lotes atómicos, identidad, payload inválido, doble respuesta idempotente, concurrencia, publicación/borrador y cancelación.
- Chrome desktop/mobile base: **30/30**.
- Chrome autenticado + Supabase local: **12/12**, incluyendo lote por persona, rechazo individual, historial, conflicto entre dos pestañas, axe WCAG A/AA/2.1 AA y ausencia de overflow en la nueva ruta.
- Cobertura de 9 módulos críticos configurados: **98,33% líneas, 91,22% ramas**; no representa toda la UI ni servicios remotos.
- Advisor de seguridad local sin errores; SQL lint conserva solo los tres warnings anteriores.
- La primera E2E nueva encontró un selector ambiguo del anunciador Next y una limitación de teardown con planes publicados, no un fallo de la transacción. Se corrigió el selector. La limpieza ahora rechaza cualquier destino no local y, **solo al terminar las aserciones**, usa `session_replication_role=replica` dentro de una transacción para borrar exclusivamente el fixture ficticio `crono-e2e`; no desactiva triggers/RLS durante las pruebas de negocio ni modifica el esquema de la app. No es un procedimiento de borrado de producción.

## Estado de servicios

La migración 17 se aplicó localmente y al proyecto independiente `ivmhgizuofxdvvvzdxnl`; el dry-run posterior quedó al día y el advisor remoto de seguridad no reportó errores. No se cargaron seeds ni fixtures en remoto. No hay variables nuevas para esta entrega: las confirmaciones usan el cliente de sesión, no la clave privilegiada. El commit de confirmaciones `f7b98f7` pasó ambos jobs de CI ([38847972871](https://github.com/damianjure/cronounidos/actions/runs/38847972871)) y su Preview quedó Ready. No equivale a probar escritura remota con todos los roles.

## Pendientes iniciales resueltos al cierre

Los cinco pendientes de esta entrega (puestos, reemplazo, conflictos, calendario/matriz y sesiones E2E separadas) están implementados y verificados; ver `SPRINT-3-CLOSURE.md`. QA remota integral, invitación aceptada y dispositivos físicos siguen documentados como tareas de entorno/producción, no como pruebas realizadas.

## Calendario inicial (continuación 16/10/2026)

`calendar_overview` proyecta exclusivamente metadatos operativos y conteos, nunca identidades/asignaciones individuales/notas. Requiere `read_agenda` global o `plan` global; un integrante sin esos permisos sigue pudiendo responder lo propio pero no consultar el calendario global. La cobertura agregada interna incluye todos los equipos para no presentar como verde una cobertura parcial; no otorga `read_people` ni `read_content`. Anon no tiene EXECUTE.

Se utiliza la revisión publicada si existe, incluso para planificadores con un borrador abierto. Solo un planificador ve el borrador inicial; sus metadatos se toman del snapshot, no de columnas base desactualizadas. La proyección de próximas tres reuniones usa el día actual en la zona de la organización. Los puestos son operativos por reunión, como en DATABASE.md; no se confunde número de responsables de bloque con número de puestos requeridos.

Mes con navegación, círculos tipo/cobertura, descripción textual accesible y próximas tres tarjetas con confirmados/pendientes/no disponibles/vacantes. Sin puestos requeridos = gris, opcionales excluidos; 90% con crítico sin confirmar sigue amarillo. En móvil se muestran indicadores con enlaces etiquetados y tarjetas legibles debajo; el grid tiene scroll contenido solo en pantallas demasiado estrechas. En desktop se muestran títulos. Los screenshots de Chrome se revisaron y se ajustó el encabezado móvil para evitar controles comprimidos. En esta entrega inicial todavía faltaban matriz y gestión de requisitos; ambas se completaron en el cierre.

La migración `20261016145232_sprint3_calendar_projection.sql` se probó en PGlite y Supabase local. SQL cubre privacidad/anon/pendiente/otra org, metadata publicada estable, exclusión de borradores y opcionales, gate crítico, rango inválido y cancelación. Chrome autenticado desktop/mobile también consulta mes, próximas tres, axe y overflow. Se mantienen pendientes dispositivos físicos y QA remota integral.

La migración 18 también se aplicó al remoto independiente `ivmhgizuofxdvvvzdxnl`, con dry-run limitado a ese archivo, comprobación posterior al día y advisor remoto sin errores. Sin seed ni fixtures remotos. Las pruebas siguen siendo locales/CI; no se declara QA remota integral ni Production.

Verificación del commit de calendario `b8361c7`: [CI 38920378779](https://github.com/damianjure/cronounidos/actions/runs/38920378779) terminó **success** en `foundation` y `authenticated-local`. La [Preview](https://crono-unidos-69yu2165b-damianjure-5692s-projects.vercel.app) quedó **Ready**. `vercel curl` confirmó que `/calendario` sin sesión de la app redirige a `/ingresar` (307). No se probaron escrituras con la cuenta real ni se habilitó Production.

# Sprint 3 — Equipos y cobertura

## Estado vigente — 16/10/2026

**En curso; no cerrado.** Primera entrega: confirmaciones individuales y masivas por persona, con historial y concurrencia. Sprints 4 y 5 aún no se iniciaron. No se habilitó Production.

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

- `npm run check`: lint, typecheck, **160 pruebas / 8 suites** y build verdes.
- SQL/PGlite: **70 pruebas**; nuevas regresiones de alcance por equipo/organización, rechazo anónimo, lotes atómicos, identidad, payload inválido, doble respuesta idempotente, concurrencia, publicación/borrador y cancelación.
- Chrome desktop/mobile base: **30/30**.
- Chrome autenticado + Supabase local: **12/12**, incluyendo lote por persona, rechazo individual, historial, conflicto entre dos pestañas, axe WCAG A/AA/2.1 AA y ausencia de overflow en la nueva ruta.
- Cobertura de 8 módulos críticos configurados: **98,22% líneas, 90,38% ramas**; no representa toda la UI ni servicios remotos.
- Advisor de seguridad local sin errores; SQL lint conserva solo los tres warnings anteriores.
- La primera E2E nueva encontró un selector ambiguo del anunciador Next y una limitación de teardown con planes publicados, no un fallo de la transacción. Se corrigió el selector. La limpieza ahora rechaza cualquier destino no local y, **solo al terminar las aserciones**, usa `session_replication_role=replica` dentro de una transacción para borrar exclusivamente el fixture ficticio `crono-e2e`; no desactiva triggers/RLS durante las pruebas de negocio ni modifica el esquema de la app. No es un procedimiento de borrado de producción.

## Estado de servicios

La migración 17 se aplicó localmente y al proyecto independiente `ivmhgizuofxdvvvzdxnl`; el dry-run posterior quedó al día y el advisor remoto de seguridad no reportó errores. No se cargaron seeds ni fixtures en remoto. No hay variables nuevas para esta entrega: las confirmaciones usan el cliente de sesión, no la clave privilegiada. CI y Preview se verificarán sobre el commit de esta entrega; no equivalen a probar escritura remota con todos los roles.

## Pendiente de Sprint 3

1. Gestión de puestos critical/required/optional por plantilla y reunión, incluida cantidad/vacantes.
2. Reemplazo explícito con trazabilidad, sin transferir una confirmación ni modificar silenciosamente el plan publicado.
3. Solapamientos de asignaciones principales/paralelas y excepción con motivo autorizado.
4. Proyección de cobertura con gate de críticos, calendario mensual tipo+estado, próximas tres reuniones y matriz desktop/tarjetas móviles.
5. E2E de integrante y responsable con sesiones distintas en navegador; SQL ya cubre sus permisos. QA remota integral y dispositivos físicos siguen pendientes.

El rechazo ya se conserva; **no hay reemplazo automático**. Las confirmaciones no completan por sí solas el Sprint 3. Continuar según `ROADMAP.md` antes de pasar al modo en vivo del Sprint 4.

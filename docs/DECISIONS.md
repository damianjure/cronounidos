# Decisiones aprobadas — Crono Unidos

Las siguientes decisiones son requisitos cerrados (17 preguntas):
1. Campos personalizados por instancia **y** por tipo de bloque reutilizable.
2. Administrador, planificador y responsable autorizado pueden gestionar confirmaciones; integrante confirma/rechaza sus propias asignaciones.
3. Reunión publicada: editar como borrador sin afectar lo visible, o publicar cambios inmediatamente.
4. Permisos granulares configurables por equipo y acción.
5. Roles/puestos por plantilla editables por reunión: críticos, obligatorios y opcionales.
6. Invitado: solo horarios, nombres de actividades y duración.
7. Página pública de reuniones publicadas y enlace individual por reunión.
8. Lectura interna de equipos, canciones, recursos y notas definida por permisos.
9. Duplicación con casillas para elegir estructura, responsables, canciones, anuncios, notas y recursos.
10. Confirmaciones duplicadas vuelven SIEMPRE a pendiente.
11. Edición de plantilla: solo futuro por defecto, actualización selectiva de existentes con confirmación.
12. Persona con varios roles confirma todos de una vez o roles individualmente.
13. Solapamientos: advertir, ofrecer corrección/reemplazo o excepción justificada.
14. Rechazo: mantener historial y dejar posición sin cubrir hasta reemplazo.
15. Alta de usuarios por administrador, invitación email o autorregistro sujeto a aprobación.
16. Timeline principal con actividades secundarias simultáneas dentro de bloques.
17. Modo reunión EN VIVO completo en el MVP: cronómetro, horas reales, ETA, desvíos, actividad actual y próxima.

Otros requisitos aprobados:
- PWA desde el inicio, light/dark/system, desktop detallado y con switch Desktop/Mobile; móvil y PWA móvil usan siempre layout Mobile.
- Calendario: mes arriba, tres próximas reuniones debajo. Indicador circular con dos semicírculos: tipo de reunión (ej. domingo azul, sábado violeta, oración verde) + cobertura.
- Cobertura: rojo <60%, amarillo 60–89%, verde >=90% excepto si falta cualquier rol crítico. Iniciales: operador de streaming, operador de multimedia, predicador; roles configurables.
- Matriz de roles/reuniones en escritorio y tarjetas móviles.
- Feedback privado: 10 min tras cierre REAL de la reunión, solicitar breve todo bien/problema/pendiente/sugerencia a responsables e involucrados; solo admin puede leer respuestas.
- WhatsApp y sincronización ProPresenter son fases posteriores. Google OAuth también.
- Stack: Next.js/TypeScript/Tailwind/shadcn/dnd-kit/Supabase/Vercel. Codex implementa código y migraciones, controladas en GitHub.

## Implementación Sprint 3 — 16/10/2026 (sin ampliar alcance)
- Los puestos por reunión son operativos, no un snapshot de actividades: cambios de prioridad/asignación actualizan cobertura inmediatamente y se advierte en UI. La plantilla guarda requisitos y cantidades, nunca confirmaciones; editarla no modifica instancias previas. La aplicación selectiva existente de bloques sigue afectando solo bloques.
- Reemplazar un puesto crea una asignación nueva pendiente, conserva estado/fecha de la anterior y enlaza su sucesora. FK/constraint trigger diferidos permiten hacerlo atómicamente sin fabricar un rechazo para liberar el índice único; se rechazan ciclos, cruces de organización/reunión/posición y precondiciones obsoletas.
- Reemplazar un responsable de actividad modifica únicamente el borrador. Una propuesta privada enlaza anterior/sucesora y se activa al publicar, nunca antes. Varias propuestas previas a publicación enlazan al resultado final sin heredar confirmación. Las notas permanecen en servidor y no se incluyen en las proyecciones de puestos.
- Conflictos: intervalos semiabiertos `[inicio,fin)` calculados desde fecha/zona y duración del cronograma; un puesto ocupa la duración total de la reunión, un responsable su bloque y una paralela su offset/duración. Duración cero no ocupa tiempo. El análisis compara el borrador objetivo con publicados de otras reuniones; otros borradores iniciales son visibles solo al planificador global. No bloquea guardados: advierte y ofrece corrección/reemplazo/excepción.
- Las excepciones principales/paralelas se guardan en esquema privado con identidad y tiempos en su huella. Reprogramar o reemplazar invalida la coincidencia anterior. Exigir asignación + lectura de personas en ambos equipos; si falta alcance ajeno, mostrar solo advertencia genérica, no notas/títulos/motivo privado.
- Calendario/matriz son proyecciones agregadas globales sin personas; los responsables de equipo gestionan desde Confirmaciones los puestos autorizados. No se cambian permisos públicos ni se usan claves privilegiadas para estas operaciones.
- Regresión revisada al cierre: un snapshot histórico no puede volver a enlazar una asignación ya reemplazada para recuperar su confirmación. Un trigger valida vínculos nuevos/actualizados; los vínculos de publicaciones históricas permanecen intactos. Para volver a asignar la misma persona se crea una asignación nueva pendiente.

## Implementación Sprint 4 — operación en vivo
- Operar el cronograma principal completo requiere `operate_live` global; un grant de equipo no se convierte en global. Lectura interna con agenda/planificación/operación global, sin notas ni personas en el snapshot de ejecución.
- Iniciar congela la revisión publicada y comienza su primera actividad. Avanzar finaliza la actividad actual e inicia la siguiente en un único instante de servidor; también se puede finalizar la actual y dejar una espera antes de iniciar la siguiente. La última actividad no cierra automáticamente la reunión: cierre explícito, irreversible, con confirmación. Si se cierra antes, las pendientes quedan como no ejecutadas, no falsamente finalizadas.
- Locks de reunión, versión esperada y UUID de operación idempotente evitan doble avance por reintentos y operadores simultáneos. Se puede seguir editando un borrador, pero no publicar ni cancelar una reunión iniciada; publicado y ejecución permanecen vinculados a la revisión congelada.
- Instantes reales del servidor, reloj de UI monotónico recalibrado al consultar, ETA basada en duración restante (sin asumir que una actividad vencida terminó). Realtime notifica versión mínima bajo RLS; se vuelve a consultar el snapshot autorizado. Polling y reconciliación al reconectar como respaldo; nunca se encolan transiciones offline.

## Primer componente Sprint 5 — destinatarios congelados
- Capturar en esquema privado participantes del plan publicado al iniciar/cerrar, responsables autorizados de los equipos involucrados y operadores de cada transición. No incluir personas agregadas solamente a borradores. Capturar reemplazos operativos durante la reunión y conservar las personas anteriores.
- Deduplicar por reunión/persona y reunión/usuario, aun con varios roles; completar una cuenta originalmente ausente sin transferir silenciosamente una identidad ya capturada. Esta captura no crea solicitudes ni avisos antes de +10 min; scheduler, respuestas y notificaciones siguen pendientes en `SPRINT-5.md`.

## Feedback: identidad congelada y despacho privado (Sprint 5)

- Las solicitudes/respuestas viven en `private`, sin grants de tabla a clientes. La lectura personal es un DTO allowlist de estado; la categoría y el comentario solo salen por un RPC con autorización administrativa de organización. RLS de respuestas mantiene esa restricción incluso ante un futuro grant de lectura.
- Se crea una solicitud por participante capturado, con unicidad adicional reunión/usuario. Una identidad sin cuenta solo puede vincularse posteriormente mediante el vínculo persona/usuario administrado y membresía aprobada; una identidad ya vinculada nunca se transfiere automáticamente.
- El despacho es una transacción privada con exclusión mutua y restricciones únicas; usa el reloj del servidor y `closed_at + 10 minutos`. No acepta un reloj ni destinatario del navegador. Supabase Cron lo ejecuta cada minuto: nunca antes de los diez minutos, con hasta un minuto de latencia normal de sondeo.
- El envío de respuesta es inmutable. Un reintento con idéntico contenido es idempotente; otro contenido se rechaza. Máximo 500 caracteres de comentario, categorías cerradas. Los avisos no incluyen texto ni categoría de feedback.
- La migración del scheduler da NOTICE si `pg_cron` no existe (por ejemplo PGlite); esto NO equivale a scheduler operativo. Cada entorno real requiere verificar job activo e historial de ejecución. No se declara entrega de correo: proveedor/outbox siguen pendientes.

## Correo de feedback: worker Next.js, outbox y cambio de entorno

Se conserva el backend Next.js/Supabase aprobado: un worker POST de servidor usa una capacidad de máquina acotada para reclamar/finalizar filas privadas; Supabase Cron + pg_net lo despierta con un secreto independiente de Vault. No se agrega FastAPI, Edge Function ni Vercel Cron de minuto sujeto al plan. Brevo recibe texto genérico, sin contenido de feedback. Canal deshabilitado por defecto y separado del SMTP de Auth.

La idempotencia externa tiene TTL, no duración infinita: payload/key congelados, leases y reintentos auditados dentro de diez minutos; luego revisión sin reenvío automático. El cambio Preview→Production reveló un caso importante: congelar remitente/origen por sí solo permitiría enviar un retry antiguo con el remitente temporal. Se bloquea ese payload ante configuración distinta y queda `configuration_changed` para revisión, sin mutarlo ni enviarlo desde Production. Ver `EMAIL.md` para configuración y límites verificados.

## Correo: bloqueo de IP de Brevo — 17/10/2026
- Se desactiva el bloqueo de IP para API de Brevo (ajuste de cuenta) porque Vercel no tiene egress fijo. Se descartan IPs puntuales (inestables) e IPs estáticas pagas de Vercel. Riesgo y mitigaciones en `EMAIL.md`.

## Seguridad web: Content-Security-Policy — 17/10/2026
- Se agrega CSP en `next.config.ts` como **`Content-Security-Policy-Report-Only`**: no bloquea nada; las violaciones aparecen en la consola del navegador. Orígenes: `'self'` y el origen de `NEXT_PUBLIC_SUPABASE_URL` (HTTPS y WSS para Realtime). `frame-ancestors 'none'`, `object-src 'none'`.
- `'unsafe-inline'` en scripts/estilos es necesario hoy para Next.js sin nonces; endurecer con nonces es mejora posterior.
- Gate de Production: recorrer Preview (login, editor, subida, en vivo, feedback, PWA) sin violaciones y cambiar el header a `Content-Security-Policy`.
- **Actualización 17/10/2026:** recorrido hecho y header cambiado a `Content-Security-Policy`. La única violación propia era la prueba `new Function` de zod v4 (no rompe nada porque zod usa otro camino), y se evita con `z.config({ jitless: true })` en `providers.tsx`. El toolbar de Vercel (`vercel.live`) se permite en `script-src`/`frame-src` solo con `VERCEL_ENV=preview`; en cualquier otro entorno `frame-src 'none'`.

## Altas de usuarios: limpieza ante fallo — 17/10/2026
- Si `register_invited_member` falla después de crear/invitar la cuenta en Auth, `provisionUser` elimina esa cuenta con el cliente privilegiado de servidor (`error=membresia`, se puede reintentar con el mismo correo). Si el borrado también falla, `error=membresia-huerfana` pide eliminarla desde Supabase Auth. Una invitación ya enviada queda con enlace inválido.

## Validación de acciones de administración — 17/10/2026
- `approveMember`, `linkPerson`, `suspendMember`, `grantPermission` y `revokePermission` validan con zod (`src/lib/auth-validation.ts`): UUIDs, rol (`admin/planner/leader/member`) y permiso (enum `permission_action`) antes de consultar la base; entrada inválida → `error=datos`. La autorización real sigue en RPC/RLS. Si se agrega un valor al enum SQL, actualizar `permissionActions`. Tests: `tests/admin-input.test.ts`.

## Editor: movimientos durante un guardado — 17/10/2026
- Antes, un arrastre/teclado/botón de mover mientras había un guardado en curso se ignoraba en silencio. Ahora se **encola**: se muestra de inmediato (optimista) con el aviso "Movimiento en cola" y, al terminar el guardado, los movimientos encolados se aplican en orden sobre el snapshot persistido (versión nueva, nunca la vieja) y se guardan en una sola operación. Se identifican por `clientKey`, que es estable entre guardados.
- Si el guardado en curso falla, el rollback también descarta los movimientos encolados y se informa. Solo los movimientos se encolan; guardar/publicar manual mientras hay un guardado en curso sigue sin duplicarse.

## Infraestructura y resiliencia tras pruebas de estrés — 17/10/2026
- **Región de funciones:** `vercel.json` fija `"regions": ["gru1"]` (São Paulo), igual que Supabase. Antes las funciones corrían en `iad1` (Washington) y cada página cruzaba varias veces entre continentes. Se aplica en el próximo deploy.
- **Modo en vivo, lecturas directas a Supabase:** la consola lee `get_live_snapshot` desde el navegador (RPC con RLS) en vez de la server action `readLive`, para no concentrar el tráfico de muchos dispositivos detrás de una IP compartida en funciones de Vercel (riesgo de mitigación automática). Las operaciones (`operateLive`) siguen siendo server actions con requestId y versión. El polling es de 10 s sin Realtime y de 45 s con Realtime sano; el refetch disparado por Realtime tiene un jitter de 0–2,5 s. Un error de transporte de supabase-js (sin `code`) se trata como corte de red: bloquea los controles y conserva la última lectura. La E2E de respuesta tardía ahora intercepta `**/rest/v1/rpc/get_live_snapshot`.
- **Doble envío:** los formularios con server actions usan `SubmitButton` (`useFormStatus`). Mientras se envía, todos sus botones quedan deshabilitados y el que se tocó muestra "Guardando…", para evitar errores de "conflicto" por doble toque.

## Corrección de compensación de cuentas — 17/10/2026

Reemplaza la decisión anterior de borrar Auth si falla la membresía. `inviteUserByEmail` puede devolver una cuenta pendiente preexistente, y un error de transporte del RPC no demuestra rollback. **No se borra Auth automáticamente ni en invitación ni en alta directa.** Ante error devuelto o lanzado se conserva identidad y cualquier membresía posiblemente confirmada; la UI exige revisión administrativa en Supabase. No se aconseja borrar cuentas ni se oculta el fallo como éxito. La revisión consiste en comprobar, en el proyecto correcto, la cuenta por correo y su fila de membresía: si existe, no repetir cambios destructivos; si falta, un administrador confiable debe reconciliar únicamente la membresía de esa organización. No se reenvían invitaciones ni se aprueba acceso automáticamente.

## Herramientas de estrés — propiedad y resultados

El setup crea PGDATA con `mkdtemp`, rechaza `PGDATA_DIR` heredado y limpia solo el directorio de su ejecución, después de detener su servidor. Las ráfagas exigen el número exacto de éxitos y solo admiten conflictos explícitamente previstos. Despacho exige destinatarios positivos y conteos exactos de solicitudes/usuarios/notificaciones; un error de preparación o una aserción fallida produce salida no cero. Estrés SQL secuencial no sustituye E2E de la cola del editor.

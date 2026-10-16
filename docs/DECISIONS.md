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

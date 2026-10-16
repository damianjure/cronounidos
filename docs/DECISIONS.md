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

# Decisiones aprobadas — Chrono Unidos

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

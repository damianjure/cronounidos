# Guía obligatoria para Codex — cronounidos

Leé este archivo y toda la carpeta `docs/` ANTES de empezar; el estado vigente está en `docs/STATUS.md` y debe actualizarse con cada cambio de estado. El alcance del MVP está aprobado en `docs/PRD.md` y las decisiones en `docs/DECISIONS.md`. Seguí `docs/ROADMAP.md` con commits pequeños, tests y verificación.

## Arquitectura y UX
- Next.js App Router + TypeScript strict + Tailwind + shadcn/ui + dnd-kit + Supabase + Vercel; sin FastAPI para MVP.
- PWA desde el día uno, interfaz mobile-first; escritorio de mayor densidad; selector Desktop/Mobile SOLO desde navegador de escritorio; temas claro, oscuro y sistema.
- Timeline editable con drag táctil por handle, alternativa accesible mediante botones/teclado, cálculo inmediato de horas y rollback cuando falle la persistencia.
- Datos normalizados: personas, equipos, roles, asignaciones, canciones, anuncios y mensajes son entidades; custom fields no reemplazan columnas fundamentales.
- Reunión publicada y borrador de edición deben permanecer separados. Ninguna API pública debe filtrar notas, datos privados o borradores.
- Los cambios en plantillas afectan solo nuevas instancias por defecto; la actualización de anteriores requiere selección explícita.
- Cronograma principal lineal con subactividades paralelas; detección de asignaciones simultáneas y excepción con motivo.
- Roles critical/required/optional; cobertura = posiciones requeridas confirmadas / posiciones requeridas. Rojo <60%, amarillo 60–89%, verde >=90% SOLO si todos los roles críticos están confirmados; sin posiciones => gris.
- Confirmaciones: pendiente/confirmado/no_disponible; manuales, individuales o masivas por persona; al duplicar se reinician a pendiente; conservar rechazo y reemplazo en historial.
- En vivo: transiciones autorizadas, cronómetros basados en instantes reales, hora planificada vs real, adelanto/demora, ETA estimada, Realtime y cierre explícito.
- A los 10 minutos del cierre efectivo: crear solicitudes de feedback idempotentes y notificaciones internas; email cuando exista proveedor configurado. Texto privado SOLO legible por administradores.

## Seguridad
- Supabase Auth con aprobación de usuarios nuevos, autorización granular por equipo/acción y Row Level Security en todas las tablas expuestas.
- Separar acceso `anon` público del usuario autenticado; el invitado solo ve actividades, horario y duración de reuniones publicadas.
- Prohibido exponer `service_role`, secretos o tokens en cliente, GitHub o `NEXT_PUBLIC_*`; usar variables seguras del servidor.
- Crear migraciones reproducibles en `supabase/migrations/` y pruebas RLS; no modificar los Supabase de caja-chica ni docu-media-us.
- No copiar datos reales de personas, teléfonos, notas o feedback en semillas; usar datos ficticios.

## Criterios de entrega
Lint, typecheck, tests y build funcionando; tests de cobertura/críticos, permisos/RLS, versiones publicadas, drag&drop, confirmaciones y modo vivo; pruebas E2E mobile/desktop y PWA. Documentar cualquier limitación con precisión. No implementar WhatsApp, Google OAuth ni ProPresenter en el MVP sin aprobación nueva.

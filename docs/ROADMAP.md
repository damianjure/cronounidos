# Roadmap de desarrollo para Codex

Cada sprint termina con código ejecutable, commits, migraciones reproducibles y pruebas.

## Sprint 0 — Proyecto base (cerrado)
Next.js App Router TS strict; Tailwind/shadcn, dnd-kit; estructura limpia; tema light/dark/system; navegación Mobile + Desktop, selector de previsualización solo desktop; PWA manifest, íconos y caché prudente; .env.example y README.

## Sprint 1 — Datos y autorización (cerrado)
Migrations Supabase: org/personas/usuarios/equipos/roles/permisos; reuniones y versiones; bloques, contenidos y asignaciones. Auth email con aprobación y altas/invitaciones. RLS por administrador, planificador, responsable, integrante e invitado; seeds ficticios y tests de aislamiento.

## Sprint 2 — Editor (cerrado funcionalmente; ver `SPRINT-2-CLOSURE.md`)
Crear/editar/publicar/duplicar reuniones con selección de datos y confirmaciones reseteadas; editor timeline drag táctil/mouse/teclado y recálculo; bloques configurables por instancia/plantilla con notas/URLs; A&A con músicos y canciones, mensajes, anuncios, recursos, subactividades paralelas.

## Sprint 3 — Equipos y cobertura (en curso; ver `SPRINT-3.md`)
Confirmaciones manuales individuales/masivas, rechazo y reemplazo con historial; conflictos con excepción; calendario mensual con indicador tipo+estado, roles críticos, próximas 3 reuniones; matriz de cobertura de equipos y roles.

## Sprint 4 — Publicación y Modo en vivo
Mantener borrador y publicado separados; vista pública mínima. Operación con cronómetro, hora real vs prevista, ETA, estado en vivo y próximo bloque; sincronización y tolerancia a reconexiones.

## Sprint 5 — Feedback y salida a producción
Cierre de reunión, generación idempotente de feedback a +10 min, avisos in-app y email cuando esté configurado; formulario breve y panel estrictamente admin. Pruebas RLS, mobile/desktop, performance y accesibilidad. Integrar Vercel y entorno de producción.

## Definition of Done
Lint + typecheck + tests + build; migraciones versionadas y pruebas RLS; pruebas funcionales con demo; sin secretos o datos reales en código. Documentar cualquier decisión nueva antes de cambiar el alcance.

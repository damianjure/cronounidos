# cronounidos — Chrono Unidos

PWA mobile-first para planificar, coordinar y operar reuniones de **Unidos para Servir**.

**Estado:** documentación funcional v2.0 aprobada; MVP pendiente de desarrollo en Codex.

## Stack
Next.js App Router, TypeScript strict, Tailwind CSS, shadcn/ui, dnd-kit, Supabase (PostgreSQL/Auth/Realtime/Storage), Vercel y PWA instalable.

## Primeros pasos en Codex
1. Abrí este repositorio y leé `AGENTS.md` y todos los documentos en `docs/`.
2. Seguí el orden de `docs/ROADMAP.md`; creá migraciones SQL versionadas en `supabase/migrations/`.
3. Utilizá **un proyecto Supabase nuevo llamado cronounidos**, nunca otros proyectos.
4. No subas secretos; usá `.env.example` para documentar variables de entorno.
5. Ejecutá lint, typecheck, pruebas y build antes de informar un sprint completo.

**UX:** español rioplatense; zona horaria America/Argentina/Buenos_Aires; edición mobile-first y desktop de alta densidad. Invitados sin login ven únicamente horas, actividades y duraciones de reuniones publicadas.

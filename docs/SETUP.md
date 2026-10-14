# Preparación de servicios y Codex

## GitHub
Repositorio oficial: https://github.com/damianjure/cronounidos . **Recomendación: mantenerlo privado**; si está público cambiar visibilidad desde Settings. Codex debe leer `AGENTS.md` y todo `docs/`.

## Supabase
Crear un proyecto independiente `cronounidos` en la organización elegida por el usuario. No reutilizar cajachica ni docu-media-us. Configurar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en entorno de desarrollo y Vercel. Nunca exponer service role/secret keys en variables NEXT_PUBLIC ni commits. Codex crea migraciones versionadas; confirmar project ref antes de aplicar a remoto.

## Vercel
La conexión a Vercel está disponible; vincular proyecto a GitHub cuando Codex produzca app ejecutable. Configurar variables seguras y previews; después un dominio propio (posible app.unidosparaservir.org). El envío de email transaccional de feedback requiere proveedor aparte; la app puede usar notificaciones internas mientras tanto.

## Prompt para Codex
«Leé AGENTS.md y todos los archivos docs/. Implementá los Sprints 0 y 1 según ROADMAP.md. Creá una PWA Next.js/TypeScript mobile-first, un diseño desktop, migraciones Supabase seguras con RLS y datos ficticios. No modifiques otros proyectos. Ejecutá lint/typecheck/tests/build, realizá commits claros y documentá qué variables o configuración faltan antes del despliegue.»

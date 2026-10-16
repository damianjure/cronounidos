# Crono Unidos

PWA en español para planificar y coordinar las reuniones de Unidos para Servir.

**Estado:** Sprints 0–2 cerrados funcionalmente ([cierre del editor](docs/SPRINT-2-CLOSURE.md)). Sprint 3 en curso con confirmaciones individuales/masivas e historial ([avance](docs/SPRINT-3.md)). El MVP completo y Production siguen pendientes: Sprints 3–5 cubren confirmaciones, cobertura/calendario/matriz, modo vivo y feedback. La Preview continúa protegida; ver [setup](docs/SETUP.md) y limitaciones del cierre.

## Ejecutar

Requiere Node.js 24 LTS y npm. Las versiones de paquetes están fijadas y el lockfile está incluido.

```sh
npm ci
npm run dev
```

Abrí http://localhost:3000. Para probar el editor sin backend, usá http://localhost:3000/demo/editor (datos ficticios, sin guardar datos reales). Sin variables de Supabase se muestra explícitamente el estado **sin configurar**, no datos de demostración disfrazados de producción.

Para conectar datos, copiá `.env.example` a `.env.local` y completá las variables con un **nuevo proyecto independiente cronounidos**. Seguí [docs/SETUP.md](docs/SETUP.md) antes de aplicar migraciones o habilitar cuentas. No reutilizar Supabase de caja-chica ni docu-media-us.

## Verificación

```sh
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
# Con Supabase local/Colima activo: también ejecuta flujos autenticados y Storage
npm run test:e2e:auth:local
```

Las E2E usan el build de producción sin backend configurado. La suite SQL/RLS usa PostgreSQL embebido (PGlite), con `auth.uid()` simulado, y no requiere Docker. Además se probaron Auth y PostgREST contra Supabase local con Colima y cuentas ficticias. Chrome instalado ya ejecuta las E2E locales y en CI; las limitaciones actuales están en [el cierre de Sprint 2](docs/SPRINT-2-CLOSURE.md).

## Organización

- `src/app/`: App Router, agenda pública, Auth email, rutas protegidas y administración.
- `src/components/`: navegación responsive, temas y componentes UI estilo shadcn (Slot/CVA).
- `src/lib/`: dominio y clientes Supabase separados (público, sesión, servidor privilegiado).
- `supabase/migrations/`: esquema, RLS, constraints, RPCs y snapshots reproducibles.
- `supabase/seed.sql`: solo identidades ficticias de dominio, **sin usuarios Auth**.
- `tests/`: dominio, Auth mockeado, SQL/RLS ejecutado y PWA; Playwright desktop/mobile.
- `.github/workflows/ci.yml`: lint, typecheck, tests/cobertura, build y E2E base/autenticadas en CI.

## Reglas del producto

La documentación aprobada en `docs/PRD.md`, `docs/DECISIONS.md` y `AGENTS.md` mantiene la autoridad. La agenda pública expone únicamente actividades, horarios y duración de la revisión publicada. Registrar/verificar un correo no concede membresía ni permisos. No cacheamos documentos de usuarios autenticados.

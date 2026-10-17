# Pruebas de estrés de base de datos

Postgres real embebido (no PGlite) con las mismas migraciones, roles `anon`/`authenticated` y RLS. Mide lecturas masivas, escrituras simultáneas, confirmaciones, modo en vivo, cortes de conexión y despacho de feedback. **Nunca** apunta a Supabase remoto.

```sh
npm i --no-save embedded-postgres@17.10.0-beta.17 pg
node scripts/stress/setup.mjs &          # levanta Postgres en 127.0.0.1:55432 y aplica migraciones + seed
USERS=200 node scripts/stress/run.mjs    # USERS=1000 para escalar
node scripts/stress/probe.mjs            # (tras run/seed) latencia aislada por cantidad de puestos
kill %1
```

Resultados de referencia en `docs/REVIEW-2026-10-17.md`.

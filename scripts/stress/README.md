# Pruebas de estrés de base de datos

Postgres real embebido (no PGlite) con las mismas migraciones, roles `anon`/`authenticated` y RLS. Mide lecturas masivas, escrituras simultáneas, confirmaciones, modo en vivo, cortes de conexión y despacho de feedback. **Nunca** apunta a Supabase remoto.

```sh
npm i --no-save --package-lock=false embedded-postgres@17.10.0-beta.17 pg@8.16.3
node scripts/stress/setup.mjs &          # levanta Postgres en 127.0.0.1:55432 y aplica migraciones + seed
USERS=200 node scripts/stress/run.mjs    # USERS=1000 para escalar
node scripts/stress/probe.mjs            # (tras run/seed) latencia aislada por cantidad de puestos
kill %1
```

Resultados de referencia en `docs/REVIEW-2026-10-17.md`.

El setup crea un PGDATA temporal exclusivo; **rechaza `PGDATA_DIR`** y no borra carpetas previas. `SIGTERM`/`SIGINT` detienen su instancia antes de limpiar. El puerto 55432 debe estar libre; no detener otro servidor para liberarlo automáticamente. Repetir una carga requiere una instancia nueva (los fixtures no son idempotentes).

Las ráfagas y escenarios tienen aserciones: errores inesperados, conteos incompletos, cero destinatarios o duplicados provocan exit code no cero. Los conflictos de S2/S3b/S4b son esperados y se verifican por cantidad y mensaje exactos. S2c mide guardados SQL secuenciales, **no** la cola de movimientos del navegador. Regresiones sin binarios opcionales: `npx vitest run tests/stress-harness.test.mjs`. No se instala este arnés en runtime ni se cambian dependencias de la aplicación.

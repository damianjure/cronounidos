# Entrega Sprints 0 y 1 — 14 de octubre de 2026

## Alcance y estado

Se leyó `AGENTS.md` y toda la documentación aprobada antes de implementar. El repositorio original contenía solo documentación. Trabajo en `codex/sprints-0-1`; cambios locales, sin push ni despliegue remoto.

**Implementación de Sprints 0/1 disponible; validación completa pendiente por E2E y servicios externos. No se declara terminado el MVP de seis sprints.** Las páginas de editor/calendario indican su sprint pendiente en lugar de presentar botones o datos ficticios como funcionalidades terminadas.

### Sprint 0

- Next.js 16 App Router, TypeScript strict, Tailwind 4, primitives shadcn/Slot/CVA y dependencias dnd-kit para el futuro editor.
- Navegación Mobile (Inicio/Cronograma/Calendario/Más), barra lateral Desktop y preview Desktop/Mobile solo cuando hay viewport desktop + mouse/hover y no standalone.
- Interfaz es-AR, tema claro/oscuro/sistema persistente, targets mínimos 44px, enlaces para saltar al contenido y foco visible; CSS tablet y reduced-motion.
- Manifest, PNGs reales 192/512/maskable y apple-touch, service worker. Caché allowlist limitada a offline.html e íconos, nunca APIs/documentos de usuario/RSC. Navegación offline usa fallback público, no datos privados; logout purga cachés.
- Variables documentadas, lockfile fijado, CI reproducible y estado explícito sin configurar.

### Sprint 1

- Tres migraciones, 29 tablas de dominio con RLS y GRANT explícitos, UUIDs/org_id y claves foráneas compuestas para impedir cruces de organización.
- Organización, personas, usuarios/perfiles, membresías, equipos, roles, grants por acción/equipo; bibliotecas y vínculos normalizados de canciones, anuncios, mensajes y recursos.
- Reuniones/revisiones, bloques, subactividades, puestos, asignaciones e historial append-only. Nota/campos privados en `block_details`, separados de columnas de horario.
- Snapshot de horario y zona en la revisión; schema/version de tipo de bloque copiado a cada instancia. Cambiar un tipo no cambia las instancias existentes.
- Funciones de publicación atómica con versión esperada, contenido publicado inmutable y consulta pública anon allowlist. Editar el inicio/base de reunión no mueve el horario de la revisión publicada.
- Clientes Supabase separados: anon público sin cookies; sesión SSR verificada con `getUser`; cliente privilegiado server-only usado **solo después** de autorización administrativa y solo para altas/invitaciones Auth.
- Auth email, registro, recuperación, OTP/PKCE, cambio de clave, cierre de sesión; membresía+perfil aprobado obligatorios. Roles/grants no provienen de metadata editable.
- Panel para aprobación, alta/invitación pendiente, vincular persona, configurar/revocar permisos y suspensión. Presets aditivos: admin/planner/leader/member; responsables tienen grants scoped a su equipo.
- Directorio de lectura según RLS; seed ficticia sin usuarios Auth ni información real. Confirmación propia mediante RPC estrecha e historial de rechazo disponible en DB; la UI de confirmaciones y solapamientos sigue en Sprint 3.

## Verificación ejecutada

| Comprobación | Resultado |
| --- | --- |
| Lint | Pasó, sin errores ni warnings de código fuente |
| Typecheck | Pasó con TypeScript strict |
| Unit + Auth mockeado + SQL/RLS + PWA worker | 92 pruebas, 4 suites; pasando |
| Cobertura de cinco módulos críticos (dominio, env, validaciones, autorización, acciones Auth) | 100% líneas/statements/funciones; 95.61% ramas; umbral 80% |
| Build de producción | Pasó usando `NEXT_BUILD_DIR` aislado por restricciones de limpieza del host |
| HTTP smoke de 8 rutas/manifiesto/ícono/worker | Respuestas 200 del servidor de producción local; no sustituye comprobación visual |
| Auditoría dependencias runtime | `npm audit --omit=dev`: 0 vulnerabilidades |
| Auditoría completa | 5 advisories high en cadena de lint (`eslint-config-next`/micromatch/braces); sin parche compatible en registro al verificar. No se aplicó downgrade mayor automático |
| E2E desktop/mobile (18 casos) | Ejecutadas, **bloqueadas**: Chrome termina con SIGABRT antes de abrir página; ninguna aserción E2E aprobada |
| UI visual/accesibilidad en navegador real | Pendiente: Playwright y el runtime de navegador integrado no pudieron iniciar en este host |
| Supabase local completo/remoto | Pendiente: Docker inactivo; no se ejecutó contra servicios reales |

Cobertura **no significa 100% de toda la aplicación**: son los cinco módulos críticos configurados en Vitest. PostgreSQL/RLS se ejecuta realmente en PGlite con roles anon/authenticated y `auth.uid` simulado; Auth server, firmas JWT, PostgREST, Storage, Realtime y entrega de correo no son parte de esa prueba. Las pruebas Auth TS usan mocks de la SDK. Las pruebas de worker usan un entorno worker simulado; no sustituyen instalación PWA real.

La ejecución estándar de coverage en carpeta workspace generó métricas pero falló al limpiar `.tmp` por EPERM. La ejecución con `--coverage.reportsDirectory=/tmp/...` pasó y terminó exit 0. El primer build también pasó con `.next`; para repetición se usaron carpetas nuevas soportadas por `NEXT_BUILD_DIR`. No se ocultaron errores con skips.

## Casos de seguridad cubiertos

- RLS habilitado en todas las tablas, anon sin SELECT directo; RPCs privilegiadas inaccesibles a anon.
- Pendiente y suspended sin acceso interno aunque metadata diga admin; usuario no puede autoaprobarse.
- Organizaciones aisladas y FKs anti-cruce; responsable de Media sin permisos de Alabanza/admin.
- Integrante lee revisión publicada, no borrador ni notas; planificador ve draft según grant.
- Confirmación propia, terceros denegados, rechazo conservado y audit append-only.
- Publicación optimista rechaza versión stale; no se puede saltar el lock con UPDATE directo de published_at o puntero; borrador separado y publicado inmutable.
- Subactividades de otro equipo no heredan permiso privado del bloque padre; acceso al equipo específico sin filtrar notas del padre.
- Vinculación de personas solo admin y dentro de org; suspensión revoca privilegios inmediatamente; zonas IANA válidas y snapshot de tipos.
- Errores de Auth/schema fallan cerrado; no uso de getSession ni user_metadata para autorización.
- Worker no cachea API/POST/datos de sesión; offline mínimo público y purga logout.

## Configuración pendiente y próximos sprints

Checklist operativa completa en `SETUP.md`: confirmar **nuevo** Supabase/project ref, aplicar migraciones allí, crear organización/primer admin por bootstrap confiable, variables, SMTP/templates/redirects, protección antiabuso, CI E2E y Vercel/HTTPS.

No implementados aún: CRUD/editor de reuniones y directorio completo, duplicación/presets UI, drag táctil, calendario/matriz, confirmaciones UI/concurrencia del editor, solapamientos/excepciones UI, ejecución en vivo/Realtime, Storage upload, cierre y feedback +10 min/scheduler/email. Los tests actuales de cálculo/cobertura/reset son fundamentos de dominio, no una simulación de esos flujos completos.

**No tocar** Supabase de otros proyectos. No se añadieron WhatsApp, Google OAuth, ProPresenter ni FastAPI. El bloqueo de verificación E2E/servicios debe resolverse antes de declarar los sprints completamente aceptados y antes de producción.

## Archivos relevantes

- `src/app/` y `src/components/`: shell PWA, Auth y administración.
- `src/lib/auth.ts`, `src/proxy.ts`, `src/lib/supabase/`: separación de identidades y guards.
- `supabase/migrations/`: esquema, RLS, ACLs de funciones, inmutabilidad, snapshots y RPCs administrativas.
- `tests/`: suite repetible y alcance de mocks explícito.
- `playwright.config.ts`, `.github/workflows/ci.yml`: verificación E2E preparada, aún no aprobada.

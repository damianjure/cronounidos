# Cierre funcional de Sprint 2 — 16/10/2026

## Alcance aceptado

Se completó el editor aprobado en `ROADMAP.md`: crear reuniones vacías o desde plantilla, editar, guardar borrador, publicar de forma versionada, cancelar, duplicar con seis opciones y reinicio de confirmaciones; timeline lineal con recálculo, drag por mouse/touch y reordenamiento por teclado o botones con rollback; bloques configurables, notas/campos, paralelas, responsables, canciones, anuncios, mensajes y recursos normalizados. Se incluyen catálogo/plantillas, actualización selectiva de reuniones y editor acotado por equipo para notas, campos, enlaces y responsables. La revisión pública permanece separada del borrador. No se implementaron integraciones ajenas al PRD.

El review del 15/10 está en `REVIEW-2026-10-15.md`. F1–F7 quedaron corregidos en migración `20261016024704_repair_sprint2_contracts.sql` y código. La política de Storage DELETE se retiró para usuarios; la eliminación de archivos usa la cola autorizada y la clave secreta **solo en servidor**. Una eliminación sin filas no se acusa como exitosa: se confirma la ausencia del objeto antes de acuse. El botón de plantilla respeta límites de la tarjeta móvil.

## Pruebas y verificación

| Criterio | Evidencia |
| --- | --- |
| Lint, typecheck, unit/SQL y build | `npm run check` pasó; 154 pruebas / 7 suites. |
| RLS/RPC negativas | 67 pruebas de integración; incluyen bloque sin equipo, UPDATE/DELETE directo de recurso, versión NULL y duplicación de paralelas. |
| Cobertura configurada | 98,09% líneas, 90,19% ramas en los 7 módulos críticos configurados; no es cobertura total de la app. |
| Dependencias runtime | `npm audit --omit=dev`: 0 vulnerabilidades. |
| Chrome desktop/mobile base | 28/28; teclado móvil 10/10 repeticiones aisladas, sin retries. |
| Chrome autenticado + Supabase local | 10/10; reemplazo/borrado real Storage, rechazo de DELETE directo y comprobación del objeto ausente **antes** del teardown. |
| PWA/accesibilidad | Tests de manifest, service worker, offline, caché/logout, foco y axe sin violaciones automáticas en las rutas probadas. |
| Supabase local | Migración aplicada; advisor de seguridad sin errores, SQL lint solo 3 warnings previos. |
| Supabase remoto independiente | `ivmhgizuofxdvvvzdxnl`: migración aplicada, dry-run al día, advisor de seguridad sin errores. Sin seed ni escrituras de prueba remotas. |
| CI / Preview | [Run 38844608273](https://github.com/damianjure/cronounidos/actions/runs/38844608273): ambos jobs `foundation` y `authenticated-local` en **success**. Preview `dpl_EfhN8sfFBaEkC7ycxVogDKatfzjU` **Ready**; `vercel curl` al manifest devolvió 200, `/cronograma` sin sesión 307 a `/ingresar`, enlace público inexistente 404. |

## Límites deliberados; no equivalen a MVP completo

- La carga de **archivos** desde el editor **acotado por equipo** continúa deshabilitada: Storage INSERT exige `plan` global. Los responsables pueden editar enlaces HTTPS y desvincular recursos propios. No se amplió RLS ni se usó la clave secreta para conceder subidas fuera del alcance autorizado. La carga global de archivos sí está implementada y probada. Si el PRD requiere que un responsable sin `plan` global suba archivos, se necesita una política/flujo estrecho adicional antes de habilitarlo.
- La suite autenticada corrió contra Supabase local; no se insertaron fixtures ni se ejercitaron todos los roles/organizaciones contra Supabase remoto. Preview protegida tiene smoke HTTP, no un E2E de escritura remota. PWA física/standalone en iOS/Android y lector de pantalla manual siguen pendientes.
- Sprints 3–5 (confirmaciones completas, cobertura/calendario/matriz, modo vivo y feedback) y Production siguen pendientes. El cierre es **del Sprint 2**, no del MVP.
- Antes de Production: remitente dedicado en vez del remitente personal temporal de Preview, protección de contraseñas filtradas, QA Auth/RLS con JWT remotos y configuración Production.
- Los cinco advisories `high` de dependencias de desarrollo en la cadena ESLint permanecen documentados; audit runtime está limpio. No se forzó un upgrade mayor incompatible.

## Próximo trabajo

Sprint 3 según `ROADMAP.md`: confirmaciones, rechazo/reemplazo y conflicto con historial, cobertura, calendario y matriz. Mantener la Preview protegida y evitar datos reales en pruebas.

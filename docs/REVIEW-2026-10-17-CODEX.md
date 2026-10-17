# Revisión integral y testing — segunda revisión del 17/10/2026

**Base:** `87f67ae`, rama `codex/sprint-2-editor`. Checkout inicialmente limpio. Revisión posterior a `0896797`–`0f37490`, no sustitución del informe de estrés anterior.

**Alcance:** lectura de `AGENTS.md` y los 19 documentos existentes de `docs/`; revisión transversal de arquitectura, rutas, acciones de servidor, identidad, clientes Supabase, editor, publicación, asignaciones, live, feedback/correo, PWA, migraciones, pruebas y CI. Atención especial a los cambios recientes. Pruebas con Chrome instalado y Supabase local real; consultas remotas exclusivamente de lectura y un GET de manifiesto de Preview. No garantiza ausencia absoluta de defectos.

## Estado posterior de los hallazgos

**F1–F4 reparados y verificados localmente**, después de este review. Ver la resolución al final. Push, nueva CI y Preview de las correcciones pendientes. El dictamen y las reproducciones siguientes conservan el estado original de `87f67ae`.

## Dictamen

El proyecto sigue el PRD y la arquitectura aprobada. No hay fundamento para reescribirlo ni sumar otro backend. La suite existente está verde, pero **no corresponde declarar todo limpio ni habilitar Production**: se encontró un riesgo de borrado de cuentas en la compensación de invitaciones, una cola de movimientos inaccesible desde la UI y dos problemas del nuevo arnés de estrés. Las sondas negativas adicionales fallaron precisamente al exigir el comportamiento seguro/documentado; no se modificó la aplicación ni se ocultaron esos fallos.

Sprints 0–4 conservan su cierre funcional histórico, con los hallazgos siguientes pendientes de reparación. Sprint 5 tiene feedback in-app y aceptación real del proveedor, pero continúa abierto por recepción/QA y salida a Production.

## Hallazgos nuevos

### F1 — P1: la compensación de invitación puede borrar una cuenta preexistente

**Código:** `src/app/(interno)/administracion/actions.ts:51–75`, especialmente `deleteUser` en 71–73.

`provisionUser` supone que cualquier usuario devuelto por `inviteUserByEmail` fue creado por esta operación. Eso no es cierto: contra Supabase local, crear una cuenta ficticia **sin confirmar** y luego invitar ese mismo correo devolvió éxito y **el mismo UUID**. Si después `register_invited_member` falla (por ejemplo, transporte, permisos revocados entre ambas llamadas o error de DB), la nueva compensación intenta borrar esa cuenta con privilegios globales de Auth. Puede eliminar una cuenta pendiente anterior y su perfil/membresías si no hay referencias que impidan el borrado. No se limita a deshacer la membresía de la organización actual.

**Evidencia:** prueba SDK local `inviteError=null`, `returnedSameUser=true`; fixture propio eliminado al terminar. Prueba aislada de la acción con respuesta de invitación preexistente y error de membresía: la expectativa `deleteUser` **no llamado** falló, porque fue llamado una vez con ese UUID. Esta segunda prueba usa mocks; no se borró una cuenta ajena ni se provocó un fallo remoto.

**Reparación:** no borrar usuarios devueltos por invitación sin prueba fiable de que esta operación los creó. Separar la compensación de alta nueva de la de invitación/reenvío; ante resultado incierto, preservar la identidad y registrar/reconciliar el fallo. No basta una comprobación previa de existencia susceptible a carreras. Agregar regresiones de cuenta nueva, cuenta pendiente existente, reenvío, error de membresía y fallo de compensación. Los tests nuevos de `admin-input` prueban validación, no esta orquestación.

### F2 — P2: la nueva cola del editor no está disponible para el usuario

**Código:** `src/components/editor/meeting-editor.tsx:124–130,242–251` y `src/components/editor/sortable-block.tsx:48,63,122–134`.

Se agregó `queuedMoves`, pero el componente hijo conserva `useSortable({ disabled: busy })`, handle deshabilitado y flechas con `disabled={busy || ...}`. Durante la espera de persistencia no se puede efectuar el segundo movimiento por mouse, dedo, teclado ni botones. La cola no resuelve la limitación que describen `DECISIONS.md` y `STATUS.md`.

**Reproducción:** reunión ficticia con A/B/C; retener el POST de guardado mediante Playwright, mover A abajo y comprobar que «Mover B abajo» continúe habilitado para encolar. La aserción falló tanto en desktop como en mobile porque el botón está deshabilitado. Se conservaron captura y trace; la petición se libera al finalizar. No se observó pérdida de datos en este caso: el defecto es la funcionalidad prometida inaccesible.

**Reparación:** habilitar únicamente las interacciones de movimiento durante la persistencia, manteniendo los demás cambios bloqueados. Probar secuencias múltiples, claves estables, persistencia final y rollback de la cola ante fallo. El estrés SQL secuencial S2c no ejercita esta UI ni su cola.

### F3 — P2: el setup de estrés borra una ruta arbitraria recibida del entorno

**Código:** `scripts/stress/setup.mjs:5–6`.

`PGDATA_DIR` se pasa directamente a `rmSync(DIR, { recursive: true, force: true })`, antes de inicializar/verificar el servidor. Una variable heredada que apunte a datos útiles causa su eliminación; tampoco se detecta un directorio usado por otro proceso. Es un riesgo de herramientas locales, no un endpoint explotable del deploy.

**Reparación:** crear un directorio temporal exclusivo con `mkdtemp`, no limpiar rutas arbitrarias suministradas por el entorno, y detener/limpiar solamente la instancia creada por la misma ejecución. Si se conserva un override, exigir ubicación, marcador y propiedad verificables. Hallazgo por inspección: **no se ejecutó el borrado ni el arnés de estrés** durante este review.

### F4 — P2: el arnés de estrés puede terminar exitosamente con un escenario fallido

**Código:** `scripts/stress/run.mjs:29–33,143–149`.

`burst` acumula errores y los imprime, sin exigir el resultado esperado ni producir exit code de fallo. En S6 se capturan errores al adelantar el fixture y al despachar, y se considera «SIN DUPLICADOS» que `count(*) === count(distinct user_id)`: **cero solicitudes y cero destinatarios también cumplen**. Por tanto, un despacho que no creó solicitudes puede aparentar aprobación. El UPDATE de la línea 143 referencia `ended_at`, columna inexistente, y se silencia; es código sobrante.

**Reparación:** aserciones explícitas por escenario (incluidos los conflictos esperados), destinatarios esperados positivos/exactos, fallar ante errores inesperados y exit code no cero. No capturar fallos de preparación como si la prueba hubiera continuado correctamente. Eliminar el UPDATE inválido. Esto no demuestra que las mediciones anteriores fueran falsas: limita la capacidad actual del arnés para detectar una regresión automáticamente. No se repitió la carga de 200/1000 usuarios.

## Testing ejecutado en esta revisión

| Verificación | Resultado actual |
|---|---|
| `npm run check` | **Exit 0**: lint, typecheck, 219 tests / 17 suites y build. Lint conserva **3 warnings nuevos del arnés de estrés**, no cero warnings. |
| `npm run test:rls` | **95/95**, 4 suites PGlite, aplicando las 33 migraciones desde cero. Incluye el contrato SECURITY DEFINER; no reemplaza pruebas de autorización de cada operación. |
| Cobertura configurada | **98,88% líneas / 93,67% ramas**; 15 archivos seleccionados, no toda la UI ni todas las Server Actions. |
| Chrome base desktop/mobile | **30/30**, sin retries locales: drag mouse/touch/teclado, rollback, temas, preview móvil, PWA/offline/logout, accesibilidad y rutas protegidas. |
| Chrome autenticado + Supabase local | **18/18**, sin retries: Storage privado y ausencia física antes del teardown; editor de equipo; confirmaciones; reemplazos/conflictos/matriz; dos sesiones live, frames Realtime y desconexión; feedback por cron real, respuesta y panel admin privado. |
| Sondas adicionales de CSP | **2/2**, desktop/mobile: listener `securitypolicyviolation` instalado antes de la navegación, ingreso, 11 rutas internas y subida real de PNG privado. Sin violaciones propias. Esto cierra esa comprobación **local**, no la subida remota pendiente. |
| Sondas negativas del editor | **2 fallos**, desktop/mobile: reproducen F2 con un guardado retenido; no se mezclan con los 48 E2E existentes aprobados. |
| Sonda negativa de compensación administrativa | **1 fallo**, aislado con mocks: reproduce F1; SDK local confirma por separado el supuesto de identidad preexistente. |
| SQL lint `public,private --level error --fail-on error` | **Sin errores**, exit 0. No se afirma ausencia de warnings porque se solicitó nivel error. |
| `npm audit --omit=dev` | **0 vulnerabilidades**. |
| Audit completo | **5 high** en cadena de lint: `@next/eslint-plugin-next`, `eslint-config-next`, `fast-glob`, `micromatch`, `braces`; no se aplicó actualización automática incompatible. |
| CI de HEAD | Run **39005226983**, `87f67ae`: `foundation` y `authenticated-local` **success** (comprobado de nuevo). |

Las sondas temporales se retiraron del árbol de pruebas y se conservaron en `/tmp`; no se dejaron tests que aprueben bugs ni se modificaron los tests existentes para conseguir verde. Fixtures ficticios bajo `crono-e2e` limpiados por el teardown guardado para localhost. Sin `db reset`. Chrome mobile es emulación, no un iPhone físico.

## Servicios reales: lectura actual

- Supabase **solo** `ivmhgizuofxdvvvzdxnl`: **33 migraciones**, ninguna tabla pública sin RLS, ambos jobs de feedback activos cada minuto. A las ~08:20 de Buenos Aires, la ventana consultada mostró **950** ejecuciones `succeeded` del despacho y **843** del worker, sin otro estado en ese agregado. No equivale a 1793 correos enviados.
- Outbox: **una fila accepted**, último `accepted_at` **2026-10-17 04:05:03.261887 UTC**. Confirma aceptación registrada, **no recepción física ni configuración actual de la bandera de envío**. No se habilitó el canal, reencoló ni envió correo durante este review. Se consultaron solo metadata/nombres de Vault, nunca sus valores.
- Advisor de seguridad: **sin ERROR**; mantiene Leaked Password Protection desactivada, 49 funciones DEFINER autenticadas, una anónima intencional y 10 tablas privadas sin política/grants API. No abrir estas tablas para eliminar avisos. [Contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Advisor de rendimiento: 9 avisos `auth_rls_initplan`, 54 FKs sin índice de cobertura y 30 índices marcados sin uso. No se cambiaron índices sin medición representativa.
- Vercel: alias de rama apunta a Preview **Ready** `dpl_EjB1RCPwDxHMVHoEgB16Vx4LW96m`, funciones en **gru1**. El MCP respondió 403 para el scope; CLI autenticada permitió la inspección. Un único GET autorizado del manifest dio **200**, nombre Crono Unidos y CSP aplicada (no Report-Only), origen HTTPS/WSS del Supabase correcto y toolbar solo Preview. No se repitió carga remota ni se modificaron reglas de firewall.

## Limpieza, documentación y pendientes

- Solo `.env.example` entre archivos de entorno versionados; no builds, dependencias ni reportes de test versionados. No se consultaron valores de secretos.
- El editor sigue con **1060 líneas**; la extracción propuesta en `IMPLEMENTATION-NOTES.md` sigue siendo deuda razonable, no motivo para reescribir ahora. Tres variables sin uso en `scripts/stress/run.mjs` explican los warnings de lint.
- La documentación nueva mejora la trazabilidad, pero `STATUS.md` aún decía «falta deploy a Preview para medir gru1» después de registrar el deploy/medición. `SETUP.md` y el encabezado de `EMAIL.md` conservan snapshots anteriores al accepted. Se actualizó el resumen `STATUS.md` y se enlazó esta revisión; los registros históricos no se borraron. Usar el resumen vigente, no el primer checkpoint de cada archivo.
- No hay evidencia de features ajenas al PRD que justifique una poda agresiva. Demo, migraciones históricas y pruebas son intencionales. `readLive` sigue usado para el render inicial del modo vivo; no es código muerto por haber movido el refresco al navegador.

### Antes de Production

1. Reparar **F1** y agregar pruebas de orquestación administrativa; después F2 y asegurar el arnés F3/F4.
2. Confirmar recepción real del correo ya aceptado y alias/bandeja del remitente. No mandar otro sin plan autorizado.
3. Revisar protección de contraseñas filtradas y protección antiabuso de registro conforme al plan disponible, sin cambios de facturación automáticos.
4. Completar QA remota Auth/RLS con cuentas diferenciadas, invitación/recuperación y renovación; subida remota bajo CSP.
5. PWA física iOS/Android y modo vivo con varios dispositivos detrás de una IP compartida; no reproducir ráfagas remotas que vuelvan a bloquear al propietario.
6. Dominio/DNS, SMTP dedicado de Auth, variables y redirects de Production. No activar Production durante la revisión.

## Evidencia local temporal

- `/tmp/crono-review-current-check.log`, `-coverage.log`, `-rls.log`, `-sql-lint.log`, `-base.log`, `-auth.log`.
- `/tmp/crono-review-current-coverage/`, `/tmp/crono-review-current-base-report/`.
- `/tmp/crono-review-provision.test.ts`, `/tmp/crono-review-provision.log`.
- `/tmp/crono-review-browser-probes.spec.ts`, `/tmp/crono-review-browser-probes.log`, `/tmp/crono-review-probes-report/`.
- `/tmp/crono-review-queue-{desktop-auth,mobile-auth}.png` (captura móvil inspeccionada).
- `/tmp/crono-review-current-deployment.log`, `/tmp/crono-review-current-remote-headers.txt`, `/tmp/crono-review-current-remote-manifest.json`.

Los traces de pruebas autenticadas pueden contener credenciales efímeras locales: no versionarlos, publicarlos ni pegar su contenido en chat. Estos artefactos de `/tmp` no son una evidencia permanente remota. Cambios propios del repositorio en esta revisión: este informe y el resumen de estado; **sin cambios funcionales, migraciones, commit, push ni deploy**.

Al finalizar apareció un archivo no versionado `.clauderules` con guías contextuales de skills/arquitectura/PR. Se leyó y se dejó intacto: no fue creado por esta revisión ni se incluyó en sus cambios.

## Resolución posterior — reparaciones verificadas el 17/10/2026

- **F1, `bd76ed4`:** se elimina la compensación destructiva, tanto para invitaciones como para altas directas. Se conserva Auth y cualquier membresía posiblemente confirmada ante error devuelto o excepción de transporte. La UI informa revisión administrativa, incluso para URLs de error antiguas; ya no aconseja borrar cuentas. APP_URL inválida se rechaza antes de enviar/crear. **14 pruebas** de orquestación: autorización antes del cliente privilegiado, datos/configuración inválidos, altas/invitaciones, reenvío de cuenta preexistente, rechazo de Auth y errores devueltos/lanzados del RPC. La primera pasada contra el código anterior dio 6 fallos / 8 aprobadas; tras reparar, 14/14.
- **F2, `b219ae3`:** handle, dnd-kit y flechas permanecen activos durante la persistencia; duración y guardar/publicar siguen bloqueados. **6 E2E** nuevas con POST retenido en Chrome desktop/mobile: varios movimientos por botones/teclado, orden optimista inmediato, dos guardados reales en total (movimientos agrupados), comprobación de versión y orden desde RPC y tras recarga; fallo del primer guardado descarta toda la cola y fallo del segundo revierte solo a la base ya persistida. Después de cada fallo se verifica un guardado nuevo sin movimientos fantasma. No se cambió el contrato de publicaciones ni RLS.
- **F3/F4, `52f01bc`:** PGDATA nuevo con `mkdtemp`, sin borrado inicial; override `PGDATA_DIR` rechazado antes de importar binarios opcionales. Limpieza restringida al directorio propio tras detener su instancia. Ráfagas exigen todos los éxitos o cantidades/mensajes exactos de conflictos esperados. Se verifican estado final de confirmaciones, versiones/bloques de live, rollback, reintento idempotente y rechazo de versión obsoleta. Despacho exige destinatarios positivos y conteos exactos de solicitudes, usuarios y avisos. Se retiraron el UPDATE inválido y variables sin uso. Errores inesperados de pool/aserciones hacen fallar el proceso; no basta imprimir «OK». **6 regresiones** sin dependencias opcionales cubren protección de carpetas, directorios independientes, rechazo temprano del setup, validación de ráfagas/feedback y exit code no cero.

### Verificación del candidato local

- `npm run check` final: **lint sin errores ni warnings**, typecheck, **239/239 pruebas en 19 suites** y build correctos. Incluye las 95 pruebas SQL/RLS existentes, sin modificar migraciones ni relajar aserciones.
- Chrome base **30/30** y autenticado **24/24**, ambos sin retries locales. Los seis casos nuevos de cola están incluidos en las 24; el resto de las pruebas existentes se conservó intacto. **54 E2E en total**, no 54 flujos remotos.
- Cobertura configurada: **98,88% líneas / 93,96% ramas** en los mismos 15 archivos seleccionados. Las nuevas pruebas de administración no convierten esa métrica en cobertura integral de Server Actions/UI.
- `npm audit --omit=dev`: **0 vulnerabilidades**. No se cambiaron package.json/package-lock ni dependencias runtime. Los advisories dev de lint previamente documentados no se repararon mediante upgrades incompatibles.
- Revisión manual del diff y checklist React/servidor: se conserva autorización antes de efectos, mensajes sanitizados y ninguna lectura de secretos, operación destructiva nueva o ampliación de permisos. No se afirma revisión independiente por otro agente.

### Estrés real repetido con el arnés corregido

Se instalaron dependencias opcionales en un workspace temporal fuera del repositorio, con versiones fijadas (`embedded-postgres@17.10.0-beta.17`, `pg@8.16.3`), sin alterar el lockfile de la app. PostgreSQL **17.10**, puerto local **55432**, PGDATA temporal propio y 33 migraciones + seed ficticia. Cada corrida usó una instancia nueva. No se tocó Supabase remoto ni el stack local de la app en 54321/54322.

| Carga SQL ficticia | Resultado |
|---|---|
| 200 usuarios | **Exit 0**: todos los escenarios y aserciones; 150 confirmaciones concurrentes; 1000 lecturas live concurrentes; 8 despachos produjeron **121 solicitudes / 121 usuarios / 121 avisos**, sin duplicados. |
| 1000 usuarios | **Exit 0**: todos los escenarios y aserciones; 950 confirmaciones concurrentes; 5000 lecturas live concurrentes; 8 despachos produjeron **761 solicitudes / 761 usuarios / 761 avisos**, sin duplicados. |

En ambos casos: 20 editores sobre la misma versión → 1 éxito y 19 conflictos de versión exactos; doble respuesta y doble avance → 1 éxito y 1 conflicto previsto; diez reintentos de inicio → una transición; matar el backend antes de COMMIT conservó versión/bloques; repetir el mismo UUID no avanzó dos veces. El vencimiento de feedback se adelanta **solo en el fixture de esa base temporal**. No se esperaron diez minutos reales ni se enviaron correos. La carga usa roles SQL e identidad simulada: no representa 1000 navegadores, JWT remotos, dispositivos físicos, firewall ni Wi-Fi de iglesia.

La primera corrida del arnés nuevo terminó **exit 1**, aunque las aserciones de datos pasaron: el backend matado intencionalmente provocó un evento tardío del pool. No se ignoraron todos los errores para volverlo verde. Se aisló esa conexión destructiva fuera del pool y solo se admite su SQLSTATE de terminación esperada; se repitieron las corridas completas en instancias nuevas, ambas exit 0. Las instancias propias fueron detenidas al finalizar. El arnés conserva fallo ante cualquier error inesperado de infraestructura.

Logs: `/tmp/crono-repair-{check,final-check,final-lint,auth,base,coverage}.log`, `/tmp/crono-repair-admin-red.log`, `/tmp/crono-repair-stress-red.log`, `/tmp/crono-repair-stress-200.log` (primer fallo del fixture), `/tmp/crono-repair-stress-200-final.log` y `/tmp/crono-repair-stress-1000.log`. Traces autenticados siguen siendo locales y no deben publicarse.

**Estado:** reparaciones locales completadas, commits pequeños, sin push, nueva CI ni deploy todavía. Sigue pendiente la verificación de las correcciones en Preview, además de todos los gates operativos/Production enumerados arriba. `.clauderules` se conserva ajeno a estos cambios. No hay nuevas claves, migraciones ni configuración remota.

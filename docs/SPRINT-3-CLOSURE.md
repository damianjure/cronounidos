# Cierre funcional del Sprint 3 — 16/10/2026

## Alcance completo

- Confirmaciones manuales individuales y por persona, rechazo, precondiciones y lotes atómicos. Integrante solo responde lo propio; responsable usa sus permisos de equipo.
- Puestos por reunión con cantidad, rol y prioridad crítica/requerida/opcional; alta, cambio de prioridad y eliminación exclusivamente sin historial. Asignación de personas activas del equipo, vacantes y reemplazo explícito. Un reemplazo conserva estado/fecha anteriores y crea una asignación pendiente. No transfiere confirmación.
- Guardar requisitos y cantidades al crear/actualizar una plantilla desde una reunión. Nuevas instancias reciben puestos vacantes; cambiar la plantilla no modifica reuniones anteriores. La aplicación selectiva de bloques existente sigue modificando solo bloques; los puestos de reuniones existentes se ajustan explícitamente en su pantalla.
- Reemplazo de responsables de actividad en borrador sin alterar la confirmación publicada. Se activa la trazabilidad al publicar; propuestas sucesivas llegan al resultado final. Un snapshot histórico no puede revivir una asignación reemplazada.
- Solapamientos principales, paralelos y entre reuniones. Intervalos semiabiertos (dos actividades consecutivas no se superponen), offsets y duraciones planificadas. Un puesto ocupa toda la duración planificada. Advertencia, enlace para reprogramar, reemplazo y excepción autorizada con motivo de 10–2000 caracteres. Cambiar persona/horarios invalida la huella previa. Sin permiso sobre ambos equipos, solo advertencia genérica y no se permite justificar.
- Calendario mensual con indicadores, próximas tres, alta desde fecha vacía y selector de varias reuniones del mismo día. Matriz roles × reuniones en desktop y tarjetas por equipo/reunión en móvil, incluida previsualización Mobile de escritorio.
- Cobertura global sin nombres de personas ni notas: opcionales excluidos, gris sin requeridos, rojo <60%, amarillo 60–89% o falta crítico, verde ≥90% solo con críticos confirmados.

## Acceso

- Desde el cronograma: **Gestionar puestos y reemplazos**.
- Desde Confirmaciones: **Gestionar puestos, reemplazos y solapamientos**, solo si la sesión está autorizada.
- Desde Calendario: **Ver matriz de cobertura**.
- Los puestos son operativos y actualizan cobertura inmediatamente; las actividades siguen separadas en borrador/publicado. La UI explica ambas modalidades.

## Verificación

- `npm run check`: lint, typecheck, **174 pruebas / 10 suites** y build correctos.
- SQL/PGlite: **80 pruebas**, incluidas organización/equipo/aprobación/anon, cantidades, precondiciones, reemplazos, rechazo conservado, ciclos, plantillas futuro-only, datos agregados, solapamientos principales/paralelos/entre reuniones, límites contiguos, privacidad, excepción obsoleta y snapshot histórico.
- Chrome desktop/mobile base: **30/30**; incluye drag mouse/táctil/teclado, PWA/offline, rutas públicas y privacidad de caché.
- Chrome autenticado + Supabase local: **14/14**, con sesiones distintas de administrador, responsable e integrante, asignación/reemplazo por UI, historial, excepción, matriz, calendario, axe WCAG A/AA/2.1 AA y overflow. Datos ficticios; teardown limitado por guardas al stack local y organización `crono-e2e`.
- Cobertura de **11 módulos críticos configurados**: **98,44% líneas, 91,80% ramas**; no es cobertura total de pantallas/servicios.
- `supabase db lint --local --level error`: sin errores. `npm audit --omit=dev`: 0 vulnerabilidades.
- Screenshots desktop/mobile de matriz revisados; se corrigieron bordes y tamaño táctil de navegación. Primer intento E2E encontró selectores ambiguos entre equipos y un selector cerrado de múltiples reuniones; corregidos, suite completa repetida en verde.
- Revisión de integridad agregó protección para no recuperar una confirmación histórica después de reemplazar a una persona; regresión automatizada.

## Migraciones y servicios

Cinco nuevas migraciones reproducibles, desde `20261016161348_sprint3_staffing.sql` hasta `20261016162931_sprint3_prevent_retired_assignment_reuse.sql`. Total **23 migraciones** en el proyecto independiente `ivmhgizuofxdvvvzdxnl`. Sin seeds ni fixtures remotos; sin tocar otros Supabase. Las nuevas RPCs usan sesión y autorización en servidor de base, no service role. Ninguna variable nueva.

Advisor remoto de seguridad: sin errores de nivel ERROR. Mantiene avisos de revisión para funciones SECURITY DEFINER intencionalmente ejecutables (una pública mínima y RPCs autenticadas con autorización interna) y tablas privadas con RLS sin políticas/grants API. No se deben “corregir” abriendo acceso. **Leaked Password Protection desactivada**: revisar disponibilidad/configuración del plan antes de Production; no se cambió suscripción ni se habilitó facturación.

## No equivale a salida a producción

- Falta QA remota integral de Auth/RLS con cuentas reales diferenciadas y completar prueba de invitación aceptada que el usuario postergó.
- SMTP/remitente exclusivo y variables/dominio/redirects de Production siguen pendientes; remitente temporal autorizado solo en Preview.
- Instalación PWA y gestos en dispositivos físicos iOS/Android pendientes; Chrome móvil emulado no los reemplaza.
- Modo en vivo (Sprint 4), feedback/cierre +10 min y salida pública (Sprint 5) no se implementaron en este cierre.
- La detección de solapamientos advierte; no bloquea publicar ni resuelve sola. Publicados ajenos son operativos; borradores iniciales ajenos solo se consideran para planificadores globales, sin filtrarlos a responsables de equipo.

Sprint 3 cerrado **funcionalmente**, manteniendo estas tareas de entorno/producción explícitas. No habilitar Production ni comenzar a usar feedback/en vivo como si estuvieran terminados.

## Evidencia de CI y Preview

Código funcional y estilos `0126d61`: [CI 38932687808](https://github.com/damianjure/cronounidos/actions/runs/38932687808) **success**, jobs `foundation` y `authenticated-local`. [Preview verificada](https://crono-unidos-q72hqpvxz-damianjure-5692s-projects.vercel.app) **Ready**. La revisión final de documentación y la eliminación de una asignación local sin uso en un test no cambian el código de la app validado.

CI conserva avisos de infraestructura sobre actions v4 con runtime Node 20 forzado a Node 24 y próxima actualización de `ubuntu-latest`; los jobs pasan. No se confundieron estos avisos con errores del producto. Se retiró el warning nuevo de variable sin uso antes del cierre.

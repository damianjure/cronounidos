# Editor desktop — mejora del 17/10/2026

Implementación autorizada por el propietario después de revisar Tecnoiglesia y su grabación. Referencia: `REFERENCIA-DESKTOP-TECNOIGLESIA.md`. Commits de aplicación: `b462517` y `33712d6`. No es un sprint nuevo ni una ampliación del PRD.

## Qué cambió

- Cabecera más compacta y resumen de fecha, inicio, duración, fin planificado y estado de guardado. El fin identifica cambio de día; no representa un cronómetro real.
- Guardar borrador/Publicar mantienen su jerarquía. Plantillas y acceso a duplicación están en Más acciones; no se cambió su semántica ni confirmaciones.
- Agregar bloque abre un diálogo nativo en desktop: búsqueda de tipos configurables, actividad personalizada, nombre y duración inicial. Cancelar/Escape no agregan nada; el foco vuelve al disparador. Confirmar agrega al borrador, no publica ni finge persistencia.
- Iconos/descripciones orientativos por tipo; no imponen esquemas ni eliminan tipos personalizados. Se abre contenido sugerido para música/mensaje/anuncios, con todos los demás paneles disponibles.
- Detalle con accesos a actividad, equipo, canciones, mensaje, anuncios, recursos y avanzado. Son secciones del mismo estado, no modelos duplicados ni rutas que pierden el borrador.
- Búsqueda local de bibliotecas, canciones por título/artista, seleccionados visibles y ordenados aun con un filtro sin coincidencias. Se pueden quitar asociaciones desde la selección.
- Responsables ordenados por equipo → rol → búsqueda/persona. La búsqueda no supone pertenencia de equipo que no esté en el catálogo ni reemplaza la autorización de DB.
- Filas con icono, horario, duración y conteos opcionales. En desktop ancho los controles de movimiento quedan en la misma fila.
- Feedback de arrastre legible, destino resaltado y anuncios en español con nombre/posición. Se conservan sensores y estrategia de desplazamiento de dnd-kit, teclado/botones, cola de guardados y rollback. Sin transiciones cuando se solicita movimiento reducido.
- Advertencia por cambios pendientes/guardado en curso al recargar/cerrar y al seguir enlaces que abandonan la reunión. No se promete interceptar toda navegación programática o historial interno SPA.
- Indicador de espera en enlaces de navegación con `useLinkStatus`, sin cambiar códigos HTTP mediante boundaries de streaming. Error general con instrucciones para usuarios, no migraciones de Supabase.

## Alcance conservado

No hay migraciones, dependencias nuevas, secretos ni cambios de servicios. La única ampliación del DTO de catálogo es el artista de canciones ya autorizado por `editorContext` y RLS; no se agrega a la agenda pública. Persistencia, ACL, versiones, cobertura, confirmaciones y ejecución en vivo conservan sus contratos.

No se implementaron PDF, rich text, playback/BPM, banners, ubicación/asistentes ni duración objetivo. El rediseño móvil y la PWA física quedan para otro día por pedido del propietario. Se mantiene la entrada anterior de actividades en móvil/mobile preview; las mejoras compartidas de búsqueda, avisos y opciones avanzadas no constituyen una nueva validación física.

## Verificación local

| Comprobación | Resultado |
|---|---|
| `npm run check` | Exit 0: lint sin warnings, TypeScript, **245 tests / 20 suites**, build |
| SQL/RLS | Las **95** regresiones existentes pasan dentro de las 245; sin migraciones |
| Chrome base | **38 aprobadas**: las 30 existentes desktop/mobile + 8 nuevas específicas de desktop |
| Chrome autenticado + Supabase local | **24 aprobadas**, incluidas cola/persistencia/rollback, Storage privado, tipos/plantillas, permisos de equipo, staffing, live y feedback por cron |
| Cobertura configurada | **98,88% líneas / 93,96% ramas**, mismos 15 archivos seleccionados; no cobertura integral de UI |
| Audit runtime | **0 vulnerabilidades**; no se modificó lockfile |
| Accesibilidad/visual | Axe sin violaciones detectadas en editor/selector claro/oscuro; capturas revisadas a 1280 y 1600 px, modal centrado y filas compactas sin overflow |

Las ocho pruebas nuevas solo se ejecutan en el proyecto desktop: sus ocho combinaciones móviles figuran como no aplicables, **no se omitió ninguna de las 30 regresiones existentes**. Nuevos casos: cancelación/foco/alta guiada, búsqueda por artista y selección filtrada, navegación sin perder notas y advertencia de salida, selector accesible en ambos temas, cambio de día, indicador de navegación retenida, previsualización real de arrastre/reduced-motion y densidad visual desktop ancho.

Las pruebas autenticadas actualizaron únicamente su recorrido para abrir el selector desktop/Más acciones/Opciones avanzadas; preservan las aserciones de persistencia, RLS, Storage e historial. El stack local continúa aislado en 54321/54322, sin reset ni fixtures remotos.

## Fallos encontrados y corregidos durante esta entrega

1. Primera pasada TDD: los cuatro escenarios iniciales nuevos fallaron contra la UI anterior. No eran pruebas verdes de una funcionalidad inexistente.
2. Un `loading.tsx` superior hizo que el acceso restringido a feedback admin devolviera 200 de streaming en lugar del 404 exigido. La suite autenticada falló en desktop y mobile (**22/24**). Se retiró ese archivo y se usó `useLinkStatus`; no se relajó el test. Nueva pasada: **24/24**.
3. Texto duplicado de la acción de duplicar provocó ambigüedad del selector; se distinguió «Opciones para duplicar» de «Duplicar reunión».
4. El textarea controlado dentro de label implícito incorporaba su contenido al texto que resolvía `getByLabel` después de editar. Se agregó un nombre accesible explícito y se conservó la comprobación de valor tras navegar secciones.
5. Se ajustó la prueba nativa de cancelación de recarga para iniciarla desde `window.location.reload()`, evitando que la espera de navegación del comando de protocolo compitiera con la cancelación. Se comprueba diálogo real, cancelación, conservación de nota y ausencia de aviso después de guardar; no se simula el handler.
6. Revisión de screenshot encontró el diálogo alineado arriba/izquierda por el reset CSS; se centró explícitamente y se verificó foco inicial y retorno.

Revisión manual de cambios siguiendo checklist React/servidor: listeners con cleanup, diálogos accesibles, sin estado de servidor/cache entre usuarios, catálogos autorizados, IDs normalizados y ninguna operación privilegiada nueva. No se afirma revisión independiente por otro agente.

Logs locales: `/tmp/crono-desktop-{red,check,check-2,check-3,release-check,coverage,auth,auth-final,complete-base}.log`. Capturas/traces permanecen locales; no publicar traces autenticados que puedan contener credenciales efímeras. Los checkpoints fallidos se conservan, no se sustituyen por una pasada verde sin explicación.

## Servicios

Commits pusheados a `codex/sprint-2-editor` hasta **`96c0f9d`**. CI **39051769548 success**, ambos jobs: 245 tests, 38 E2E base y 24 autenticados aprobados; sin casos flaky/retries registrados. Preview **Ready** `dpl_BocfkH3XhVQMMd51mEvyUwvqUJve`, funciones `gru1`, alias estable de rama. Los cambios documentales posteriores no alteran ese código.

Comprobaciones remotas limitadas: manifest 200; cronograma sin sesión 307 a ingreso; worker sin secreto 401/unauthorized, sin operar la cola. Chrome abrió la demo nueva, selector con foco inicial en búsqueda y cancelación sin agregar bloques. Después abrió la agenda y un borrador real con la sesión existente: datos/acciones cargaron sin error de catálogo, publicación deshabilitada al no tener bloques y sin cambios pendientes. Se abrió/canceló el selector, sin crear/publicar/cancelar reuniones ni modificar contenido real. Evidencia de UI en `/tmp/crono-desktop-evidence/`; captura remota del selector es demo, no personas reales.

**Configuración pendiente de contenido:** el selector del borrador real solo ofreció Actividad personalizada; no hay tipos configurados en el catálogo consultado. Configurarlos mediante Tipos y plantillas antes de esperar tarjetas de Alabanza/Mensaje/etc. No se cargaron seeds ni se crearon tipos remotos por este cambio visual.

No se activa Production ni se dan por cerrados los demás gates remotos/operativos de `STATUS.md`.

## Ajuste puntual de alineación — 17/10/2026

Pedido: solo compactar/alinear minutos y flechas y llevar «Opciones avanzadas» al final del detalle. Sin ampliar alcance ni rediseñar móvil.

- Solapamiento reproducido con una prueba de geometría: columna desktop del handle de 36 px frente al mínimo real de 44 px. Ahora reserva 44 px y un gap de 8 px; la hora no queda debajo del botón/foco.
- Marcos visibles de handle/flechas de 34 px, pero área interactiva de 44×44 px y foco/teclado/táctil conservados. Input de minutos de 60 px con unidad a su lado; cuadrícula ancha reserva columnas explícitas para duración y flechas.
- El `<details>` de Opciones avanzadas se movió físicamente después de Actividades paralelas, conservando el contenido, permisos y enlace «Ir a avanzado». No es solo un orden CSS que contradiga el recorrido de teclado.
- Regresión a 1100/1280/1450/1600 px, incluyendo título largo, cajas sin intersección y apertura de la última sección. La primera ejecución detectó el bug original; tras arreglar, el selector de la prueba se acotó a secciones directas (no al `<details>` anidado de crear campo personalizado).
- Lint, tipos, 245 tests y build aprobados. E2E base **39 aprobadas / 9 combinaciones no aplicables**; las regresiones móviles existentes no se omitieron. Vista ancha claro/oscuro y axe aprobados. Capturas en `/tmp/crono-ui-align-results/`; logs `/tmp/crono-ui-align-check.log` y `/tmp/crono-ui-align-e2e-final.log`.
- Fuente: commit `6f2788e`, push a `codex/sprint-2-editor` (Preview, nunca main). Sin modificaciones de datos/secretos/migraciones/Production. Resultado de la verificación autenticada y Preview registrado en STATUS.

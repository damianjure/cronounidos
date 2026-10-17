# Revisión UX/UI del dashboard

**Fecha:** 17/10/2026. **Objetivo:** aprovechar patrones de carga de servicios/reuniones de Tecnoiglesia One para Crono Unidos, sin reemplazar el PRD ni aprobar funcionalidades adicionales.

## Diagnóstico general

Se accedió a la [reunión indicada por el propietario](https://one.tecnoiglesia.com/services/9ab48246-e568-4247-9f75-d2c002f6a539) en Brave, con su sesión existente. Se observaron captura desktop y árbol de accesibilidad; se abrieron formularios y se cancelaron sin guardar. No se crearon bloques, roles, servicios, canciones ni archivos. No se cambió el tema, la cuenta ni la configuración.

La referencia organiza el servicio por pestañas y ofrece un selector de tipos antes de mostrar el formulario del bloque. Esto es más orientador que presentar todos los campos posibles simultáneamente. Conviene adoptar esa jerarquía, no reproducir toda la pantalla: el banner y la repetición de horarios dejan poco lugar al programa. Crono Unidos ya tiene timeline y detalle lateral sticky; la mejora es de carga y densidad, no de backend.

En el primer recorrido la reunión no tenía bloques, canciones ni personas programadas. El propietario cargó después tres bloques; ver el segundo recorrido al final. No se realizó una auditoría de seguridad de Tecnoiglesia ni QA móvil de esa web.

## Evidencia observada

| Pantalla/flujo | Qué se verificó | Qué tomar para Crono Unidos |
|---|---|---|
| Cabecera | Título/tipo, fecha, inicio/fin, ubicación, edición y menú secundario; banner grande | Cabecera compacta con título, tipo, inicio, fin calculado, duración y estado editorial explícito |
| Navegación | Programa, Equipo, Setlist, Recursos y Notas | Agrupación por tarea, sin ocultar permisos ni cambios pendientes al navegar |
| Agregar bloque | Selector con icono, nombre y descripción: Separador/Sección, Canción, Predicación, Lectura Bíblica, Oración, Anuncios, Transición, Personalizado, Archivo y Link | Selector visual basado en los tipos configurables existentes; no hardcodear una lista cerrada |
| Predicación | Título del mensaje, duración estimada, pasajes, notas, Cancelar/Guardar | Formulario enfocado; seleccionar entidad Mensaje y mostrar sus datos según permisos |
| Canción | Playback, biblioteca o nombre manual, duración, tono, BPM, enlace, notas técnicas | Búsqueda de biblioteca y selección de canciones normalizadas; no copiar texto libre como sustituto de entidades |
| Biblioteca musical | Búsqueda por título/artista y listado seleccionable | Búsqueda dentro del catálogo autorizado; preservar orden y vínculos existentes |
| Equipo | Estado vacío con CTA; alta guiada por área ministerial y luego rol | Equipo → rol → persona, mostrando también vacantes, prioridad y estado de confirmación |
| Setlist | Estado vacío con Buscar en biblioteca/Canción nueva | Acciones claras; no duplicar un repertorio independiente del orden del plan |
| Recursos | Input list vacío, recursos necesarios y Agregar recurso | Acceso contextual a archivos/enlaces ya soportados; input list no se incorpora automáticamente |
| Notas | Editor enriquecido con listas, títulos, enlaces e imágenes | Separar notas del programa; editor enriquecido queda fuera de esta propuesta inicial |
| Plantillas | Acción Aplicar plantilla; selector sin plantillas | Hacer visible la acción existente; no se verificó aplicación ni política de actualización de esa web |
| Editar servicio | Nombre, emoji, color, fecha, tipo, inicio/fin, ubicación, asistentes estimados | Agrupar campos actuales; emoji, ubicación y asistentes estimados no se agregan sin decisión de alcance |

## Problemas críticos

No se demostraron defectos críticos en la referencia: solo se recorrieron pantallas sin escrituras. Sí hay invariantes críticas que una adaptación debe preservar:

1. **No confundir guardado con publicación.**
   - Impacto: los lectores podrían recibir cambios aún no aprobados.
   - Solución: conservar Guardar borrador/Publicar cambios y una indicación permanente de qué revisión se está editando.
   - Prioridad: alta, criterio de aceptación.
2. **No copiar la semántica de confirmaciones sin verificarla.**
   - Impacto: una barra de personas confirmadas no demuestra cobertura de puestos requeridos.
   - Solución: usar nuestra fórmula critical+required, gate de críticos y gris/N/A cuando no hay posiciones; conservar vacantes/rechazos/historial.
   - Prioridad: alta, criterio de aceptación.
3. **Pestañas no equivalen a autorización.**
   - Impacto: esconder Notas o Equipo no evita filtraciones por datos cargados.
   - Solución: mantener DTO/RPC/RLS, separación pública/privada y edición por equipo; no aumentar el payload de lectores públicos.
   - Prioridad: alta, criterio de aceptación.

## Problemas medios

1. **Demasiada altura antes del programa en la referencia.**
   - Impacto: el primer bloque queda lejos de las acciones principales.
   - Solución: eliminar banner decorativo de la propuesta operativa; unificar horario y resumen en una cabecera compacta.
   - Prioridad: media.
2. **Alta actual de Crono Unidos poco guiada.**
   - Evidencia de código: `meeting-editor.tsx` usa un select de tipo más Agregar actividad, crea «Nueva actividad» y luego muestra el panel genérico.
   - Impacto: no orienta qué contenido corresponde cargar después.
   - Solución: selector visual y detalle contextual con campos comunes y secciones especializadas.
   - Prioridad: media.
3. **Muchas acciones compiten en la cabecera actual de Crono Unidos.**
   - Evidencia de código: nombre de plantilla + guardar plantilla + guardar borrador + publicar en la misma toolbar.
   - Impacto: el guardado habitual compite con acciones ocasionales.
   - Solución: guardar/publicar visibles y acciones secundarias agrupadas; abrir formulario de plantilla solo al solicitarlo.
   - Prioridad: media.

## Mejoras visuales menores

1. Icono y descripción corta para cada tipo, con texto accesible y sin depender del color.
2. Selección del bloque claramente indicada, manteniendo foco y contraste en claro/oscuro.
3. Resumen legible de inicio, duración total y fin calculado, sin duplicar tarjetas de horarios.

## Recomendaciones de layout

Propuesta desktop, no implementación ni copia exacta de Tecnoiglesia:

```text
Navegación | Título · fecha · tipo · estado borrador/publicado
           | Inicio · duración · fin calculado · cobertura
           | Guardar borrador · Publicar cambios · Más acciones
           | Programa | Equipo | Canciones | Recursos | Notas
           | Cronograma ancho             | Detalle contextual
           | Hora · actividad · duración   | Campos comunes
           | Handle + mover arriba/abajo   | Contenido del tipo
           | + Agregar bloque              | Opciones avanzadas
```

- Mantener el patrón de dos columnas existente; ajustar proporciones con evidencia visual, no valores arbitrarios que compriman el detalle.
- Agregar bloque accesible al inicio y al final del programa. Insertar entre filas es una posible mejora posterior, no un cambio ya aprobado.
- Selector de tipo con búsqueda si el catálogo crece; devolver el foco al bloque creado o al botón al cancelar.
- En móvil: una sola columna, formularios adaptados a pantalla completa y targets de al menos 44px; no trasladar literalmente el desktop.
- Mantener selector Desktop/Mobile solo en navegador desktop, y modo móvil en PWA móvil.

## Revisión de formularios

- **Campos faltantes:** no se demostró ausencia de campos del PRD en esta revisión; no agregar todos los de la referencia por analogía.
- **Campos confusos:** en nuestro editor, «Nueva actividad» no explica el siguiente paso. Proponer nombre inicial del tipo y edición inmediata. Los controles especializados deben vincular Mensaje/Canción/Anuncio/Recurso existentes.
- **Validaciones necesarias:** conservar schemas y límites actuales, URL segura, duración válida y concurrencia por versión. No se probaron validaciones de la referencia mediante envíos.
- **Estados faltantes:** no evaluados mediante fallo real en Tecnoiglesia; nuestra adaptación debe mostrar guardando, guardado, cambios pendientes y rollback sin éxito ficticio.
- **Avanzados:** campos personalizados y paralelas deben seguir disponibles, sin obligar a recorrerlos para cargar un bloque simple.

## Revisión de tablas

La referencia está vacía: no se observaron columnas de filas cargadas. La siguiente es una propuesta para nuestro timeline, no una descripción de su tabla:

- **Mantener:** handle, hora calculada, nombre/tipo, duración y alternativa de movimiento por teclado/botones.
- **Mover al detalle:** notas largas, listas completas de recursos, edición de contenido y campos personalizados.
- **Filtros:** selector/buscador de tipo al crear y de biblioteca al asociar contenido. No agregar un filtro que oculte bloques del eje lineal sin mostrar claramente esa condición.
- **Acciones por fila:** seleccionar/editar y mover. Mantener confirmación o reversión adecuada para eliminación; no cambiar persistencia como parte de un simple restyling.

## Estados faltantes

No se afirma que Tecnoiglesia carezca de los estados no provocados. Requisitos a comprobar en la adaptación:

- **Loading:** visible al consultar catálogos; no interpretar un catálogo pendiente como vacío.
- **Empty:** «Todavía no hay bloques» con Agregar bloque/Crear desde plantilla; biblioteca vacía con acceso autorizado a catálogos.
- **Error:** fallo de guardar con rollback, conflicto de versión con recuperación y permisos insuficientes sin exponer contenido.
- **Success:** distinguir guardado de borrador de publicación, sin duplicar mensajes.
- **Disabled:** publicar sin bloques o durante persistencia según contrato; mantener movimientos en cola disponibles mientras se guarda, como ya está reparado.

## Código entregado al navegador

Se abrió **Ver código fuente** en Brave. El HTML contiene un `div#root` vacío y módulos compilados: entrada JavaScript, vendor React, Supabase, Radix UI, Framer Motion y stylesheet. Declara Inter Tight, metadatos de tema claro/oscuro y manifest PWA. Estos son indicios verificables del frontend, no acceso al repositorio original ni prueba de las versiones, permisos o arquitectura interna del servidor.

No se extrajeron cookies, tokens, almacenamiento de sesión ni datos de API. No se descargaron/copiaron bundles ni recursos de marca. No se inspeccionaron source maps ni se afirma haber recuperado componentes TSX originales. La recomendación es **reimplementar patrones de interacción con nuestros componentes**, no importar el código compilado de un tercero ni añadir sus dependencias por imitación.

## Tareas concretas para desarrollo

### Alta prioridad
- [ ] Obtener una referencia con bloques cargados y revisar fila, expandir/editar, drag y cálculo sin alterar datos; documentar qué se observó y qué quedó sin probar.
- [ ] Validar una propuesta visual de nuestro editor desktop antes de modificar el flujo estable o posponer gates de Production.
- [ ] Convertir invariantes anteriores en regresiones de cualquier cambio: publicado separado, permisos, entidades normalizadas, cobertura, cola/rollback y teclado.

### Media prioridad
- [ ] Reorganizar toolbar del editor sin cambiar Server Actions ni persistencia.
- [ ] Selector visual de tipos existentes con nombre/descripción y acceso a actividad personalizada; no hardcodear tipos de Tecnoiglesia.
- [ ] Agrupar detalle en contenido común/especializado/avanzado, sin crear un segundo modelo de canciones/mensajes/recursos.
- [ ] Evaluar pestañas por tarea conservando estado de borrador/foco; hacer visible Equipo/Puestos y Modo en vivo sin duplicar sus fuentes de datos.
- [ ] Mejorar búsqueda de bibliotecas sobre datos autorizados; mantener selección ordenada y accesible.

### Baja prioridad
- [ ] Refinar iconos, espaciado y densidad desktop, respetando temas y mobile preview.
- [ ] Evaluar después banner, emoji y exportación PDF; no agregarlos en este cambio sin aceptación de alcance.

### Archivos candidatos y verificación

No se modificaron en esta revisión:
- `src/components/editor/meeting-editor.tsx`: toolbar, alta y detalle contextual. Considerar la extracción ya documentada en `IMPLEMENTATION-NOTES.md` sin mezclar refactor masivo con rediseño.
- `src/components/editor/sortable-block.tsx`: fila, handle, duración, teclado y botones.
- `src/components/editor/new-meeting-form.tsx`: creación/plantilla, si se aprueba unificar el recorrido.
- `src/app/(interno)/cronograma/[id]/page.tsx`: accesos a puestos/live.
- `src/app/globals.css`: layout/densidad y responsive.
- `tests/e2e/` y `tests/e2e-auth/`: probar cancelación del selector sin crear bloques, creación por tipo, selección de biblioteca, guardado/recarga, tabulación, cola/rollback, publicación y mobile.

Al implementar: lint + typecheck + unit/RLS + build + E2E desktop/mobile y revisión visual en ambos temas. Esta inspección **no ejecutó esas suites**, porque no cambió código ejecutable; no reutilizar los resultados anteriores como prueba de un rediseño inexistente.

## Veredicto

**Tomar el flujo y la jerarquía; no clonar la aplicación.** Primero una mejora acotada de alta de bloques, toolbar compacta y detalle contextual. La referencia con programa vacío no basta para decidir cómo reemplazar nuestras filas/reordenamiento. PDF, input list, rich text, playback/BPM y campos de asistentes/ubicación requieren decisión separada si se quieren incorporar. No se modificó el alcance del MVP, los sprints ni los gates pendientes de Production.

## Segundo recorrido: tres bloques cargados — 17/10/2026

El propietario cargó tres bloques en la misma reunión. Se verificaron el árbol accesible y la captura desktop de la lista poblada. Orden observado al comenzar: bienvenida (5 min), lectura sin título (1 min), mensaje (40 min). No se guardaron ni eliminaron contenidos desde Codex y no se consiguió ejecutar un cambio de orden.

### Qué aporta la lista poblada

- **Fila/tarjeta resumida:** handle de seis puntos a la izquierda, icono del tipo, título, duración, resumen de notas cuando existe y acciones a la derecha. La información opcional no ocupa espacio si está vacía.
- **Edición diferenciada de movimiento:** el lápiz y el menú de tres puntos están separados del handle. Se abrió el menú del bloque intermedio: solo se observaron Duplicar/Eliminar, no Subir/Bajar. No se activó ninguna de esas dos acciones.
- **Resumen de duración:** la interfaz mostró **46 de 90 minutos** y **44 minutos restantes**. La suma visible 5+1+40 es consistente. Esto es comprobación aritmética del estado mostrado, no prueba de actualización tras cambiar duraciones ni de un reloj en vivo.
- **Notas contextuales:** las tarjetas con notas muestran un extracto y chevron. No se pudo confirmar el comportamiento de expansión durante este recorrido.
- **Accesibilidad:** el árbol expone tres elementos `sortable` y un anuncio de drop en inglés con UUIDs internos. No basta para afirmar que el teclado funciona; para Crono Unidos conservar botones arriba/abajo y anuncios en español con nombre y posición, no IDs técnicos.

### Cambios propuestos a partir de esta evidencia

1. Usar filas compactas con icono de tipo y detalles opcionales progresivos; mantener en Crono Unidos la **hora calculada por bloque**, que no se vio en las tarjetas de esta captura.
2. Separar claramente handle, selección/edición y menú secundario. No poner toda la tarjeta como zona de arrastre que compita con notas y enlaces.
3. Mantener nuestros controles accesibles de movimiento aunque la referencia use handle. Durante drag, indicar origen/destino, desplazar las otras filas para anticipar la posición y conservar foco al soltar. Son requisitos propuestos, **no una animación de Tecnoiglesia que haya quedado verificada**.
4. Mostrar duración total y fin calculado; si se incorpora una duración objetivo de reunión, distinguir tiempo planificado restante de tiempo restante en vivo. Esa duración objetivo es una decisión separada, no una columna nueva aprobada por esta inspección.
5. Evitar el placeholder persistido «Sin título»: proponer nombre significativo según tipo y validación contextual sin impedir un borrador parcial válido.

### Bloqueo concreto y límites

El control nativo de Brave devolvió `noWindowsAvailable` al intentar scroll/coordenadas, aunque permitió leer accesibilidad/captura y abrir el menú. Escape/Cancel/recarga no mostraron un cambio verificable en ese estado. No se intentó borrar/duplicar para salir. La alternativa Chrome abrió la URL pero mostró una página oscura vacía y snapshot sin contenido; no se verificó sesión ni se ingresaron credenciales. Se pidió dejar Brave visible o abrir la referencia en Chrome.

Por tanto, **no están verificados todavía**: trayectoria/animación del drag, movimiento arriba/abajo, restauración del orden, persistencia tras recargar, expansión de notas, edición del bloque existente y tiempos reales de carga. El anuncio accesible de un drop anterior no demuestra que Codex haya realizado ni observado el movimiento. No se atribuye el bloqueo de automatización a un defecto del sitio.

La propuesta visual queda ampliada con filas reales; la prueba interactiva de movimiento sigue pendiente por acceso. No se modificó código de Crono Unidos, no se ejecutaron suites nuevas y no se cerraron gates de Production.

### Continuación con Brave visible

El propietario confirmó que Brave estaba visible. Una lectura posterior mostró un **cambio de orden realizado fuera de las acciones de Codex**: lectura de 1 min → bienvenida de 5 min → mensaje de 40 min. Antes era bienvenida → lectura → mensaje. El total continuó en 46/90 min y 44 restantes: el cambio de posición no alteró las duraciones visibles. Se verificó el resultado antes/después, **no** la trayectoria del puntero, la animación intermedia ni la persistencia remota. No corresponde restaurar el orden anterior porque el último cambio provino del propietario.

Se abrió por accesibilidad el lápiz de bienvenida: **Editar Bloque** muestra título, duración 5 min, nota existente y Cancelar/Guardar. No se editaron campos ni se pulsó Guardar. Los intentos de Cancelar/cerrar no mostraron cambio verificable; el control nativo de scroll sigue devolviendo `noWindowsAvailable`. Puede quedar abierto ese formulario sin cambios: el propietario puede cerrarlo con Cancelar. No se confirma expansión de notas, éxito de guardado ni prueba de error.

**Conclusión de la revisión disponible:** tomar handle separado, filas resumidas, icono por tipo, detalles opcionales y edición contextual; mantener las horas por fila, controles accesibles, anuncios en español, cola/rollback y modelo de publicación de Crono Unidos. Se completó el análisis de lo observable, pero la validación interactiva de drag/carga/guardado continúa explícitamente limitada por la herramienta. No se debe reintentar indefinidamente ni atribuir este bloqueo a Tecnoiglesia.

### Animación observada en la grabación del propietario

El propietario adjuntó un MOV de **24,15 segundos**. Se inspeccionaron fotogramas locales del recorrido completo y secuencias más densas del timeline entre 8–16 y 16–24 segundos. No se subió el video a servicios externos, no se copió al repositorio ni se controló la aplicación para esta observación. Esto supera la limitación anterior para **observar la animación grabada**, no para probar por cuenta propia la persistencia del sitio.

Comportamiento visible:
- El movimiento se inicia desde el handle izquierdo. El bloque activo acompaña al puntero y aparece atenuado/semitransparente durante el arrastre.
- Los otros bloques se desplazan verticalmente durante el movimiento para anticipar el nuevo orden, antes de soltar; no esperan únicamente al resultado final.
- Se conserva espacio en el listado durante la reorganización y, al soltar, las tarjetas se acomodan en sus posiciones finales.
- En la primera secuencia se observa el mensaje de 40 min pasar desde la última posición hasta la primera, atravesando posiciones intermedias. En la segunda, bienvenida pasa de tercera a segunda. Las duraciones visibles y el resumen 46/90 min con 44 restantes se mantienen.
- No se ve una recarga completa de la página al reordenar. Esto no demuestra si el guardado es local/remoto, si hay debounce, qué petición se hace ni cómo se comporta ante error.

**Referencia de interacción suficiente para diseñar nuestra adaptación:** previsualización del destino mediante desplazamiento de filas, feedback distinguible del bloque activo y asentamiento al soltar. No copiar la atenuación extrema: mantener legible el título y ofrecer reduced-motion. Conservar handle independiente, teclado/botones, anuncio en español, recálculo inmediato de horas y cola/rollback existentes. Duración/easing exactos, uso de overlay, algoritmo de colisión y librería de drag **no se deducen del video**.

Quedan fuera de esta evidencia: guardado tras recargar, fallos de red, rendimiento medido, accesibilidad de teclado/lector y drag táctil. No hacen falta más intentos de acceso a Brave para describir esta animación. Esta actualización es documentación, no una implementación nueva ni cierre de un gate de Production.

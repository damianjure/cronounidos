# PRD v2.0 — Crono Unidos
**Estado:** alcance del MVP aprobado; Sprints 0–4 implementados funcionalmente; Sprint 5 y Production pendientes. **Fecha:** octubre 2026.
**Producto:** PWA de planificación, coordinación y operación de reuniones de Unidos para Servir.

## 1. Objetivo y usuarios
Reemplazar el cronograma estático por una aplicación dinámica: **crear → editar → asignar → confirmar → publicar → operar en vivo → recibir feedback**.
Personas usuarias: administrador, planificador, responsable de equipo, integrante, invitado público.

## 2. Plataforma y diseño
- **PWA instalable desde el primer sprint**, mobile-first. Navegación móvil: Inicio, Cronograma, Calendario, Más.
- Escritorio: barra lateral, timeline/tabla central y detalle lateral, con selector Desktop/Mobile **solo en navegador desktop**. Móvil en navegador o PWA instalada muestra Mobile; pantalla intermedia tablet adaptable.
- Modos claro, oscuro y seguir sistema, elegibles y persistentes.
- Accesibilidad: targets táctiles amplios, lectores de pantalla, navegación teclado y alternativa a drag.
- Aplicación en español rioplatense; zona America/Argentina/Buenos_Aires.

## 3. Reuniones
- Tipo configurable, fecha, hora de inicio, título, serie, notas y estado editorial: borrador, publicada, finalizada, cancelada.
- Conservar **revisión publicada inmutable** mientras se edita otro borrador. Acciones Guardar borrador, Publicar cambios.
- Crear reunión a partir de plantilla o duplicar existente con casillas para copiar estructura/duraciones, equipos/personas, canciones, anuncios, notas y recursos. **Las confirmaciones siempre vuelven a Pendiente al duplicar**.
- Plantillas de reunión por tipo y plantillas/tipos de bloques configurables.

## 4. Cronograma y bloques configurables
- Timeline de bloques con orden y duración; horarios de inicio/fin calculados automáticamente desde hora base. Cambiar orden o duración recalcula el resto de inmediato; persistir con control de concurrencia.
- Drag & drop por handle con mouse/dedo; alternativas accesibles para mover arriba/abajo.
- Tipos iniciales: Prueba de sonido, Intercesión, Alabanza y Adoración, Ofrendas, Bienvenida, Anuncios, Mensaje, Cierre; nuevos tipos (ej. Despedida) sin programar.
- Cada bloque expande responsable(s), duración, notas breves/largas, uno o más enlaces externos a Drive/Canva/etc. y recursos. Opcionales vacíos no aparecen al consultar.
- Campos personalizados por instancia y por tipo de bloque, incluidos texto, número, URL, fecha, selección, checkbox. Campos estructurales (duración, equipo, persona, canción) se conservan como entidades relacionadas.
- Los cambios de un tipo/plantilla afectan por defecto solo nuevas instancias; aplicar a existentes requiere selección y consentimiento explícito si ya publicadas.
- Subactividades paralelas dentro de un bloque principal, cada una con responsable, duración, notas/URLs y offset. No alteran automáticamente el eje lineal principal.

## 5. Información especializada
**Alabanza y Adoración:** líderes, voces, músicos e instrumentos (batería, bajo, guitarra, teclado, roles configurables) y repertorio ordenado; cada canción es registro reutilizable.
**Media:** encargado/director, operador stream, sonido stream, multimedia y cámaras según cantidad.
**FOH/Audio:** sonidista de prueba de sonido o reunión.
**LSA:** equipo propio de lengua de señas argentina, intérpretes.
**Mensaje:** predicador, título, serie, notas y recursos.
**Anuncios:** anuncios seleccionables con título, descripción, presentador, orden, placa opcional, enlaces o archivos.
**Personas:** directorio básico desde MVP y relación a usuarios opcional; equipos y roles múltiples, sin duplicar nombres escritos a mano.
**Recursos:** enlaces seguros externos, subida de imágenes/placas en Supabase Storage bajo permisos.

## 6. Identidad, autorización y visibilidad
- Supabase Auth por email desde MVP, alta por administrador, invitación vía email y autorregistro con aprobación posterior. Google OAuth previsto para etapa 2.
- Permisos configurables por usuario/equipo/acción: administrar, planificar, asignar personas, editar roles, confirmar, consultar notas/contenidos, operar en vivo.
- Integrante puede aceptar/rechazar sus asignaciones; responsables autorizados gestionan las de su equipo. El acceso a otros equipos depende de los permisos.
- **Invitado sin login:** página pública de próximas reuniones publicadas y enlace individual. Se muestra SOLO actividad, hora y duración; nunca personas, predicador, canciones, notas, recursos ni estados de confirmación.
- Aplicar autorización en servidor y RLS, no solamente ocultar elementos de UI.

## 7. Asignaciones, confirmaciones y cobertura
- Una reunión/plantilla define los puestos requeridos por equipo y rol; prioridades **critical**, **required** y **optional**; configurables por tipo y caso.
- Roles críticos iniciales: operador streaming, multimedia y predicador; configurables.
- Estados de asignación: pendiente, confirmado, no disponible; puesto sin asignar como condición distinta. Confirmación manual desde MVP por interesado o autorizado, individual o total de varios roles.
- Si alguien rechaza, registrar historial, puesto queda sin cubrir y podrá designarse reemplazo; conservar trazabilidad.
- Detectar solapamientos; ofrecer reprogramación, reemplazo o guardar excepción justificada.
- Cobertura = puestos (critical+required) cubiertos por asignación vigente confirmada / puestos requeridos (critical+required); no por cantidad de personas únicas. Opcionales excluidos.
- Indicador rojo <60%; amarillo 60%–<90%; verde >=90% **solo si todos los críticos tienen confirmación**. Si algún crítico falta aun con 95%, mostrar amarillo. Sin requerimientos, gris/N/A.
- Mostrar cantidad confirmados, pendientes, no disponibles y vacantes junto al porcentaje.

## 8. Calendario y matriz
- Módulo Calendario: mes actual arriba, **próximas tres reuniones abajo**, cada tarjeta con cantidades y porcentaje.
- Indicador diario tipo círculo dividido en dos semicírculos: uno identifica tipo de reunión (ej. domingo azul, sábado violeta, oración verde), otro representa cobertura (rojo/amarillo/verde/gris). Leyenda y representación accesible sin depender exclusivamente del color.
- Tocar día con una reunión abre ese detalle; con varias muestra selector; día vacío permite crear reunión a usuarios con permiso.
- Desktop muestra títulos de reuniones y matriz de cobertura roles × fechas; móvil tarjetas agrupadas por equipo/reunión.

## 9. Publicación y vistas
Una sola fuente de verdad del plan; vistas pública simplificada, interna según permisos y técnica de alta densidad. No se permiten filtraciones de revisiones privadas hacia endpoints públicos. Recursos externos accesibles según permisos.

## 10. Modo reunión en vivo (INCLUIDO EN MVP)
- Operador autorizado inicia la reunión y marca bloque pendiente/en curso/finalizado, con cronómetro visible por actividad y reloj de referencia del servidor.
- Registrar inicio y fin reales, comparar con previstos y destacar adelanto/demora; recalcular ETA de siguientes bloques.
- Mostrar actividad en curso y siguiente, cambios mediante Supabase Realtime entre dispositivos; recuperación tras desconexión sin corromper estado.
- Un operador autorizado cierra reunión, fijando `closed_at` efectivo y preservando historial.

## 11. Feedback posterior privado (INCLUIDO EN MVP)
- **10 minutos después del cierre real**, crear una solicitud para responsables de área y personas involucradas (sin duplicados por usuario/persona).
- Notificación **in-app** como canal mínimo y correo si hay proveedor habilitado; WhatsApp más adelante.
- Formulario corto: Todo bien / Hubo problema / Algo pendiente / Sugerencia; comentario breve opcional. Registrar estado de solicitud y respuesta.
- **SOLO administradores** pueden leer comentarios y estadísticas identificadas; otros roles no pueden consultar respuestas ajenas. Autor puede enviar una sola respuesta propia y ver el estado de envío sin acceso a comentarios de terceros.
- Trigger/job idempotente (reintentos seguros); no colocar texto de feedback privado en notificaciones visibles a terceros.

## 12. Requerimientos no funcionales
- Seguridad RLS exhaustiva por organización, membresía, equipo y permiso. Aislamiento entre usuarios, aprobaciones y vistas públicas.
- Rendimiento en móviles modestos; edición optimista y rollback; tests de concurrencia.
- Zona horaria IANA y UTC en datos; accesibilidad y soporte PWA/standalone en iOS y Android.
- No cachear datos de usuarios autenticados de forma cruzada; higiene de secrets y logs.
- Unit tests de cálculo horario, cobertura, gates críticos, confirmaciones, duplicación; integración de RLS; E2E clave móvil y desktop.

## 13. MVP: criterios de aceptación
Un planificador autenticado puede crear, duplicar, editar y publicar reuniones; configurar tipos de bloque/campos/plantillas; agregar notas y URL; reordenar con dedo/mouse; asignar músicos/roles/equipos/canciones/anuncios/mensaje; confirmar, detectar vacantes/conflictos; consultar calendario/matriz; operar modo vivo con cronómetro y ETA; cerrar reunión y disparar feedback +10 min, visible solo admin. Invitado navega página pública y ve únicamente horarios, actividades y duración. Usuario puede elegir tema; PWA instalable y switch desktop funcional.

## 14. Fuera del MVP
WhatsApp automático, Google OAuth, sincronización directa con ProPresenter, chat, estadísticas avanzadas, asistencia sofisticada, nativas Android/iOS.

## 15. Entregables de ingeniería
Código Next.js desplegable, migraciones y RLS versionadas, pruebas, documentación de setup, seeds ficticios, previews Vercel y monitoreo básico. Trabajo en sprints según `docs/ROADMAP.md`. Nunca ejecutar SQL remoto en otros proyectos Supabase.

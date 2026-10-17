# Dataset ficticio de Preview — 17/10/2026

## Autorización y entorno

El propietario pidió tres reuniones de mayor a menor cantidad de bloques, equipos funcionales y 20 perfiles de prueba. Confirmó explícitamente **personas del directorio, sin acceso ni correos**. No se crearon usuarios Auth ni se otorgaron permisos de aplicación.

Proyecto Supabase exclusivo `ivmhgizuofxdvvvzdxnl`, organización `unidos` (`fdc4c62b-d3a2-40d8-891c-d46f1b79c84a`). No se tocó otro proyecto ni se activó Production. Todo marcado `DEMO` / apellido `Demo NN`, sin contactos ni datos reales.

## Reuniones nuevas

| Reunión | Fecha y hora (Argentina) | Bloques | Duración | ID |
|---|---|---:|---:|---|
| DEMO 01 · Celebración general | 25/10/2026 10:30–12:30 | 12 | 120 min | `f6f1d510-a9b3-44ba-aefd-e6959e1b4329` |
| DEMO 02 · Encuentro de jóvenes | 28/10/2026 19:30–20:45 | 8 | 75 min | `cc7cda50-60f0-487a-9c81-16a4c191f4ab` |
| DEMO 03 · Reunión de oración | 31/10/2026 18:00–18:45 | 4 | 45 min | `cfb972d9-a4d1-44a2-9f83-1c0f87e5909d` |

Las tres permanecen **draft**, versión 2, sin revisión publicada ni cierre. Sus bloques pueden ser públicos al publicar, pero hoy no aparecen en la agenda pública. No se inició el modo vivo ni el circuito de feedback.

## Equipos, personas y roles funcionales

Cada persona tiene una pertenencia al equipo; el rol se expresa en las asignaciones normalizadas, **no es un permiso ni una cuenta de usuario**.

| Equipo DEMO | Personas ficticias | Roles |
|---|---|---|
| Música | Alex 01, Sam 02, Ariel 03, Dani 04 | Dirección musical, voz, guitarra, teclado |
| Audio | Luca 05, Noa 06, Cris 07 | FOH, escenario, monitores |
| Media | Nico 08, Fran 09, Vale 10, Paz 11 | Streaming, multimedia, cámara, dirección de cámaras |
| Anfitriones | Sol 12, Emi 13, Ren 14 | Bienvenida, anfitrión, sala |
| LSA | Robin 15, Kim 16 | Interpretación y relevo |
| Coordinación | Charlie 17, Sasha 18, Morgan 19, Taylor 20 | Conducción, predicación, oración, producción |

Total: **20 personas, 6 equipos, 20 roles, 20 pertenencias, 12 tipos de bloque y 3 tipos de reunión**. La celebración usa a las veinte personas. Hay **14 puestos** (8/4/2 por reunión), **37 responsabilidades de bloque** y **51 asignaciones pendientes**. No se inventaron respuestas de confirmación. Incluye prioridades críticas/requeridas/opcionales y tres tareas paralelas sin extender los totales. No se cargaron canciones, mensajes ni anuncios en bibliotecas: los títulos de actividades son ejemplos, no entidades de contenido asociadas.

## Método y límites

1. Crear los tres borradores por el formulario de la Preview con la sesión aprobada existente.
2. Validar localmente el fixture contra las 33 migraciones en PGlite.
3. Ejecutar por MCP una **transacción administrativa de datos**: `scripts/fixtures/preview-demo-2026-10-17.sql`. No es una migración ni el `supabase/seed.sql` general. No suplanta `auth.uid()`, no modifica RLS, grants o esquemas. El audit de asignaciones queda con actor nulo, propio de carga administrativa, no como respuesta de un integrante.
4. La transacción bloquea únicamente esos tres IDs, exige borradores vacíos versión 1 y falla si hubo edición/publicación/carga anterior. Conserva los `created_by` de las revisiones creadas legítimamente por UI y completa sus borradores nunca publicados. Incrementa la versión para impedir escrituras obsoletas de editores abiertos.
5. Verificar conteos SQL y Chrome: tres editores con horarios, tipos, responsables y paralelas; puestos con prioridades y sin solapamientos; directorio con personas/equipos.

**No volver a ejecutar en remoto**: falla deliberadamente ante una segunda carga, sin duplicar. Si se desea otro dataset, crear uno nuevo con IDs y autorización propios. No hay script de borrado; cualquier limpieza debe especificar IDs y conservar datos/historial que el propietario haya empezado a editar.

## Evidencia y pruebas

- `node scripts/fixtures/verify-preview-demo.mjs`: pasa en base efímera local; aplica todas las migraciones, valida conteos/horarios, rechaza organización incorrecta, versión editada y segunda ejecución, sin duplicados. No usa red ni credenciales.
- SQL remoto: tres borradores 12/8/4, 120/75/45 minutos; 20 personas, seis equipos, veinte roles; 51 `pending`. Auth/perfiles/membresías/grants siguen **2/2/2/2** y outbox **1**.
- Las dos reuniones preexistentes (`Domingo` y `Prueba técnica de correo`) conservan exactamente los hashes de fila anteriores a la carga. No se escribieron sus bloques/revisiones.
- Chrome: se abrieron los tres editores y sus totales/horas de fin correctas; puestos de la celebración muestran asignaciones y «Sin solapamientos detectados»; directorio muestra las veinte personas ficticias y los equipos.
- Esto prueba integridad y representación del dataset. **No sustituye E2E de creación/asignación por UI, RLS multirol, PWA física ni los gates de Production**. No se repitió build ni E2E completo porque no cambió el código de la aplicación.

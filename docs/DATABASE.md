# Modelo relacional conceptual — Supabase

Diseño inicial; Codex debe escribir migraciones SQL versionadas y pruebas RLS. UUID como PK, `org_id` en tablas de dominio, UTC para timestamps, zonas IANA para reuniones.

## Organización, identidad y permisos
- `organizations(id, name, slug, timezone)`
- `people(id, org_id, first_name, last_name, active)`
- `profiles(user_id, person_id nullable, display_name, approved_at nullable)`
- `memberships(id, org_id, user_id, status)`
- `teams(id, org_id, name, active)`
- `roles(id, org_id, team_id nullable, name, active)`
- `team_memberships(id, team_id, person_id)`
- `permission_grants(id, org_id, subject_user_id, team_id nullable, permission, granted_by)`

## Reuniones, plantillas y cronograma
- `meeting_types(id, org_id, name, color)`
- `series(id, org_id, title)`
- `meeting_templates(id, org_id, name, definition_version, definition_json)`
- `block_types(id, org_id, name, field_schema_json, version)`
- `meetings(id, org_id, meeting_type_id, date, timezone, start_local_time, status, published_revision_id nullable, closed_at nullable)`
- `meeting_revisions(id, meeting_id, revision, created_by, published_at nullable)`
- `meeting_blocks(id, revision_id, block_type_id, sort_order, name, duration_seconds, notes, custom_fields_json, visibility)`
- `block_subactivities(id, block_id, title, offset_seconds, duration_seconds, notes, custom_fields_json)`
- `meeting_required_positions(id, meeting_id, team_id, role_id, priority, quantity_index)` donde prioridad = critical / required / optional.
- `assignments(id, meeting_id, position_id nullable, block_id nullable, person_id, status, responded_at, replaced_by_id nullable)`
- `assignment_events(id, assignment_id, event, actor_user_id, at, details_json)`
- `assignment_conflict_exceptions(id, meeting_id, person_id, assignment_1_id, assignment_2_id, justification, approved_by)`

## Contenido
- `songs(id, org_id, title, artist, active, external_ids_json)`
- `block_songs(id, block_id, song_id, sort_order)`
- `announcements(id, org_id, title, description, active)`
- `block_announcements(id, block_id, announcement_id, sort_order)`
- `messages(id, org_id, series_id, title, preacher_person_id)`
- `resources(id, org_id, title, url nullable, storage_path nullable, resource_type)`
- `resource_links(id, resource_id, block_id nullable, announcement_id nullable)`

## Ejecución en vivo, feedback y notificaciones
- `meeting_live_state(meeting_id, active_block_id, status, started_at, closed_at, version, updated_by)`
- `block_executions(id, meeting_id, block_id, actual_started_at, actual_ended_at, status, actor_user_id)`
- `meeting_live_events(id, meeting_id, event, actor_user_id, created_at, payload_json)`
- `feedback_requests(id, meeting_id, person_id, user_id nullable, due_at, status, delivery_channel, attempts, last_attempt_at)` con unicidad por reunión/persona.
- `meeting_feedback(id, request_id, meeting_id, org_id, submitted_by, category, comment, created_at)` con unicidad por solicitud.
- `notifications(id, org_id, user_id, type, payload_json, status, created_at, read_at)`
- `outbound_messages(id, request_id, channel, provider_id, status, attempts, error_code)`

## Reglas obligatorias
- RLS granular por tabla; usuario registrado no implica miembro aprobado.
- Rechazos y reemplazos conservan historial. Confirmaciones de reunión duplicada siempre pendiente.
- Agenda pública consulta SOLO actividades, inicio calculado y duración de revisiones publicadas.
- Feedback: solo administradores SELECT de respuestas; autores INSERT de feedback propio solicitado (sin lectura de comentarios ajenos).
- No ejecutar migrations en proyectos Supabase ajenos. Seeds con datos completamente ficticios.

## Extensiones Sprint 3
- RPCs estrechas de puestos: `configure_meeting_position`, `adjust_meeting_position`, `staff_meeting_position`, `get_meeting_staffing`; sin CRUD directo de puestos para authenticated. Lock de reunión + versión esperada; reemplazo también compara ID/estado/fecha de respuesta. Eliminar solo puestos sin historial.
- `template_position_definition` exporta requisitos agrupados; `create_editor_meeting` copia `definition_json.requiredPositions` sin asignaciones. `coverage_matrix` devuelve roles/estados agregados por reunión, no identidades.
- `private.staffing_exceptions`: huella de ocupaciones/persona/tiempos, motivo, autor/fecha; RLS sin grants API. RPCs `get_staffing_conflicts` y `justify_staffing_conflict` controlan alcance.
- `private.block_replacements`: propuestas de responsable anterior/sucesor, activadas al cambiar revisión publicada. RLS sin grants API; `replace_block_person` escribe borrador sin devolver contenido privado, `get_block_staffing` proyecta responsables autorizados.
- Sustituciones: FK de sucesor diferida y constraint trigger al final de transacción validan relación y ausencia de ciclos; historial anterior permanece intacto.

### Implementación física de feedback (Sprint 5, parcial)

`private.live_participants` conserva la identidad capturada; `private.feedback_requests` conserva destinatario, vencimiento y estado; `private.meeting_feedback` guarda categoría/comentario/autor sin acceso de tabla para clientes. La política de SELECT de respuestas es exclusivamente administrativa, además del guard del RPC `admin_meeting_feedback`. `public.personal_notifications` expone únicamente avisos propios a miembros aprobados (RLS), sin texto de feedback. Los RPC personales son `my_feedback_requests` (solo estado) y `submit_meeting_feedback` (una respuesta, reintento idéntico permitido). Ningún cliente puede ejecutar `private.dispatch_due_feedback`.

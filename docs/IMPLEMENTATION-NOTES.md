# Notas de implementación de Sprints 0/1

Estas son concretizaciones técnicas del PRD, no cambios del alcance aprobado.

## Privacidad de columnas

RLS controla filas, no oculta columnas. Por eso `meeting_blocks` contiene estructura/horarios y `block_details` contiene notas y custom fields con permiso `read_content`. `read_agenda` no concede acceso a notas. `public_agenda` es el único acceso anon; su proyección tiene meeting_id (para el enlace), actividad, instante de inicio, duración, zona horaria (para representar el horario) y orden. Nunca devuelve título interno, personas, canciones, notas ni recursos.

Los SECURITY DEFINER están aislados en schema no expuesto `private`, o son RPCs públicas mínimas justificadas (public_agenda/operaciones atómicas), con search_path vacío y EXECUTE explícito. Las operaciones privilegiadas validan `auth.uid`, membresía aprobada, perfil aprobado y permiso real; las funciones de triggers no son APIs públicas. La excepción deliberada es la proyección pública, permitida a anon sin identidad.

El correo Auth se proyecta a `profiles.email` por triggers confiables para identificar solicitudes de aprobación. Solo el propio usuario y administradores autorizados pueden leer ese perfil; los clientes no pueden modificar el correo proyectado. El email canónico sigue en Auth, no en los grants.

## Versiones y orden

La revisión tiene su propio `scheduled_start`/timezone. Publicar usa row lock + `p_expected_version`; incrementa `meetings.version` y cambia puntero/revisión atómicamente. Triggers impiden alterar/eliminar contenido publicado. Grants de columna evitan actualizar directamente los campos editoriales sensibles. Las instancias copian schema/version del tipo de bloque al crearse. Aplicar cambios de tipo/plantilla a anteriores requiere el flujo explícito del futuro editor, no un UPDATE masivo automático.

Posiciones/asignaciones todavía son del encuentro, como en DATABASE.md. El editor futuro debe preservar su historial al clonar/publicar y no usarlas como texto libre en templates. Los vínculos a bibliotecas son normalizados; si se necesita congelar atributos de biblioteca para edición histórica, implementar snapshots de esos atributos en el sprint del editor, sin duplicar personas como strings.

## Autorización

Los permisos se almacenan en la DB, no JWT metadata. La aprobación de perfil no basta: cada org requiere membership approved. Suspender un miembro revoca DB reads/actions con el JWT actual. Las identidades personales solo pueden vincularse mediante RPC admin; unique(person_id) evita que dos cuentas confirmen como la misma persona. El MVP opera en la primera membresía aprobada (orden UUID determinista); un selector multi-organización es futuro, sin renunciar al aislamiento RLS.

Presets aditivos tras aprobación; ACL granular administrable desde el panel. Admin es global de org; plan/agenda requieren grant global en estas rutas; las acciones de equipo consultan grants con team_id explícito. No generar permisos globales a partir de un grant de equipo. Mantener autoría/historial; suspensión es preferible a borrar usuarios vinculados a ejecuciones/historial.

## UI y validación

Base visual: azul petróleo #163c53, acento azul #165c7d, superficies claras #f1f5f7/#fff y tema oscuro. Tipografía del sistema/Avenir, alineación izquierda y densidad de escritorio; una agenda clara antes que estadísticas falsas. Tailwind 4 y primitivas Slot/CVA con tokens CSS; dnd-kit instalado sin fingir editor listo. La revisión de código siguió el checklist React (guards de Server Actions, separación client/server, caché React por request para auth, sin caché cross-user); no hubo revisión visual exitosa por el bloqueo de navegador.

Next usa `proxy.ts` y `getUser` para verificación/renovación de sesión; acceso normal por RLS, sin service-role. Build webpack evita depender de binarios de Turbopack del host. Outputs alternativos son configurables solo para repetir validación sin limpiar carpetas restringidas. No se deshabilitaron tests ni RLS para conseguir resultados verdes.

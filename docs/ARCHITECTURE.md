# Arquitectura técnica — MVP

## Componentes
- Frontend y rutas de servidor: Next.js App Router, React, TypeScript strict.
- UI: Tailwind, shadcn/ui, dnd-kit; diseño responsive mobile-first, accesible y modo light/dark/system.
- Backend: Supabase Auth, PostgreSQL, RLS, Storage y Realtime; lógica de negocio sensible en servidor/consultas atómicas.
- Alojamiento: Vercel vinculado al repositorio GitHub.
- PWA: manifest + service worker. Cuidado con cachés: no dejar datos privados de usuarios anteriores tras logout.
- Automatizaciones: scheduler/worker idempotente para crear solicitudes de feedback al cumplirse +10 min del cierre real; canal in-app mínimo y email al configurar proveedor.

## Publicación versionada
`meetings` mantiene revisión publicada activa y revisión borrador opcional. La página pública y lectores internos consultan solo la versión publicada hasta acción `Publicar cambios`. Versiones transaccionales; no duplicar accidentalmente confirmaciones ni alterar historial. Los eventos de ejecución en vivo se vinculan a revisión publicada/congelada.

## Cálculo y cobertura
- Horarios planificados derivados de fecha/zona IANA + inicio local + orden/duraciones, almacenando instantes UTC cuando corresponda. Subactividades paralelas no modifican la línea temporal principal.
- Cobertura = puestos requeridos (critical+required) con asignación vigente confirmada / total de puestos requeridos. Opcionales fuera del denominador. Roles críticos ausentes = máximo amarillo. Denominador 0 = gris.
- Concurrencia: actualización optimista + versión para detectar ediciones conflictivas + rollback/refresh.

## Privacidad y permisos
- Múltiples organizaciones posibles mediante org_id aunque el MVP use una.
- Membresía y aprobación distintas de simple login. Autorización por organización, equipo y acción, no por metadata editable del usuario.
- Datos públicos expuestos solo mediante un endpoint/consulta filtrada segura, no SELECT sobre tablas internas.
- RLS en cada tabla del esquema expuesto. Los feedbacks privados solo pueden leerlos administradores autorizados. El usuario puede enviar una respuesta válida, no acceder a comentarios de otros.
- Auditoría para respuestas de confirmación, reemplazos, conflictos y operaciones en vivo.

## Futuro
WhatsApp Business Platform para convocatorias y respuestas; importación/sincronización de biblioteca ProPresenter; Google OAuth y ampliación a nativo si se justifica. No bloquear estas integraciones con modelos de datos exclusivamente textuales.

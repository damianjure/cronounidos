-- Verificación de despliegue del scheduler de feedback (17/10/2026).
-- Las migraciones emiten solo NOTICE si faltan pg_cron/pg_net (PGlite); este
-- script FALLA si un entorno real quedó sin scheduler. Solo lectura.
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-scheduler.sql
-- o pegarlo en el SQL Editor de Supabase.
do $$
declare missing text[] := array[]::text[];
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    missing := missing || 'extensión pg_cron';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    missing := missing || 'extensión pg_net';
  end if;
  if to_regclass('cron.job') is not null then
    if not exists (select 1 from cron.job where jobname = 'crono-unidos-feedback-dispatch' and active) then
      missing := missing || 'job activo crono-unidos-feedback-dispatch';
    end if;
    if not exists (select 1 from cron.job where jobname = 'crono-unidos-feedback-email' and active) then
      missing := missing || 'job activo crono-unidos-feedback-email';
    end if;
  end if;
  if array_length(missing, 1) > 0 then
    raise exception 'Scheduler de feedback NO operativo. Falta: %', array_to_string(missing, ', ');
  end if;
  raise notice 'Scheduler de feedback: extensiones y jobs activos presentes.';
end $$;
-- Últimas ejecuciones (revisar que figuren como succeeded):
select j.jobname, d.status, d.start_time
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
 where j.jobname like 'crono-unidos-feedback-%'
 order by d.start_time desc
 limit 10;

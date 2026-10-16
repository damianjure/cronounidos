-- Embedded SQL test engines do not ship pg_cron. Real Supabase environments
-- must expose this extension and must be checked for an active job after push.
do $$
begin
 if exists(select 1 from pg_catalog.pg_available_extensions where name='pg_cron') then
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('crono-unidos-feedback-dispatch','* * * * *','select private.dispatch_due_feedback()');
 else
  raise notice 'pg_cron unavailable: feedback scheduler is NOT installed. Verify deployment gate before production.';
 end if;
end $$;

-- pg_net is absent in some hosted projects even when present in the local
-- image. Enable it reproducibly; no HTTP is issued without owner Vault opt-in.
do $$begin
 if exists(select 1 from pg_available_extensions where name='pg_net') then
  create extension if not exists pg_net with schema extensions;
 else
  raise notice 'pg_net unavailable: feedback email HTTP scheduling is NOT operational';
 end if;
end $$;

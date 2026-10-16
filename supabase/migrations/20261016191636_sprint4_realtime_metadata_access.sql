-- Realtime's subscription_check_filters runs as supabase_realtime_admin and
-- discovers filter columns through information_schema, which hides columns that
-- role cannot access. It needs metadata visibility for the filter PK, not anon
-- grants or an RLS bypass. Keep all other columns inaccessible to this role.
do $$begin
 if exists(select 1 from pg_roles where rolname='supabase_realtime_admin') then
 grant select(meeting_id) on public.meeting_live_state to supabase_realtime_admin;
 end if;
end $$;

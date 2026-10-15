-- The optional Supabase Dashboard "automatic RLS" event-trigger function is
-- SECURITY DEFINER. It is not an API endpoint and must not be executable by
-- anon or authenticated users. The event trigger itself remains installed.
do $migration$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$migration$;

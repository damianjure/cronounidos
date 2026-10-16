-- NULL must not bypass optimistic concurrency (SQL <> NULL evaluates to NULL).
-- Replace only the four known guards; CREATE OR REPLACE preserves each ACL.
do $migration$
declare signature text; definition text;
begin
  foreach signature in array array[
    'public.save_team_block_notes(uuid,uuid,uuid,integer,text)',
    'public.save_team_block_fields(uuid,uuid,uuid,integer,jsonb)',
    'public.add_team_block_url(uuid,uuid,uuid,integer,text,text)',
    'public.remove_team_block_resource(uuid,uuid,uuid,integer,uuid)'
  ] loop
    definition = pg_catalog.pg_get_functiondef(signature::regprocedure);
    if position('if m.version <> p_expected_version then' in definition) = 0 then
      raise exception 'Expected version guard not found in %', signature;
    end if;
    execute replace(definition,
      'if m.version <> p_expected_version then',
      'if p_expected_version is null or m.version <> p_expected_version then');
  end loop;
end
$migration$;

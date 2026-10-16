-- Repair scoped ownership and optimistic concurrency without rewriting applied migrations.
do $migration$
declare signature text; definition text; old_guard text;
begin
  foreach signature in array array[
    'public.save_team_block_notes(uuid,uuid,uuid,integer,text)',
    'public.save_team_block_fields(uuid,uuid,uuid,integer,jsonb)',
    'public.add_team_block_url(uuid,uuid,uuid,integer,text,text)',
    'public.remove_team_block_resource(uuid,uuid,uuid,integer,uuid)',
    'public.edit_team_block_responsible(uuid,uuid,uuid,integer,text,uuid,uuid,uuid)'
  ] loop
    definition = pg_catalog.pg_get_functiondef(signature::regprocedure);
    old_guard = 'block->>''teamId'' <> p_team::text';
    if position(old_guard in definition) = 0 then
      raise exception 'Expected team guard not found in %', signature;
    end if;
    execute replace(definition, old_guard, '(block->>''teamId'') is distinct from p_team::text');
  end loop;
  foreach signature in array array[
    'public.save_editor_snapshot(uuid,integer,jsonb,jsonb)',
    'public.publish_revision(uuid,uuid,integer)',
    'public.cancel_editor_meeting(uuid,integer)'
  ] loop
    definition = pg_catalog.pg_get_functiondef(signature::regprocedure);
    old_guard = 'm.version<>p_expected_version';
    if position(old_guard in definition) = 0 then
      raise exception 'Expected version guard not found in %', signature;
    end if;
    execute replace(definition, old_guard, '(p_expected_version is null or m.version<>p_expected_version)');
  end loop;
  definition = pg_catalog.pg_get_functiondef('public.apply_template_selected(uuid,integer,jsonb)'::regprocedure);
  old_guard = 't.definition_version <> p_template_version';
  if position(old_guard in definition) = 0 then
    raise exception 'Expected template version guard not found';
  end if;
  execute replace(definition, old_guard, '(p_template_version is null or t.definition_version <> p_template_version)');

  definition = pg_catalog.pg_get_functiondef('public.duplicate_editor_meeting(uuid,jsonb,jsonb)'::regprocedure);
  old_guard = 'b=jsonb_set(b,''{responsibles}'',''[]'');';
  if position(old_guard in definition) = 0 then
    raise exception 'Expected duplicate responsibles clause not found';
  end if;
  execute replace(definition, old_guard,
    old_guard || ' b=jsonb_set(b,''{subactivities}'',coalesce((select jsonb_agg(jsonb_set(s,''{personId}'',''null''::jsonb)) from jsonb_array_elements(b->''subactivities'') s),''[]''::jsonb));');
end
$migration$;

-- Catalog changes must not silently mutate the bytes or metadata of a published resource.
-- Keep INSERT for new resources; all changes/deletions use narrow RPCs after link checks.
revoke update, delete on public.resources from authenticated;

create function public.update_unlinked_url_resource(
  p_resource uuid, p_title text, p_url text, p_resource_type text
) returns void language plpgsql security definer set search_path = '' as $$
declare r public.resources;
begin
  select * into r from public.resources where id = p_resource for update;
  if r.id is null or not private.can(r.org_id, 'plan') or not private.can(r.org_id, 'read_content') then
    raise exception 'Forbidden';
  end if;
  if r.storage_path is not null or exists(select 1 from public.resource_links where resource_id=r.id) then
    raise exception 'Resource in use';
  end if;
  if length(trim(p_title)) not between 1 and 200 or length(p_url) > 2048
    or p_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    or p_resource_type not in ('link','image','slide','document') then
    raise exception 'Invalid resource';
  end if;
  update public.resources set title=trim(p_title), url=p_url, resource_type=p_resource_type where id=r.id;
end
$$;

create function public.delete_unlinked_url_resource(p_resource uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.resources;
begin
  select * into r from public.resources where id=p_resource for update;
  if r.id is null or not private.can(r.org_id,'plan') or not private.can(r.org_id,'read_content') then
    raise exception 'Forbidden';
  end if;
  if r.storage_path is not null or exists(select 1 from public.resource_links where resource_id=r.id) then
    raise exception 'Resource in use';
  end if;
  delete from public.resources where id=r.id;
end
$$;
revoke all on function public.update_unlinked_url_resource(uuid,text,text,text),
  public.delete_unlinked_url_resource(uuid) from public,anon;
grant execute on function public.update_unlinked_url_resource(uuid,text,text,text),
  public.delete_unlinked_url_resource(uuid) to authenticated;

-- No authenticated Storage DELETE policy remains: only an authorized server
-- action may remove bytes using the server-only secret after querying the
-- cleanup queue. Revoking direct DELETE also protects linked published files.
do $storage$
begin
  if pg_catalog.to_regclass('storage.objects') is null then return; end if;
  execute 'drop policy if exists crono_resources_delete on storage.objects';
end
$storage$;

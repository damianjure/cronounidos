-- Only a team's own block fields are projected. Definitions are immutable here;
-- the trusted snapshot, not client input, supplies the validation schema.
create or replace function public.get_team_block_notes(p_meeting uuid, p_team uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.meetings; snapshot jsonb;
begin
  select * into m from public.meetings where id = p_meeting;
  if m.id is null or m.status in ('finished', 'cancelled')
    or not exists(select 1 from public.teams where id = p_team and org_id = m.org_id)
    or not private.can(m.org_id, 'plan', p_team)
    or not private.can(m.org_id, 'read_content', p_team) then
    raise exception 'Forbidden';
  end if;
  snapshot = private.editor_snapshot(m.id);
  return jsonb_build_object(
    'meetingId', m.id,
    'version', m.version,
    'title', m.title,
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b->'id', 'name', b->'name', 'notes', b->'notes',
        'fieldSchema', b->'fieldSchema', 'customFields', b->'customFields'
      ))
      from jsonb_array_elements(snapshot->'blocks') b
      where b->>'teamId' = p_team::text
    ), '[]'::jsonb)
  );
end
$$;

create function public.save_team_block_fields(
  p_meeting uuid, p_team uuid, p_block uuid, p_expected_version integer, p_values jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.meetings; snapshot jsonb; block jsonb; blocks jsonb = '[]'::jsonb; found_block boolean = false; revision uuid;
begin
  select * into m from public.meetings where id = p_meeting for update;
  if m.id is null or m.status in ('finished', 'cancelled')
    or not exists(select 1 from public.teams where id = p_team and org_id = m.org_id)
    or not private.can(m.org_id, 'plan', p_team)
    or not private.can(m.org_id, 'read_content', p_team) then
    raise exception 'Forbidden';
  end if;
  if m.version <> p_expected_version then raise exception 'Version conflict'; end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or length(p_values::text) > 16384 then
    raise exception 'Invalid custom fields';
  end if;
  snapshot = private.editor_snapshot(m.id);
  for block in select value from jsonb_array_elements(snapshot->'blocks') loop
    if block->>'id' = p_block::text then
      if block->>'teamId' <> p_team::text then raise exception 'Forbidden'; end if;
      perform private.check_fields(block->'fieldSchema', p_values);
      block = jsonb_set(block, '{customFields}', p_values);
      found_block = true;
    end if;
    blocks = blocks || jsonb_build_array(block);
  end loop;
  if not found_block then raise exception 'Forbidden'; end if;
  revision = private.write_editor_revision(m.id, snapshot->'metadata', blocks);
  update public.meetings set draft_revision_id = revision, version = version + 1 where id = m.id;
  return public.get_team_block_notes(m.id, p_team);
end
$$;

revoke all on function public.save_team_block_fields(uuid,uuid,uuid,integer,jsonb) from public, anon;
grant execute on function public.save_team_block_fields(uuid,uuid,uuid,integer,jsonb) to authenticated;

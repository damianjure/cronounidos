-- Team-scoped note edits never send the full revision to the caller.
create function public.team_note_editor_teams(p_org uuid)
returns table(id uuid, name text) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member(p_org) then raise exception 'Forbidden'; end if;
  return query select t.id, t.name from public.teams t
    where t.org_id = p_org and t.active
      and private.can(p_org, 'plan', t.id)
      and private.can(p_org, 'read_content', t.id)
    order by t.name;
end
$$;

create function public.get_team_block_notes(p_meeting uuid, p_team uuid)
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
      select jsonb_agg(jsonb_build_object('id', b->'id', 'name', b->'name', 'notes', b->'notes'))
      from jsonb_array_elements(snapshot->'blocks') b
      where b->>'teamId' = p_team::text
    ), '[]'::jsonb)
  );
end
$$;

create function public.save_team_block_notes(
  p_meeting uuid, p_team uuid, p_block uuid, p_expected_version integer, p_notes text
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
  if p_notes is null or length(p_notes) > 12000 then raise exception 'Invalid notes'; end if;
  snapshot = private.editor_snapshot(m.id);
  for block in select value from jsonb_array_elements(snapshot->'blocks') loop
    if block->>'id' = p_block::text then
      if block->>'teamId' <> p_team::text then raise exception 'Forbidden'; end if;
      block = jsonb_set(block, '{notes}', to_jsonb(p_notes));
      found_block = true;
    end if;
    blocks = blocks || jsonb_build_array(block);
  end loop;
  if not found_block then raise exception 'Forbidden'; end if;
  -- The privileged writer copies inaccessible blocks, links, people and custom
  -- fields without returning them to the team editor or accepting them as input.
  revision = private.write_editor_revision(m.id, snapshot->'metadata', blocks);
  update public.meetings set draft_revision_id = revision, version = version + 1 where id = m.id;
  return public.get_team_block_notes(m.id, p_team);
end
$$;

revoke all on function public.team_note_editor_teams(uuid),
  public.get_team_block_notes(uuid,uuid),
  public.save_team_block_notes(uuid,uuid,uuid,integer,text) from public, anon;
grant execute on function public.team_note_editor_teams(uuid),
  public.get_team_block_notes(uuid,uuid),
  public.save_team_block_notes(uuid,uuid,uuid,integer,text) to authenticated;

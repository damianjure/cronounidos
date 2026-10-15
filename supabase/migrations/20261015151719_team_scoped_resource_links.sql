-- Team editors may only see links on their own blocks. Adding an external URL
-- creates a normal catalog resource; removing a link never deletes history.
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
    'meetingId', m.id, 'version', m.version, 'title', m.title,
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b->'id', 'name', b->'name', 'notes', b->'notes',
        'fieldSchema', b->'fieldSchema', 'customFields', b->'customFields',
        'resources', coalesce((
          select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'url', r.url) order by link.ord)
          from jsonb_array_elements_text(coalesce(b->'resourceIds', '[]'::jsonb)) with ordinality as link(resource_id, ord)
          join public.resources r on r.id = link.resource_id::uuid and r.org_id = m.org_id
        ), '[]'::jsonb)
      ))
      from jsonb_array_elements(snapshot->'blocks') b
      where b->>'teamId' = p_team::text
    ), '[]'::jsonb)
  );
end
$$;

create function public.add_team_block_url(
  p_meeting uuid, p_team uuid, p_block uuid, p_expected_version integer,
  p_title text, p_url text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.meetings; snapshot jsonb; block jsonb; blocks jsonb = '[]'::jsonb; found_block boolean = false; revision uuid; resource uuid;
begin
  select * into m from public.meetings where id = p_meeting for update;
  if m.id is null or m.status in ('finished', 'cancelled')
    or not exists(select 1 from public.teams where id = p_team and org_id = m.org_id)
    or not private.can(m.org_id, 'plan', p_team)
    or not private.can(m.org_id, 'read_content', p_team) then
    raise exception 'Forbidden';
  end if;
  if m.version <> p_expected_version then raise exception 'Version conflict'; end if;
  if p_title is null or length(trim(p_title)) not between 1 and 200 then raise exception 'Invalid title'; end if;
  if p_url is null or length(p_url) > 2048
    or p_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
    raise exception 'Invalid URL';
  end if;
  snapshot = private.editor_snapshot(m.id);
  for block in select value from jsonb_array_elements(snapshot->'blocks') loop
    if block->>'id' = p_block::text then
      if block->>'teamId' <> p_team::text then raise exception 'Forbidden'; end if;
      if jsonb_array_length(coalesce(block->'resourceIds', '[]'::jsonb)) >= 100 then raise exception 'Too many links'; end if;
      insert into public.resources(org_id, title, url, resource_type)
        values(m.org_id, trim(p_title), p_url, 'link') returning id into resource;
      block = jsonb_set(block, '{resourceIds}', coalesce(block->'resourceIds', '[]'::jsonb) || jsonb_build_array(resource));
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

create function public.remove_team_block_resource(
  p_meeting uuid, p_team uuid, p_block uuid, p_expected_version integer, p_resource uuid
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
  snapshot = private.editor_snapshot(m.id);
  for block in select value from jsonb_array_elements(snapshot->'blocks') loop
    if block->>'id' = p_block::text then
      if block->>'teamId' <> p_team::text then raise exception 'Forbidden'; end if;
      if not coalesce(block->'resourceIds', '[]'::jsonb) @> jsonb_build_array(p_resource) then
        raise exception 'Resource not linked';
      end if;
      block = jsonb_set(block, '{resourceIds}', coalesce((
        select jsonb_agg(to_jsonb(link.value) order by link.ord)
        from jsonb_array_elements_text(block->'resourceIds') with ordinality as link(value, ord)
        where link.value <> p_resource::text
      ), '[]'::jsonb));
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

revoke all on function public.add_team_block_url(uuid,uuid,uuid,integer,text,text),
  public.remove_team_block_resource(uuid,uuid,uuid,integer,uuid) from public, anon;
grant execute on function public.add_team_block_url(uuid,uuid,uuid,integer,text,text),
  public.remove_team_block_resource(uuid,uuid,uuid,integer,uuid) to authenticated;

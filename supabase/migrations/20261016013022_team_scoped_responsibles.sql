-- Scoped assignments never expose or replace responsibilities of another team.
create function private.team_responsibles_allowed(p_org uuid, p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and private.can(p_org, 'plan', p_team)
    and private.can(p_org, 'read_content', p_team)
    and private.can(p_org, 'assign', p_team)
    and private.can(p_org, 'read_people', p_team)
    and exists(select 1 from public.teams where id = p_team and org_id = p_org and active)
$$;
revoke all on function private.team_responsibles_allowed(uuid,uuid) from public, anon, authenticated;

create function public.get_team_block_responsibles(p_meeting uuid, p_team uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare m public.meetings; snapshot jsonb;
begin
  select * into m from public.meetings where id = p_meeting;
  if m.id is null or m.status in ('finished', 'cancelled')
    or not private.team_responsibles_allowed(m.org_id, p_team) then raise exception 'Forbidden'; end if;
  snapshot = private.editor_snapshot(m.id);
  return jsonb_build_object(
    'version', m.version,
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.first_name || ' ' || p.last_name) order by p.first_name,p.last_name,p.id)
      from public.people p join public.team_memberships tm on tm.org_id = p.org_id and tm.person_id = p.id
      where p.org_id = m.org_id and tm.team_id = p_team and p.active), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by r.name,r.id)
      from public.roles r where r.org_id = m.org_id and (r.team_id = p_team or r.team_id is null) and r.active), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('id', b->'id', 'responsibles', coalesce((
      select jsonb_agg(jsonb_build_object('assignmentId', a.id, 'personName', p.first_name || ' ' || p.last_name,
        'roleName', r.name, 'status', a.status) order by a.id)
      from jsonb_array_elements(b->'responsibles') responsible
      join public.assignments a on a.id = (responsible->>'assignmentId')::uuid and a.org_id = m.org_id and a.meeting_id = m.id and a.team_id = p_team
      join public.people p on p.id = a.person_id and p.org_id = m.org_id
      left join public.roles r on r.id = a.role_id and r.org_id = m.org_id
    ), '[]'::jsonb))) from jsonb_array_elements(snapshot->'blocks') b where b->>'teamId' = p_team::text), '[]'::jsonb)
  );
end
$$;

create function public.edit_team_block_responsible(
  p_meeting uuid, p_team uuid, p_block uuid, p_expected_version integer,
  p_action text, p_person uuid default null, p_role uuid default null, p_assignment uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.meetings; snapshot jsonb; block jsonb; blocks jsonb = '[]'::jsonb; found_block boolean = false; revision uuid;
begin
  select * into m from public.meetings where id = p_meeting for update;
  if m.id is null or m.status in ('finished', 'cancelled')
    or not private.team_responsibles_allowed(m.org_id, p_team) then raise exception 'Forbidden'; end if;
  if p_expected_version is null or m.version <> p_expected_version then raise exception 'Version conflict'; end if;
  if p_action is null or p_action not in ('add', 'remove') then raise exception 'Invalid action'; end if;
  if p_action = 'add' then
    if p_assignment is not null or not exists(select 1 from public.people p join public.team_memberships tm on tm.person_id = p.id and tm.org_id = p.org_id
      where p.id = p_person and p.org_id = m.org_id and p.active and tm.team_id = p_team) then raise exception 'Invalid team person'; end if;
    if p_role is not null and not exists(select 1 from public.roles r where r.id = p_role and r.org_id = m.org_id and r.active and (r.team_id = p_team or r.team_id is null)) then raise exception 'Invalid team role'; end if;
  elsif p_assignment is null or p_person is not null or p_role is not null then raise exception 'Invalid assignment';
  end if;
  snapshot = private.editor_snapshot(m.id);
  for block in select value from jsonb_array_elements(snapshot->'blocks') loop
    if block->>'id' = p_block::text then
      if block->>'teamId' <> p_team::text then raise exception 'Forbidden'; end if;
      if p_action = 'add' then
        if jsonb_array_length(block->'responsibles') >= 100 then raise exception 'Too many responsibles'; end if;
        if exists(select 1 from jsonb_array_elements(block->'responsibles') a
          where a->>'teamId' = p_team::text and a->>'personId' = p_person::text and (a->>'roleId')::uuid is not distinct from p_role) then raise exception 'Duplicate responsible'; end if;
        block = jsonb_set(block, '{responsibles}', (block->'responsibles') || jsonb_build_array(jsonb_build_object(
          'assignmentId', null, 'personId', p_person, 'teamId', p_team, 'roleId', p_role)));
      else
        if not exists(select 1 from jsonb_array_elements(block->'responsibles') a where a->>'assignmentId' = p_assignment::text and a->>'teamId' = p_team::text) then raise exception 'Invalid assignment'; end if;
        block = jsonb_set(block, '{responsibles}', coalesce((select jsonb_agg(a.value order by a.ord)
          from jsonb_array_elements(block->'responsibles') with ordinality a(value, ord)
          where a.value->>'assignmentId' is distinct from p_assignment::text), '[]'::jsonb));
      end if;
      found_block = true;
    end if;
    blocks = blocks || jsonb_build_array(block);
  end loop;
  if not found_block then raise exception 'Forbidden'; end if;
  revision = private.write_editor_revision(m.id, snapshot->'metadata', blocks);
  update public.meetings set draft_revision_id = revision, version = version + 1 where id = m.id;
  return public.get_team_block_responsibles(m.id, p_team);
end
$$;
revoke all on function public.get_team_block_responsibles(uuid,uuid),
  public.edit_team_block_responsible(uuid,uuid,uuid,integer,text,uuid,uuid,uuid) from public, anon;
grant execute on function public.get_team_block_responsibles(uuid,uuid),
  public.edit_team_block_responsible(uuid,uuid,uuid,integer,text,uuid,uuid,uuid) to authenticated;

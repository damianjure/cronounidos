-- Sprint 3: confirmations address canonical assignments in the operational plan,
-- never an abandoned draft or a replaced assignment. No service-role client.
create function private.confirmation_current(p_assignment uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from public.assignments a
   join public.meetings m on m.id=a.meeting_id
   left join public.meeting_required_positions p on p.id=a.position_id
   left join public.meeting_blocks anchor on anchor.id=a.block_id
   where a.id=p_assignment and a.replaced_by_id is null
     and m.status not in ('finished','cancelled')
     and private.is_member(m.org_id)
     and (m.published_revision_id is not null
       or private.can(m.org_id,'plan',coalesce(p.team_id,a.team_id,anchor.team_id)))
     and (a.position_id is not null or exists(
       select 1 from public.meeting_blocks b
       where b.revision_id=coalesce(m.published_revision_id,m.draft_revision_id)
         and (b.id=a.block_id or exists(select 1 from public.block_assignment_links l where l.block_id=b.id and l.assignment_id=a.id))
     ))
 )
$$;
revoke all on function private.confirmation_current(uuid) from public,anon,authenticated;

create function public.respond_assignments(
  p_meeting uuid,p_person uuid,p_status public.confirmation_status,p_expected jsonb
) returns integer language plpgsql security definer set search_path='' as $$
declare m public.meetings; a public.assignments; item jsonb; changed integer=0;
begin
  select * into m from public.meetings where id=p_meeting for update;
  if m.id is null or not private.is_member(m.org_id) then raise exception 'Forbidden'; end if;
  if m.status in ('finished','cancelled') then raise exception 'Meeting closed'; end if;
  if p_status is null or p_expected is null or jsonb_typeof(p_expected)<>'array'
    or jsonb_array_length(p_expected) not between 1 and 100 then raise exception 'Invalid confirmations'; end if;
  if exists(select 1 from jsonb_array_elements(p_expected) x where jsonb_typeof(x)<>'object'
      or x->>'id' is null or x->>'status' is null or not (x ? 'respondedAt')
      or x->>'status' not in ('pending','confirmed','unavailable')
      or jsonb_typeof(x->'respondedAt') not in ('string','null'))
    or (select count(distinct (x->>'id')::uuid) from jsonb_array_elements(p_expected) x)<>jsonb_array_length(p_expected) then
    raise exception 'Invalid confirmations';
  end if;
  -- Lock meeting first, then assignments in UUID order: all-or-nothing per person.
  for item in select value from jsonb_array_elements(p_expected) order by value->>'id' loop
    select * into a from public.assignments where id=(item->>'id')::uuid for update;
    if a.id is null or a.meeting_id<>m.id or a.person_id is distinct from p_person
      or not private.assignment_can(a.id,'confirm') or not private.confirmation_current(a.id) then
      raise exception 'Forbidden';
    end if;
    if a.status::text is distinct from item->>'status'
      or a.responded_at is distinct from (item->>'respondedAt')::timestamptz then
      raise exception 'Confirmation conflict';
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_expected) order by value->>'id' loop
    update public.assignments set status=p_status,
      responded_at=case when p_status='pending' then null else now() end
      where id=(item->>'id')::uuid and status is distinct from p_status;
    if found then changed=changed+1; end if;
  end loop;
  return changed;
end
$$;

-- Backwards-compatible single confirmation now receives the same authorization
-- and operational-plan checks. The new UI uses explicit expected values.
create or replace function public.confirm_assignment(p_assignment uuid,p_status public.confirmation_status)
returns void language plpgsql security definer set search_path='' as $$
declare a public.assignments;
begin
  select * into a from public.assignments where id=p_assignment;
  if a.id is null or not private.assignment_can(a.id,'confirm') then raise exception 'Forbidden'; end if;
  perform public.respond_assignments(a.meeting_id,a.person_id,p_status,
    jsonb_build_array(jsonb_build_object('id',a.id,'status',a.status,'respondedAt',a.responded_at)));
end
$$;

create function public.confirmation_meetings(p_org uuid)
returns table(id uuid,title text,date date) language plpgsql security definer set search_path='' as $$
begin
  if not private.is_member(p_org) then raise exception 'Forbidden'; end if;
  return query select m.id,m.title,m.date from public.meetings m
    where m.org_id=p_org and exists(select 1 from public.assignments a where a.meeting_id=m.id
      and private.assignment_can(a.id,'confirm') and private.confirmation_current(a.id))
    order by m.date,m.id limit 100;
end
$$;

create function public.get_meeting_confirmations(p_meeting uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.meetings; result jsonb;
begin
  select * into m from public.meetings where id=p_meeting;
  if m.id is null or not private.is_member(m.org_id) then raise exception 'Forbidden'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'personId',a.person_id,
    'personName',case when private.my_person(a.org_id,a.person_id) or private.can(a.org_id,'read_people',coalesce(p.team_id,a.team_id,b.team_id))
      then concat(pe.first_name,' ',pe.last_name) else 'Persona asignada' end,
    'teamName',t.name,'roleName',r.name,
    'activity',case when a.position_id is not null then 'Puesto de la reunión' else (
      select current_block.name from public.meeting_blocks current_block
      where current_block.revision_id=coalesce(m.published_revision_id,m.draft_revision_id)
        and (current_block.id=a.block_id or exists(select 1 from public.block_assignment_links l where l.block_id=current_block.id and l.assignment_id=a.id))
      order by current_block.sort_order limit 1) end,
    'status',a.status,'respondedAt',a.responded_at,
    'history',coalesce((select jsonb_agg(jsonb_build_object('event',e.event,'at',e.at,
      'status',e.details_json->>'status','previousStatus',e.details_json->>'previous_status') order by e.at,e.id)
      from public.assignment_events e where e.assignment_id=a.id),'[]'::jsonb)
  ) order by pe.last_name,pe.first_name,a.id),'[]'::jsonb) into result
  from public.assignments a
  join public.people pe on pe.id=a.person_id
  left join public.meeting_required_positions p on p.id=a.position_id
  left join public.meeting_blocks b on b.id=a.block_id
  left join public.teams t on t.id=coalesce(p.team_id,a.team_id,b.team_id)
  left join public.roles r on r.id=coalesce(p.role_id,a.role_id)
  where a.meeting_id=m.id and private.assignment_can(a.id,'confirm') and private.confirmation_current(a.id);
  if jsonb_array_length(result)=0 then raise exception 'Forbidden'; end if;
  return jsonb_build_object('meetingId',m.id,'title',m.title,'date',m.date,'assignments',result);
end
$$;
revoke all on function public.respond_assignments(uuid,uuid,public.confirmation_status,jsonb),
  public.confirmation_meetings(uuid),public.get_meeting_confirmations(uuid) from public,anon;
grant execute on function public.respond_assignments(uuid,uuid,public.confirmation_status,jsonb),
  public.confirmation_meetings(uuid),public.get_meeting_confirmations(uuid) to authenticated;

-- Position staffing is operational, independent of the published timeline snapshot.
revoke insert,update,delete on public.meeting_required_positions from authenticated;

-- Validate replacement chains at transaction end so the old head can release the
-- unique position before inserting its successor. No synthetic rejection needed.
alter table public.assignments alter constraint assignments_replaced_by_id_fkey deferrable initially deferred;
create or replace function private.validate_assignment() returns trigger language plpgsql set search_path='' as $$
begin
 if new.block_id is not null and not exists(select 1 from public.meeting_blocks b join public.meeting_revisions r on r.id=b.revision_id where b.id=new.block_id and r.meeting_id=new.meeting_id) then raise exception 'Block must belong to meeting';end if;
 return new;
end $$;
create function private.validate_replacement_chain() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.assignments; successor public.assignments;
begin
 select * into a from public.assignments where id=new.id;
 if not found or a.replaced_by_id is null then return null;end if;
 select * into successor from public.assignments where id=a.replaced_by_id;
 if not found or successor.id=a.id or successor.org_id<>a.org_id or successor.meeting_id<>a.meeting_id or successor.position_id is distinct from a.position_id then raise exception 'Invalid replacement';end if;
 if exists(with recursive chain(id,next_id,path,cycle) as (
 select successor.id,successor.replaced_by_id,array[a.id,successor.id],successor.id=a.id
 union all select x.id,x.replaced_by_id,c.path||x.id,x.id=any(c.path) from public.assignments x join chain c on x.id=c.next_id where not c.cycle)
 select 1 from chain where cycle) then raise exception 'Replacement cycle';end if;
 return null;
end $$;
create constraint trigger validate_replacement_chain after insert or update on public.assignments deferrable initially deferred for each row execute function private.validate_replacement_chain();

create function public.configure_meeting_position(p_meeting uuid,p_version integer,p_team uuid,p_role uuid,p_priority public.position_priority,p_quantity integer) returns void language plpgsql security definer set search_path='' as $$
declare m public.meetings; start_index integer;
begin
 select * into m from public.meetings where id=p_meeting for update;
 if not found or not coalesce(private.can(m.org_id,'plan',p_team) and private.can(m.org_id,'edit_roles',p_team),false) then raise exception 'Forbidden';end if;
 if p_version is null or m.version<>p_version then raise exception 'Staffing conflict';end if;
 if m.status in ('finished','cancelled') then raise exception 'Meeting closed';end if;
 if p_priority is null or p_quantity is null or p_quantity not between 1 and 20 then raise exception 'Invalid quantity';end if;
 if not exists(select 1 from public.teams where id=p_team and org_id=m.org_id and active) or not exists(select 1 from public.roles where id=p_role and org_id=m.org_id and active and (team_id is null or team_id=p_team)) then raise exception 'Invalid team or role';end if;
 select coalesce(max(quantity_index),0) into start_index from public.meeting_required_positions where meeting_id=m.id and role_id=p_role;
 if start_index+p_quantity>100 then raise exception 'Too many positions';end if;
 insert into public.meeting_required_positions(org_id,meeting_id,team_id,role_id,priority,quantity_index) select m.org_id,m.id,p_team,p_role,p_priority,start_index+i from generate_series(1,p_quantity) i;
 update public.meetings set version=version+1 where id=m.id;
end $$;

create function public.staff_meeting_position(p_position uuid,p_version integer,p_person uuid,p_expected uuid,p_status public.confirmation_status,p_responded_at timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare m public.meetings; p public.meeting_required_positions; a public.assignments; successor uuid:=gen_random_uuid(); heads integer;
begin
 select * into p from public.meeting_required_positions where id=p_position;
 if not found then raise exception 'Forbidden';end if;
 select * into m from public.meetings where id=p.meeting_id for update;
 if not coalesce(private.can(m.org_id,'assign',p.team_id) and private.can(m.org_id,'read_people',p.team_id),false) then raise exception 'Forbidden';end if;
 if p_version is null or p_version<>m.version then raise exception 'Staffing conflict';end if;
 if m.status in ('finished','cancelled') then raise exception 'Meeting closed';end if;
 select count(*) into heads from public.assignments where position_id=p.id and replaced_by_id is null;
 if heads>1 then raise exception 'Ambiguous position history';end if;
 select * into a from public.assignments where position_id=p.id and replaced_by_id is null for update;
 if a.id is distinct from p_expected or a.status is distinct from p_status or a.responded_at is distinct from p_responded_at then raise exception 'Staffing conflict';end if;
 if a.person_id=p_person then raise exception 'Person already assigned';end if;
 if not exists(select 1 from public.people pe join public.team_memberships tm on tm.person_id=pe.id and tm.org_id=pe.org_id where pe.id=p_person and pe.org_id=m.org_id and pe.active and tm.team_id=p.team_id) then raise exception 'Person must belong to team';end if;
 if a.id is not null then update public.assignments set replaced_by_id=successor where id=a.id;end if;
 insert into public.assignments(id,org_id,meeting_id,position_id,person_id,team_id,role_id) values(successor,m.org_id,m.id,p.id,p_person,p.team_id,p.role_id);
 update public.meetings set version=version+1 where id=m.id;
 return successor;
end $$;
revoke all on function private.validate_replacement_chain() from public,anon,authenticated;
revoke all on function public.configure_meeting_position(uuid,integer,uuid,uuid,public.position_priority,integer),public.staff_meeting_position(uuid,integer,uuid,uuid,public.confirmation_status,timestamptz) from public,anon;
grant execute on function public.configure_meeting_position(uuid,integer,uuid,uuid,public.position_priority,integer),public.staff_meeting_position(uuid,integer,uuid,uuid,public.confirmation_status,timestamptz) to authenticated;

create function public.get_meeting_staffing(p_meeting uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.meetings; result jsonb;
begin
 select * into m from public.meetings where id=p_meeting;
 if not found or not ((private.can(m.org_id,'assign') and private.can(m.org_id,'read_people')) or exists(select 1 from public.teams t where t.org_id=m.org_id and private.can(m.org_id,'assign',t.id) and private.can(m.org_id,'read_people',t.id))) then raise exception 'Forbidden';end if;
 select jsonb_build_object('meetingId',m.id,'title',m.title,'version',m.version,'closed',m.status in ('finished','cancelled'),
 'teams',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'configure',private.can(m.org_id,'plan',t.id) and private.can(m.org_id,'edit_roles',t.id),
 'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by r.name) from public.roles r where r.org_id=m.org_id and r.active and (r.team_id=t.id or r.team_id is null)),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',pe.id,'name',pe.first_name||' '||pe.last_name) order by pe.first_name,pe.last_name) from public.team_memberships tm join public.people pe on pe.id=tm.person_id where tm.team_id=t.id and pe.active),'[]'::jsonb),
 'positions',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'role',r.name,'priority',p.priority,'index',p.quantity_index,
 'assignment',(select jsonb_build_object('id',a.id,'personId',a.person_id,'personName',pe.first_name||' '||pe.last_name,'status',a.status,'respondedAt',a.responded_at) from public.assignments a join public.people pe on pe.id=a.person_id where a.position_id=p.id and a.replaced_by_id is null order by a.id limit 1),
 'history',coalesce((select jsonb_agg(jsonb_build_object('personName',pe.first_name||' '||pe.last_name,'status',a.status,'replaced',a.replaced_by_id is not null,'at',(select min(e.at) from public.assignment_events e where e.assignment_id=a.id)) order by (select min(e.at) from public.assignment_events e where e.assignment_id=a.id),a.id) from public.assignments a join public.people pe on pe.id=a.person_id where a.position_id=p.id),'[]'::jsonb)) order by r.name,p.quantity_index) from public.meeting_required_positions p join public.roles r on r.id=p.role_id where p.meeting_id=m.id and p.team_id=t.id),'[]'::jsonb)) order by t.name) from public.teams t where t.org_id=m.org_id and t.active and private.can(m.org_id,'assign',t.id) and private.can(m.org_id,'read_people',t.id)),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.get_meeting_staffing(uuid) from public,anon;
grant execute on function public.get_meeting_staffing(uuid) to authenticated;

-- Aggregate role × meeting matrix: deliberately excludes identities and notes.
create function public.coverage_matrix(p_org uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not (private.can(p_org,'plan') or private.can(p_org,'read_agenda')) then raise exception 'Forbidden';end if;
 if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>42 then raise exception 'Invalid calendar range';end if;
 select coalesce(jsonb_agg(jsonb_build_object('meetingId',m.id,'teamId',p.team_id,'teamName',t.name,'roleId',p.role_id,'roleName',r.name,'priority',p.priority,'status',a.status) order by t.name,r.name,m.id,p.quantity_index),'[]'::jsonb) into result
 from public.meetings m join public.meeting_revisions rev on rev.id=coalesce(m.published_revision_id,m.draft_revision_id)
 join public.meeting_required_positions p on p.meeting_id=m.id join public.teams t on t.id=p.team_id join public.roles r on r.id=p.role_id
 left join lateral(select x.status from public.assignments x where x.position_id=p.id and x.replaced_by_id is null order by (x.status<>'unavailable') desc,x.responded_at desc nulls last,x.id limit 1) a on true
 where m.org_id=p_org and m.status not in ('finished','cancelled') and (m.published_revision_id is not null or private.can(p_org,'plan')) and coalesce(rev.local_date,m.date)>=p_from and coalesce(rev.local_date,m.date)<p_to;
 return result;
end $$;
revoke all on function public.coverage_matrix(uuid,date,date) from public,anon;
grant execute on function public.coverage_matrix(uuid,date,date) to authenticated;

create function public.template_position_definition(p_meeting uuid,p_version integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.meetings; result jsonb;
begin
 select * into m from public.meetings where id=p_meeting;
 if not found or not private.editor_allowed(m.org_id) then raise exception 'Forbidden';end if;
 if p_version is null or m.version<>p_version then raise exception 'Version conflict';end if;
 select coalesce(jsonb_agg(jsonb_build_object('teamId',team_id,'roleId',role_id,'priority',priority,'quantity',quantity)),'[]'::jsonb) into result from (select team_id,role_id,priority,count(*) quantity from public.meeting_required_positions where meeting_id=m.id group by team_id,role_id,priority) requirements;
 return result;
end $$;
create or replace function public.create_editor_meeting(p_org uuid,p_metadata jsonb,p_template uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare meeting uuid; revision uuid; definition jsonb; requirement jsonb; idx integer; quantity integer;
begin
 if not private.editor_allowed(p_org) then raise exception 'Forbidden';end if;
 definition='{"blocks":[],"requiredPositions":[]}';
 if p_template is not null then select definition_json into definition from public.meeting_templates where id=p_template and org_id=p_org;if definition is null then raise exception 'Invalid template';end if;end if;
 insert into public.meetings(org_id,title,date,start_local_time,timezone,meeting_type_id,series_id) values(p_org,p_metadata->>'title',(p_metadata->>'date')::date,(p_metadata->>'startLocalTime')::time,p_metadata->>'timezone',(p_metadata->>'meetingTypeId')::uuid,(p_metadata->>'seriesId')::uuid) returning id into meeting;
 revision=private.write_editor_revision(meeting,p_metadata,definition->'blocks',true);
 if jsonb_typeof(coalesce(definition->'requiredPositions','[]'))<>'array' or jsonb_array_length(coalesce(definition->'requiredPositions','[]'))>200 then raise exception 'Invalid template positions';end if;
 for requirement in select value from jsonb_array_elements(coalesce(definition->'requiredPositions','[]')) loop
 quantity=(requirement->>'quantity')::integer;
 if quantity is null or quantity not between 1 and 100 or not exists(select 1 from public.teams where id=(requirement->>'teamId')::uuid and org_id=p_org and active) or not exists(select 1 from public.roles where id=(requirement->>'roleId')::uuid and org_id=p_org and active and (team_id is null or team_id=(requirement->>'teamId')::uuid)) then raise exception 'Invalid template positions';end if;
 select coalesce(max(quantity_index),0) into idx from public.meeting_required_positions where meeting_id=meeting and role_id=(requirement->>'roleId')::uuid;
 insert into public.meeting_required_positions(org_id,meeting_id,team_id,role_id,priority,quantity_index) select p_org,meeting,(requirement->>'teamId')::uuid,(requirement->>'roleId')::uuid,(requirement->>'priority')::public.position_priority,idx+i from generate_series(1,quantity) i;
 end loop;
 update public.meetings set draft_revision_id=revision where id=meeting;
 return private.editor_snapshot(meeting);
end $$;
revoke all on function public.template_position_definition(uuid,integer) from public,anon;
grant execute on function public.template_position_definition(uuid,integer) to authenticated;

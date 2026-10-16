create table private.block_replacements(
 old_assignment uuid not null references public.assignments(id),new_assignment uuid not null references public.assignments(id),
 primary key(old_assignment,new_assignment));
alter table private.block_replacements enable row level security;
revoke all on private.block_replacements from public,anon,authenticated;
create function private.activate_block_replacements() returns trigger language plpgsql security definer set search_path='' as $$
declare proposal record;
begin
 if new.published_revision_id is not distinct from old.published_revision_id then return null;end if;
 for proposal in select x.* from private.block_replacements x join public.assignments a on a.id=x.old_assignment where a.meeting_id=new.id and a.replaced_by_id is null
 and exists(select 1 from public.block_assignment_links l join public.meeting_blocks b on b.id=l.block_id where l.assignment_id=x.new_assignment and b.revision_id=new.published_revision_id)
 and not exists(select 1 from public.block_assignment_links l join public.meeting_blocks b on b.id=l.block_id where l.assignment_id=x.old_assignment and b.revision_id=new.published_revision_id)
 loop
 update public.assignments set replaced_by_id=proposal.new_assignment where id=proposal.old_assignment and replaced_by_id is null;
 end loop;
 return null;
end $$;
create trigger activate_block_replacements after update of published_revision_id on public.meetings for each row execute function private.activate_block_replacements();

create function public.replace_block_person(p_meeting uuid,p_version integer,p_assignment uuid,p_person uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.meetings; a public.assignments; snapshot jsonb; b jsonb; responsible jsonb; blocks jsonb='[]'::jsonb; people jsonb; rev uuid; successor uuid; changed integer=0;
begin
 select * into m from public.meetings where id=p_meeting for update;
 select * into a from public.assignments where id=p_assignment and meeting_id=p_meeting and position_id is null and replaced_by_id is null;
 if m.id is null or a.id is null or not coalesce(private.can(m.org_id,'assign',a.team_id) and private.can(m.org_id,'read_people',a.team_id),false) then raise exception 'Forbidden';end if;
 if p_version is null or m.version<>p_version then raise exception 'Staffing conflict';end if;
 if m.status in ('finished','cancelled') then raise exception 'Meeting closed';end if;
 if a.person_id=p_person or not exists(select 1 from public.people pe where pe.org_id=m.org_id and pe.id=p_person and pe.active and (a.team_id is null or exists(select 1 from public.team_memberships tm where tm.team_id=a.team_id and tm.person_id=pe.id))) then raise exception 'Invalid replacement person';end if;
 snapshot=private.editor_snapshot(m.id);
 for b in select value from jsonb_array_elements(snapshot->'blocks') loop
 people='[]';
 for responsible in select value from jsonb_array_elements(b->'responsibles') loop
 if responsible->>'assignmentId'=a.id::text then
 responsible=jsonb_set(jsonb_set(responsible,'{personId}',to_jsonb(p_person)),'{assignmentId}','null');changed=changed+1;
 end if;
 people=people||jsonb_build_array(responsible);
 end loop;
 blocks=blocks||jsonb_build_array(jsonb_set(b,'{responsibles}',people));
 end loop;
 if changed<>1 then raise exception 'Assignment not unique in current draft';end if;
 rev=private.write_editor_revision(m.id,snapshot->'metadata',blocks);
 select x.id into successor from public.assignments x join public.block_assignment_links l on l.assignment_id=x.id join public.meeting_blocks b on b.id=l.block_id where b.revision_id=rev and x.person_id=p_person and x.team_id is not distinct from a.team_id and x.role_id is not distinct from a.role_id and not exists(select 1 from public.block_assignment_links old_link join public.meeting_blocks old_block on old_block.id=old_link.block_id where old_link.assignment_id=x.id and old_block.revision_id<>rev) limit 1;
 if successor is null then raise exception 'Replacement not created';end if;
 insert into private.block_replacements(old_assignment,new_assignment) select old_assignment,successor from private.block_replacements where new_assignment=a.id on conflict do nothing;
 insert into private.block_replacements values(a.id,successor);
 insert into public.assignment_events(org_id,assignment_id,event,actor_user_id,details_json) values(m.org_id,a.id,'replacement_proposed',auth.uid(),jsonb_build_object('replaced_by_id',successor,'status',a.status));
 update public.meetings set draft_revision_id=rev,version=version+1 where id=m.id;
end $$;

create function public.get_block_staffing(p_meeting uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.meetings; result jsonb;
begin
 select * into m from public.meetings where id=p_meeting;
 if not found or not ((private.can(m.org_id,'assign') and private.can(m.org_id,'read_people')) or exists(select 1 from public.teams t where t.org_id=m.org_id and private.can(m.org_id,'assign',t.id) and private.can(m.org_id,'read_people',t.id))) then raise exception 'Forbidden';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'personId',a.person_id,'personName',p.first_name||' '||p.last_name,'teamId',a.team_id,'roleName',coalesce(r.name,'Responsable'),'status',a.status) order by b.sort_order,a.id),'[]'::jsonb) into result
 from public.meeting_blocks b join public.block_assignment_links l on l.block_id=b.id join public.assignments a on a.id=l.assignment_id join public.people p on p.id=a.person_id left join public.roles r on r.id=a.role_id
 where b.revision_id=coalesce(m.draft_revision_id,m.published_revision_id) and a.replaced_by_id is null and a.position_id is null and private.can(m.org_id,'assign',a.team_id) and private.can(m.org_id,'read_people',a.team_id);
 return result;
end $$;
revoke all on function private.activate_block_replacements() from public,anon,authenticated;
revoke all on function public.replace_block_person(uuid,integer,uuid,uuid),public.get_block_staffing(uuid) from public,anon;
grant execute on function public.replace_block_person(uuid,integer,uuid,uuid),public.get_block_staffing(uuid) to authenticated;

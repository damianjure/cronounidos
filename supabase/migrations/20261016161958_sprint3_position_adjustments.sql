create function public.adjust_meeting_position(p_position uuid,p_version integer,p_priority public.position_priority,p_remove boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare m public.meetings; p public.meeting_required_positions;
begin
 select * into p from public.meeting_required_positions where id=p_position;
 if not found then raise exception 'Forbidden';end if;
 select * into m from public.meetings where id=p.meeting_id for update;
 if not coalesce(private.can(m.org_id,'plan',p.team_id) and private.can(m.org_id,'edit_roles',p.team_id),false) then raise exception 'Forbidden';end if;
 if p_version is null or m.version<>p_version then raise exception 'Staffing conflict';end if;
 if m.status in ('finished','cancelled') then raise exception 'Meeting closed';end if;
 if p_remove then
 if exists(select 1 from public.assignments where position_id=p.id) then raise exception 'Position has history';end if;
 delete from public.meeting_required_positions where id=p.id;
 else
 if p_priority is null then raise exception 'Invalid priority';end if;
 update public.meeting_required_positions set priority=p_priority where id=p.id;
 end if;
 update public.meetings set version=version+1 where id=m.id;
end $$;
revoke all on function public.adjust_meeting_position(uuid,integer,public.position_priority,boolean) from public,anon;
grant execute on function public.adjust_meeting_position(uuid,integer,public.position_priority,boolean) to authenticated;

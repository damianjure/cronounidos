-- Private, time-bound exceptions also support parallel activities (which have no assignment row).
create table private.staffing_exceptions(
 org_id uuid not null references public.organizations(id), fingerprint text not null,
 justification text not null check(length(trim(justification)) between 10 and 2000),
 approved_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 primary key(org_id,fingerprint));
alter table private.staffing_exceptions enable row level security;
revoke all on private.staffing_exceptions from public,anon,authenticated;

create function private.staffing_slots(p_org uuid,p_target uuid)
returns table(slot_key text,person_id uuid,team_id uuid,meeting_id uuid,starts_at timestamptz,ends_at timestamptz,kind text)
language sql stable security definer set search_path='' as $$
 with revisions as (
 select m.id meeting_id,coalesce(case when m.id=p_target then m.draft_revision_id end,m.published_revision_id,m.draft_revision_id) revision_id
 from public.meetings m where m.org_id=p_org and m.status not in ('finished','cancelled')
 and (m.id=p_target or m.published_revision_id is not null or private.can(p_org,'plan'))
 ), blocks as (
 select b.*,r.meeting_id,r.scheduled_start+coalesce(sum(b.duration_seconds) over(partition by b.revision_id order by b.sort_order,b.id rows between unbounded preceding and 1 preceding),0)*interval '1 second' starts
 from revisions x join public.meeting_revisions r on r.id=x.revision_id join public.meeting_blocks b on b.revision_id=r.id
 ), durations as (select revision_id,sum(duration_seconds) duration from blocks group by revision_id)
 select 'a:'||a.id||':'||b.client_key,a.person_id,coalesce(a.team_id,b.team_id),b.meeting_id,b.starts,b.starts+b.duration_seconds*interval '1 second','Actividad principal'
 from blocks b join public.block_assignment_links l on l.block_id=b.id join public.assignments a on a.id=l.assignment_id
 where a.replaced_by_id is null and a.status<>'unavailable' and b.duration_seconds>0
 union all
 select 's:'||b.meeting_id||':'||s.client_key,s.person_id,s.team_id,b.meeting_id,b.starts+s.offset_seconds*interval '1 second',b.starts+(s.offset_seconds+s.duration_seconds)*interval '1 second','Actividad paralela'
 from blocks b join public.block_subactivities s on s.block_id=b.id where s.person_id is not null and s.duration_seconds>0
 union all
 select 'p:'||a.id,a.person_id,p.team_id,m.meeting_id,r.scheduled_start,r.scheduled_start+d.duration*interval '1 second','Puesto de reunión'
 from revisions m join public.meeting_revisions r on r.id=m.revision_id join durations d on d.revision_id=r.id join public.meeting_required_positions p on p.meeting_id=m.meeting_id join public.assignments a on a.position_id=p.id
 where a.replaced_by_id is null and a.status<>'unavailable' and d.duration>0
$$;
create function private.staffing_pairs(p_meeting uuid)
returns table(org_id uuid,fingerprint text,person_id uuid,first_team uuid,second_team uuid,starts_at timestamptz,ends_at timestamptz,first_kind text,second_kind text)
language sql stable security definer set search_path='' as $$
 with m as(select org_id from public.meetings where id=p_meeting),slots as(select s.* from m cross join lateral private.staffing_slots(m.org_id,p_meeting) s)
 select m.org_id,md5(a.slot_key||'|'||b.slot_key||'|'||a.person_id::text||'|'||extract(epoch from a.starts_at)::text||'|'||extract(epoch from a.ends_at)::text||'|'||extract(epoch from b.starts_at)::text||'|'||extract(epoch from b.ends_at)::text),a.person_id,
 case when a.meeting_id=p_meeting then a.team_id else b.team_id end,
 case when a.meeting_id=p_meeting then b.team_id else a.team_id end,
 greatest(a.starts_at,b.starts_at),least(a.ends_at,b.ends_at),a.kind,b.kind
 from slots a join slots b on a.person_id=b.person_id and a.slot_key<b.slot_key and a.starts_at<b.ends_at and b.starts_at<a.ends_at cross join m
 where (a.meeting_id=p_meeting or b.meeting_id=p_meeting)
$$;
create function public.get_staffing_conflicts(p_meeting uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.meetings; result jsonb;
begin
 select * into m from public.meetings where id=p_meeting;
 if not found or not ((private.can(m.org_id,'assign') and private.can(m.org_id,'read_people')) or exists(select 1 from public.teams t where t.org_id=m.org_id and private.can(m.org_id,'assign',t.id) and private.can(m.org_id,'read_people',t.id))) then raise exception 'Forbidden';end if;
 select coalesce(jsonb_agg(jsonb_build_object('fingerprint',c.fingerprint,'personName',p.first_name||' '||p.last_name,'startsAt',c.starts_at,'endsAt',c.ends_at,
 'description',case when private.can(c.org_id,'assign',c.second_team) and private.can(c.org_id,'read_people',c.second_team) then c.first_kind||' / '||c.second_kind else 'Coincide con otra ocupación no visible' end,
 'canExcept',private.can(c.org_id,'assign',c.second_team) and private.can(c.org_id,'read_people',c.second_team),
 'justification',case when private.can(c.org_id,'assign',c.second_team) and private.can(c.org_id,'read_people',c.second_team) then e.justification else null end) order by c.starts_at,c.fingerprint),'[]'::jsonb) into result
 from private.staffing_pairs(p_meeting) c join public.people p on p.id=c.person_id left join private.staffing_exceptions e on e.org_id=c.org_id and e.fingerprint=c.fingerprint
 where private.can(c.org_id,'assign',c.first_team) and private.can(c.org_id,'read_people',c.first_team);
 return result;
end $$;
create function public.justify_staffing_conflict(p_meeting uuid,p_fingerprint text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare m public.meetings; c record;
begin
 select * into m from public.meetings where id=p_meeting for update;
 if not found then raise exception 'Forbidden';end if;
 if m.status in ('finished','cancelled') then raise exception 'Meeting closed';end if;
 if p_reason is null or length(trim(p_reason)) not between 10 and 2000 then raise exception 'Invalid justification';end if;
 select * into c from private.staffing_pairs(p_meeting) where fingerprint=p_fingerprint;
 if not found then raise exception 'Conflict changed';end if;
 if not coalesce(private.can(c.org_id,'assign',c.first_team) and private.can(c.org_id,'read_people',c.first_team) and private.can(c.org_id,'assign',c.second_team) and private.can(c.org_id,'read_people',c.second_team),false) then raise exception 'Forbidden';end if;
 insert into private.staffing_exceptions(org_id,fingerprint,justification,approved_by) values(c.org_id,c.fingerprint,trim(p_reason),auth.uid()) on conflict(org_id,fingerprint) do nothing;
end $$;
revoke all on function private.staffing_slots(uuid,uuid),private.staffing_pairs(uuid) from public,anon,authenticated;
revoke all on function public.get_staffing_conflicts(uuid),public.justify_staffing_conflict(uuid,text,text) from public,anon;
grant execute on function public.get_staffing_conflicts(uuid),public.justify_staffing_conflict(uuid,text,text) to authenticated;

-- Internal agenda readers may see aggregate coverage, never people or notes.
-- Published metadata stays operational; initial drafts are planner-only.
create function public.calendar_overview(p_org uuid,p_from date,p_to date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare planner boolean; today date; result jsonb;
begin
  planner=private.can(p_org,'plan');
  if not planner and not private.can(p_org,'read_agenda') then raise exception 'Forbidden'; end if;
  if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>42 then raise exception 'Invalid calendar range'; end if;
  select (now() at time zone o.timezone)::date into today from public.organizations o where o.id=p_org;
  with source as (
    select m.id,coalesce(r.title,m.title) title,coalesce(r.local_date,m.date) meeting_day,
      m.published_revision_id is null draft,
      m.published_revision_id is not null and m.draft_revision_id is not null "hasDraftChanges",
      mt.name "typeName",coalesce(mt.color,'#64748b') "typeColor",
      counts.total,counts.confirmed,counts.pending,counts.unavailable,counts.vacant,counts."criticalMissing"
    from public.meetings m
    join public.meeting_revisions r on r.id=coalesce(m.published_revision_id,m.draft_revision_id)
    left join public.meeting_types mt on mt.id=case when r.title is null then m.meeting_type_id else r.meeting_type_id end
    cross join lateral (
      select count(*)::integer total,
        count(*) filter(where a.status='confirmed')::integer confirmed,
        count(*) filter(where a.status='pending')::integer pending,
        count(*) filter(where a.status='unavailable')::integer unavailable,
        count(*) filter(where a.id is null)::integer vacant,
        count(*) filter(where p.priority='critical' and a.status is distinct from 'confirmed')>0 "criticalMissing"
      from public.meeting_required_positions p
      left join lateral (
        select current_assignment.id,current_assignment.status from public.assignments current_assignment
        where current_assignment.position_id=p.id and current_assignment.replaced_by_id is null
        order by (current_assignment.status<>'unavailable') desc,current_assignment.responded_at desc nulls last,current_assignment.id
        limit 1
      ) a on true
      where p.meeting_id=m.id and p.priority<>'optional'
    ) counts
    where m.org_id=p_org and m.status not in ('finished','cancelled')
      and (planner or m.published_revision_id is not null)
  ), projected as (
    select id,meeting_day,jsonb_build_object('id',id,'title',title,'date',meeting_day,'draft',draft,
      'hasDraftChanges',"hasDraftChanges",'typeName',"typeName",'typeColor',"typeColor",
      'total',total,'confirmed',confirmed,'pending',pending,'unavailable',unavailable,'vacant',vacant,
      'criticalMissing',"criticalMissing") value from source
  )
  select jsonb_build_object(
    'meetings',coalesce((select jsonb_agg(value order by meeting_day,id) from projected where meeting_day>=p_from and meeting_day<p_to),'[]'::jsonb),
    'upcoming',coalesce((select jsonb_agg(next.value order by next.meeting_day,next.id) from
      (select * from projected where meeting_day>=today order by meeting_day,id limit 3) next),'[]'::jsonb)
  ) into result;
  return result;
end
$$;
revoke all on function public.calendar_overview(uuid,date,date) from public,anon;
grant execute on function public.calendar_overview(uuid,date,date) to authenticated;

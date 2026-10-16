create table public.meeting_live_state(
 meeting_id uuid primary key references public.meetings(id),org_id uuid not null references public.organizations(id),
 revision_id uuid not null references public.meeting_revisions(id),active_block_id uuid references public.meeting_blocks(id),
 status text not null check(status in ('running','finished')),started_at timestamptz not null,closed_at timestamptz,
 version integer not null check(version>0),check((status='finished')=(closed_at is not null)),check(status<>'finished' or active_block_id is null));
create index meeting_live_state_org_idx on public.meeting_live_state(org_id);
create index meeting_live_state_revision_idx on public.meeting_live_state(revision_id);
create index meeting_live_state_active_block_idx on public.meeting_live_state(active_block_id) where active_block_id is not null;
alter table public.meeting_live_state enable row level security;
revoke all on public.meeting_live_state from public,anon,authenticated;
grant select on public.meeting_live_state to authenticated;
create policy read_live on public.meeting_live_state for select to authenticated using(private.can(org_id,'read_agenda') or private.can(org_id,'operate_live') or private.can(org_id,'plan'));

create table private.block_executions(
 meeting_id uuid not null references public.meetings(id),block_id uuid primary key references public.meeting_blocks(id),
 actual_started_at timestamptz not null,actual_ended_at timestamptz,check(actual_ended_at is null or actual_ended_at>=actual_started_at));
create index block_executions_meeting_idx on private.block_executions(meeting_id);
alter table private.block_executions enable row level security;
revoke all on private.block_executions from public,anon,authenticated;
create table private.meeting_live_events(
 meeting_id uuid not null references public.meetings(id),request_id uuid not null,command text not null,
 expected_version integer not null,actor_user_id uuid not null references auth.users(id),at timestamptz not null,
 primary key(meeting_id,request_id));
create index meeting_live_events_actor_idx on private.meeting_live_events(actor_user_id);
alter table private.meeting_live_events enable row level security;
revoke all on private.meeting_live_events from public,anon,authenticated;

create function public.get_live_snapshot(p_meeting uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.meetings; live public.meeting_live_state; r public.meeting_revisions; result jsonb;
begin
 select * into m from public.meetings where id=p_meeting;
 if not found or not(private.can(m.org_id,'read_agenda') or private.can(m.org_id,'plan') or private.can(m.org_id,'operate_live')) then raise exception 'Forbidden';end if;
 select * into live from public.meeting_live_state where meeting_id=m.id;
 if live.meeting_id is null and (m.published_revision_id is null or m.status<>'published') then raise exception 'Published meeting required';end if;
 select * into r from public.meeting_revisions where id=coalesce(live.revision_id,m.published_revision_id);
 with planned as (
 select b.*,r.scheduled_start+coalesce(sum(b.duration_seconds) over(order by b.sort_order,b.id rows between unbounded preceding and 1 preceding),0)*interval '1 second' planned_start
 from public.meeting_blocks b where b.revision_id=r.id)
 select jsonb_build_object('meetingId',m.id,'title',coalesce(r.title,m.title),'revisionId',r.id,'timezone',r.timezone,
 'version',coalesce(live.version,0),'status',coalesce(live.status,'ready'),'canOperate',private.can(m.org_id,'operate_live'),
 'startedAt',live.started_at,'closedAt',live.closed_at,'activeBlockId',live.active_block_id,'serverNow',clock_timestamp(),
 'blocks',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'durationSeconds',b.duration_seconds,'plannedStart',b.planned_start,
 'actualStart',e.actual_started_at,'actualEnd',e.actual_ended_at,'status',case when e.actual_ended_at is not null then 'finished' when e.actual_started_at is not null then 'running' else 'pending' end) order by b.sort_order,b.id) from planned b left join private.block_executions e on e.block_id=b.id),'[]'::jsonb)) into result;
 return result;
end $$;

create function private.guard_started_meeting() returns trigger language plpgsql security definer set search_path='' as $$
declare live public.meeting_live_state;
begin
 select * into live from public.meeting_live_state where meeting_id=old.id;
 if not found then return new;end if;
 if new.published_revision_id is distinct from live.revision_id or new.status='cancelled' then raise exception 'Live revision frozen';end if;
 if new.closed_at is distinct from live.closed_at or (new.status='finished') is distinct from (live.status='finished') then raise exception 'Use live close transition';end if;
 return new;
end $$;
create trigger guard_started_meeting before update on public.meetings for each row execute function private.guard_started_meeting();

create function public.transition_live(p_meeting uuid,p_version integer,p_request uuid,p_command text) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.meetings; live public.meeting_live_state; prior private.meeting_live_events; block uuid; instant timestamptz;
begin
 select * into m from public.meetings where id=p_meeting for update;
 if not found or not private.can(m.org_id,'operate_live') then raise exception 'Forbidden';end if;
 if p_request is null or p_version is null or p_command is null or p_command not in ('start','next','finish_block','close') then raise exception 'Invalid live command';end if;
 select * into prior from private.meeting_live_events where meeting_id=m.id and request_id=p_request;
 if found then
 if prior.command<>p_command or prior.expected_version<>p_version then raise exception 'Request conflict';end if;
 return public.get_live_snapshot(m.id);
 end if;
 select * into live from public.meeting_live_state where meeting_id=m.id for update;
 if coalesce(live.version,0)<>p_version then raise exception 'Live version conflict';end if;
 instant=clock_timestamp();
 if p_command='start' then
 if live.meeting_id is not null or m.status<>'published' or m.published_revision_id is null then raise exception 'Published unstarted meeting required';end if;
 select id into block from public.meeting_blocks where revision_id=m.published_revision_id order by sort_order,id limit 1;
 if block is null then raise exception 'Meeting has no activities';end if;
 insert into public.meeting_live_state(meeting_id,org_id,revision_id,active_block_id,status,started_at,version) values(m.id,m.org_id,m.published_revision_id,block,'running',instant,1);
 insert into private.block_executions(meeting_id,block_id,actual_started_at) values(m.id,block,instant);
 -- Invalidate editors opened before the live freeze, not merely the live UI.
 update public.meetings set version=version+1 where id=m.id;
 else
 if live.status is distinct from 'running' then raise exception 'Meeting not running';end if;
 if p_command='finish_block' and live.active_block_id is null then raise exception 'No active activity';end if;
 if live.active_block_id is not null then update private.block_executions set actual_ended_at=instant where block_id=live.active_block_id and actual_ended_at is null;end if;
 block=null;
 if p_command='next' then
 select b.id into block from public.meeting_blocks b where b.revision_id=live.revision_id and not exists(select 1 from private.block_executions e where e.block_id=b.id) order by b.sort_order,b.id limit 1;
 if block is null and live.active_block_id is null then raise exception 'No pending activities';end if;
 if block is not null then insert into private.block_executions(meeting_id,block_id,actual_started_at) values(m.id,block,instant);end if;
 end if;
 update public.meeting_live_state set active_block_id=block,status=case when p_command='close' then 'finished' else 'running' end,
 closed_at=case when p_command='close' then instant else null end,version=version+1 where meeting_id=m.id;
 if p_command='close' then update public.meetings set status='finished',closed_at=instant,version=version+1 where id=m.id;end if;
 end if;
 insert into private.meeting_live_events(meeting_id,request_id,command,expected_version,actor_user_id,at) values(m.id,p_request,p_command,p_version,auth.uid(),instant);
 return public.get_live_snapshot(m.id);
end $$;
revoke all on function private.guard_started_meeting() from public,anon,authenticated;
revoke all on function public.get_live_snapshot(uuid),public.transition_live(uuid,integer,uuid,text) from public,anon;
grant execute on function public.get_live_snapshot(uuid),public.transition_live(uuid,integer,uuid,text) to authenticated;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.meeting_live_state;end if;
end $$;

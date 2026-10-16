-- Capture who was actually involved before later staffing edits can remove them.
-- No requests/notifications are created here: those must wait for close +10 min.
create table private.live_participants(
 id uuid primary key default gen_random_uuid(),meeting_id uuid not null references public.meetings(id),
 person_id uuid references public.people(id),user_id uuid references auth.users(id),
 captured_at timestamptz not null default clock_timestamp(),check(person_id is not null or user_id is not null));
create unique index live_participants_person on private.live_participants(meeting_id,person_id) where person_id is not null;
create unique index live_participants_user on private.live_participants(meeting_id,user_id) where user_id is not null;
create index live_participants_person_fk on private.live_participants(person_id) where person_id is not null;
create index live_participants_user_fk on private.live_participants(user_id) where user_id is not null;
alter table private.live_participants enable row level security;
revoke all on private.live_participants from public,anon,authenticated;

create function private.capture_live_participant(p_meeting uuid,p_person uuid,p_user uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare org uuid; person uuid:=p_person; member uuid:=p_user; existing private.live_participants;
begin
 select org_id into org from public.meeting_live_state where meeting_id=p_meeting;
 if org is null then return;end if;
 if person is not null and not exists(select 1 from public.people where id=person and org_id=org) then raise exception 'Invalid participant';end if;
 if member is null and person is not null then
 select p.user_id into member from public.profiles p join public.memberships m on m.user_id=p.user_id and m.org_id=org and m.status='approved' where p.person_id=person and p.org_id=org and p.approved_at is not null;
 elsif member is not null then
 if not exists(select 1 from public.profiles p join public.memberships m on m.user_id=p.user_id where p.user_id=member and p.approved_at is not null and m.org_id=org and m.status='approved') then return;end if;
 if person is null then select person_id into person from public.profiles where user_id=member and org_id=org;end if;
 end if;
 if person is null and member is null then return;end if;
 select * into existing from private.live_participants where meeting_id=p_meeting and (person_id=person or user_id=member) order by (person_id=person) desc nulls last limit 1 for update;
 if found then
 -- Identity captured at first involvement is not silently transferred to a new
 -- account later linked to that person. Fill only an originally missing user.
 if existing.user_id is null and member is not null then
 delete from private.live_participants where meeting_id=p_meeting and user_id=member and person_id is null and id<>existing.id;
 update private.live_participants set user_id=member where id=existing.id and not exists(select 1 from private.live_participants where meeting_id=p_meeting and user_id=member);
 end if;
 return;
 end if;
 insert into private.live_participants(meeting_id,person_id,user_id) values(p_meeting,person,member) on conflict do nothing;
end $$;

create function private.capture_live_plan() returns trigger language plpgsql security definer set search_path='' as $$
declare person uuid; member uuid;
begin
 if tg_op='UPDATE' and new.status is not distinct from old.status then return null;end if;
 for person in
 select a.person_id from public.assignments a where a.meeting_id=new.meeting_id and a.replaced_by_id is null and a.status<>'unavailable' and
 (a.position_id is not null or exists(select 1 from public.block_assignment_links l join public.meeting_blocks b on b.id=l.block_id where l.assignment_id=a.id and b.revision_id=new.revision_id))
 union select s.person_id from public.block_subactivities s join public.meeting_blocks b on b.id=s.block_id where b.revision_id=new.revision_id and s.person_id is not null
 loop perform private.capture_live_participant(new.meeting_id,person);end loop;
 for member in
 select distinct g.subject_user_id from public.permission_grants g where g.org_id=new.org_id and g.team_id is not null and g.permission in ('assign','confirm') and g.team_id in (
 select team_id from public.meeting_blocks where revision_id=new.revision_id and team_id is not null
 union select team_id from public.meeting_required_positions where meeting_id=new.meeting_id
 union select s.team_id from public.block_subactivities s join public.meeting_blocks b on b.id=s.block_id where b.revision_id=new.revision_id and s.team_id is not null)
 loop perform private.capture_live_participant(new.meeting_id,null,member);end loop;
 perform private.capture_live_participant(new.meeting_id,null,auth.uid());
 return null;
end $$;
create trigger capture_live_plan after insert or update of status on public.meeting_live_state for each row execute function private.capture_live_plan();

create function private.capture_live_staffing_change() returns trigger language plpgsql security definer set search_path='' as $$
declare revision uuid;
begin
 select revision_id into revision from public.meeting_live_state where meeting_id=new.meeting_id and status='running';
 if revision is not null and new.replaced_by_id is null and new.status<>'unavailable' and (new.position_id is not null or exists(select 1 from public.block_assignment_links l join public.meeting_blocks b on b.id=l.block_id where l.assignment_id=new.id and b.revision_id=revision)) then perform private.capture_live_participant(new.meeting_id,new.person_id);end if;
 return null;
end $$;
create trigger capture_live_staffing_change after insert or update on public.assignments for each row execute function private.capture_live_staffing_change();
create function private.capture_live_operator() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.capture_live_participant(new.meeting_id,null,new.actor_user_id);return null;end $$;
create trigger capture_live_operator after insert on private.meeting_live_events for each row execute function private.capture_live_operator();
revoke all on function private.capture_live_participant(uuid,uuid,uuid),private.capture_live_plan(),private.capture_live_staffing_change(),private.capture_live_operator() from public,anon,authenticated;

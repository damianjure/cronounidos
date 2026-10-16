-- Requests retain captured identity; later account linking may only fill NULL.
-- No browser role can run the dispatcher or read feedback comments directly.
create table private.feedback_requests (
 id uuid primary key default gen_random_uuid(),
 participant_id uuid not null unique references private.live_participants(id),
 meeting_id uuid not null references public.meetings(id),
 org_id uuid not null references public.organizations(id),
 person_id uuid references public.people(id),
 user_id uuid references auth.users(id),
 due_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 submitted_at timestamptz,
 check(person_id is not null or user_id is not null)
);
create unique index feedback_requests_user on private.feedback_requests(meeting_id,user_id) where user_id is not null;
create index feedback_requests_org on private.feedback_requests(org_id);
create index feedback_requests_person on private.feedback_requests(person_id) where person_id is not null;
create table private.meeting_feedback (
 request_id uuid primary key references private.feedback_requests(id),
 meeting_id uuid not null references public.meetings(id),
 org_id uuid not null references public.organizations(id),
 submitted_by uuid not null references auth.users(id),
 category text not null check(category in ('all_good','problem','pending','suggestion')),
 comment text check(char_length(comment)<=500),
 created_at timestamptz not null default clock_timestamp(),
 unique(meeting_id,submitted_by)
);
create index meeting_feedback_org on private.meeting_feedback(org_id);
create index meeting_feedback_author on private.meeting_feedback(submitted_by);
create table public.personal_notifications (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references public.organizations(id),
 user_id uuid not null references auth.users(id),
 feedback_request_id uuid not null unique references private.feedback_requests(id),
 created_at timestamptz not null default clock_timestamp(),
 read_at timestamptz
);
create index personal_notifications_user on public.personal_notifications(user_id,created_at desc);
create index personal_notifications_org on public.personal_notifications(org_id);
alter table private.feedback_requests enable row level security;
alter table private.meeting_feedback enable row level security;
alter table public.personal_notifications enable row level security;
revoke all on private.feedback_requests,private.meeting_feedback,public.personal_notifications from public,anon,authenticated;
grant select on public.personal_notifications to authenticated;
create policy personal_notifications_read on public.personal_notifications for select to authenticated
 using(user_id=(select auth.uid()) and private.is_member(org_id));
-- Defense in depth for any future restricted grants: responses are admin-only.
create policy feedback_admin_read on private.meeting_feedback for select to authenticated using(private.can(org_id,'administer'));

create function private.dispatch_due_feedback() returns integer language plpgsql security definer set search_path='' as $$
declare inserted integer;
begin
 -- Lock prevents competing scheduler runs racing identity resolution; all writes
 -- remain in one transaction and UNIQUE constraints are the final safety net.
 perform pg_catalog.pg_advisory_xact_lock(193485,5);
 insert into private.feedback_requests(participant_id,meeting_id,org_id,person_id,user_id,due_at)
 select p.id,p.meeting_id,s.org_id,p.person_id,p.user_id,s.closed_at+interval '10 minutes'
 from private.live_participants p join public.meeting_live_state s on s.meeting_id=p.meeting_id
 where s.status='finished' and s.closed_at+interval '10 minutes'<=clock_timestamp()
 on conflict do nothing;
 get diagnostics inserted=row_count;
 -- Only approved, administratively linked identities may claim a request that
 -- had no account at capture. Never transfer a previously bound recipient.
 update private.feedback_requests r set user_id=p.user_id
 from public.profiles p join public.memberships m on m.user_id=p.user_id and m.org_id=p.org_id
 where r.user_id is null and r.person_id=p.person_id and r.org_id=p.org_id
 and p.approved_at is not null and m.status='approved'
 and not exists(select 1 from private.feedback_requests x where x.meeting_id=r.meeting_id and x.user_id=p.user_id);
 insert into public.personal_notifications(org_id,user_id,feedback_request_id)
 select r.org_id,r.user_id,r.id from private.feedback_requests r
 join public.profiles p on p.user_id=r.user_id and p.approved_at is not null
 join public.memberships m on m.user_id=r.user_id and m.org_id=r.org_id and m.status='approved'
 where r.user_id is not null and r.submitted_at is null
 on conflict(feedback_request_id) do nothing;
 return inserted;
end $$;
revoke all on function private.dispatch_due_feedback() from public,anon,authenticated;

-- Allowlisted DTO: even the author receives only pending/submitted state,
-- never the category/comment stored in the private response table.
create function public.my_feedback_requests(p_org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'meetingId',r.meeting_id,'title',m.title,'dueAt',r.due_at,'submittedAt',r.submitted_at) order by r.due_at desc),'[]'::jsonb)
 from private.feedback_requests r join public.meetings m on m.id=r.meeting_id
 where r.org_id=p_org and r.user_id=auth.uid() and private.is_member(p_org)
$$;
create function public.submit_meeting_feedback(p_request uuid,p_category text,p_comment text default null) returns void language plpgsql security definer set search_path='' as $$
declare r private.feedback_requests; normalized text:=nullif(btrim(p_comment),''); prior private.meeting_feedback;
begin
 select * into r from private.feedback_requests where id=p_request for update;
 if not found or r.user_id is distinct from auth.uid() or not private.is_member(r.org_id) then raise exception 'Forbidden';end if;
 if p_category is null or p_category not in ('all_good','problem','pending','suggestion') or char_length(normalized)>500 then raise exception 'Invalid feedback';end if;
 if r.due_at>clock_timestamp() then raise exception 'Feedback not due';end if;
 select * into prior from private.meeting_feedback where request_id=r.id;
 if found then
 -- A retry after a lost response succeeds only for the identical submission.
 if prior.submitted_by=auth.uid() and prior.category=p_category and prior.comment is not distinct from normalized then return;end if;
 raise exception 'Already submitted';
 end if;
 insert into private.meeting_feedback(request_id,meeting_id,org_id,submitted_by,category,comment)
 values(r.id,r.meeting_id,r.org_id,auth.uid(),p_category,normalized);
 update private.feedback_requests set submitted_at=clock_timestamp() where id=r.id;
 update public.personal_notifications set read_at=coalesce(read_at,clock_timestamp()) where feedback_request_id=r.id and user_id=auth.uid();
end $$;
create function public.admin_meeting_feedback(p_org uuid,p_meeting uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can(p_org,'administer') then raise exception 'Forbidden';end if;
 if not exists(select 1 from public.meetings where id=p_meeting and org_id=p_org) then raise exception 'Meeting not found';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('requestId',r.id,'personId',r.person_id,'userId',r.user_id,'submittedAt',r.submitted_at,'category',f.category,'comment',f.comment) order by r.created_at,r.id),'[]'::jsonb)
 from private.feedback_requests r left join private.meeting_feedback f on f.request_id=r.id where r.org_id=p_org and r.meeting_id=p_meeting);
end $$;
revoke all on function public.my_feedback_requests(uuid),public.submit_meeting_feedback(uuid,text,text),public.admin_meeting_feedback(uuid,uuid) from public,anon,authenticated;
grant execute on function public.my_feedback_requests(uuid),public.submit_meeting_feedback(uuid,text,text),public.admin_meeting_feedback(uuid,uuid) to authenticated;

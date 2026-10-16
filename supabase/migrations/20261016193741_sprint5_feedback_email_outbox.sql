-- Dormant until a configured server worker claims mail; in-app never depends
-- on Brevo. No comments, meeting titles, user metadata or tokens in mail jobs.
create table private.feedback_email_outbox(
 request_id uuid primary key references private.feedback_requests(id),
 status text not null default 'pending' check(status in('pending','processing','retry','accepted','review','failed','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 first_attempt_at timestamptz,next_attempt_at timestamptz not null default clock_timestamp(),
 lease_token uuid,lease_until timestamptz,
 recipient_email text,sender_email text,app_origin text,
 accepted_at timestamptz,provider_message_id text,
 last_error text check(last_error in('transport_uncertain','provider_retry','provider_rejected','provider_duplicate','invalid_response','expired_window','identity_changed','request_answered','invalid_recipient')),
 created_at timestamptz not null default clock_timestamp()
);
create index feedback_email_due on private.feedback_email_outbox(next_attempt_at) where status in('pending','retry','processing');
create table private.feedback_email_attempts(
 request_id uuid not null references private.feedback_email_outbox(request_id),
 attempt integer not null,lease_token uuid not null unique,
 started_at timestamptz not null default clock_timestamp(),finished_at timestamptz,
 outcome text,primary key(request_id,attempt)
);
alter table private.feedback_email_outbox enable row level security;
alter table private.feedback_email_attempts enable row level security;
revoke all on private.feedback_email_outbox,private.feedback_email_attempts from public,anon,authenticated;
create function private.enqueue_feedback_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.feedback_email_outbox(request_id) values(new.feedback_request_id) on conflict do nothing;
 return null;
end $$;
revoke all on function private.enqueue_feedback_email() from public,anon,authenticated;
create trigger enqueue_feedback_email after insert on public.personal_notifications for each row execute function private.enqueue_feedback_email();
insert into private.feedback_email_outbox(request_id)
 select n.feedback_request_id from public.personal_notifications n join private.feedback_requests r on r.id=n.feedback_request_id where r.submitted_at is null on conflict do nothing;

-- Machine-only capability. A browser session, including an administrator, may
-- neither choose recipients nor obtain their email through this endpoint.
create function public.claim_feedback_emails(p_sender text,p_origin text,p_limit integer default 5) returns jsonb language plpgsql security definer set search_path='' as $$
declare job record; token uuid; recipient text; payload jsonb:='[]'; attempt_time timestamptz;
begin
 if p_sender is null or p_sender not like '%@%' or p_sender~E'[\\r\\n]' or length(p_sender)>254 or p_origin is null or p_origin!~'^https?://' or length(p_origin)>2048 then raise exception 'Invalid mail configuration';end if;
 update private.feedback_email_outbox q set status=case when q.attempts=0 then 'cancelled' else 'review' end,last_error='request_answered'
 from private.feedback_requests r where q.request_id=r.id and r.submitted_at is not null and (q.status in('pending','retry') or (q.status='processing' and q.lease_until<clock_timestamp()));
 update private.feedback_email_outbox set status='review',last_error='expired_window'
 where (status in('pending','retry') or (status='processing' and lease_until<clock_timestamp())) and
 (attempts>=5 or first_attempt_at+interval '10 minutes'<=clock_timestamp());
 for job in
 select q.*,r.user_id,r.org_id,u.email from private.feedback_email_outbox q
 join private.feedback_requests r on r.id=q.request_id
 join auth.users u on u.id=r.user_id
 join public.profiles p on p.user_id=u.id and p.approved_at is not null
 join public.memberships m on m.user_id=u.id and m.org_id=r.org_id and m.status='approved'
 where r.submitted_at is null and r.due_at<=clock_timestamp() and u.email_confirmed_at is not null and u.email is not null
 and (q.status in('pending','retry') or (q.status='processing' and q.lease_until<clock_timestamp())) and q.next_attempt_at<=clock_timestamp()
 order by q.next_attempt_at,q.request_id limit greatest(1,least(coalesce(p_limit,5),5)) for update of q skip locked
 loop
 recipient:=lower(btrim(job.email));
 if job.recipient_email is not null and job.recipient_email<>recipient then
 update private.feedback_email_outbox set status='review',last_error='identity_changed' where request_id=job.request_id;continue;
 end if;
 token:=gen_random_uuid();attempt_time:=clock_timestamp();
 update private.feedback_email_outbox set status='processing',attempts=attempts+1,
 first_attempt_at=coalesce(first_attempt_at,attempt_time),lease_token=token,lease_until=attempt_time+interval '2 minutes',
 recipient_email=coalesce(recipient_email,recipient),sender_email=coalesce(sender_email,p_sender),app_origin=coalesce(app_origin,p_origin)
 where request_id=job.request_id;
 insert into private.feedback_email_attempts(request_id,attempt,lease_token) values(job.request_id,job.attempts+1,token);
 payload:=payload||jsonb_build_array(jsonb_build_object('requestId',job.request_id,'leaseToken',token,'recipient',coalesce(job.recipient_email,recipient),'sender',coalesce(job.sender_email,p_sender),'origin',coalesce(job.app_origin,p_origin)));
 end loop;
 return payload;
end $$;

create function public.finish_feedback_email(p_request uuid,p_lease uuid,p_outcome text,p_message_id text default null) returns void language plpgsql security definer set search_path='' as $$
declare job private.feedback_email_outbox; result text; problem text;
begin
 if p_outcome is null or p_outcome not in('accepted','duplicate','retry','uncertain','rejected','invalid_response','invalid_recipient') or length(p_message_id)>256 or p_message_id~E'[\\r\\n]' then raise exception 'Invalid mail outcome';end if;
 select * into job from private.feedback_email_outbox where request_id=p_request for update;
 -- An old worker cannot acknowledge or fail another worker's newer lease.
 if not found or job.lease_token is distinct from p_lease then raise exception 'Stale mail lease';end if;
 if job.status in('accepted','retry','review','failed') and exists(select 1 from private.feedback_email_attempts where lease_token=p_lease and outcome=p_outcome) then return;end if;
 if job.status<>'processing' then raise exception 'Mail not processing';end if;
 if p_outcome='accepted' and nullif(p_message_id,'') is null then raise exception 'Provider message ID required';end if;
 result:=case when p_outcome in('accepted','duplicate') then 'accepted' when p_outcome in('rejected','invalid_recipient') then 'failed' else 'retry' end;
 problem:=case p_outcome when 'accepted' then null when 'duplicate' then 'provider_duplicate' when 'retry' then 'provider_retry' when 'uncertain' then 'transport_uncertain' when 'rejected' then 'provider_rejected' else p_outcome end;
 -- Never automatically resend outside our conservative ten-minute window,
 -- even if the provider's idempotency TTL has already elapsed during downtime.
 if result='retry' and (job.attempts>=5 or clock_timestamp()+make_interval(secs=>60*(2^(job.attempts-1))::integer)>=job.first_attempt_at+interval '10 minutes') then result:='review';end if;
 update private.feedback_email_outbox set status=result,last_error=problem,
 next_attempt_at=clock_timestamp()+make_interval(secs=>60*(2^(job.attempts-1))::integer),
 accepted_at=case when result='accepted' then clock_timestamp() else null end,
 provider_message_id=case when p_outcome='accepted' then p_message_id else null end,
 lease_until=null where request_id=job.request_id;
 update private.feedback_email_attempts set finished_at=clock_timestamp(),outcome=p_outcome where lease_token=p_lease;
end $$;
revoke all on function public.claim_feedback_emails(text,text,integer),public.finish_feedback_email(uuid,uuid,text,text) from public,anon,authenticated;
do $$begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.claim_feedback_emails(text,text,integer),public.finish_feedback_email(uuid,uuid,text,text) to service_role;
 end if;
end $$;

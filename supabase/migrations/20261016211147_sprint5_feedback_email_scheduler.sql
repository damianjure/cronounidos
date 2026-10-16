-- Network dispatch is independently opt-in via owner-managed Vault secrets.
-- No URL/token is accepted from a browser or exposed through a public RPC.
create table private.feedback_email_dispatches(
 network_request_id bigint primary key,created_at timestamptz not null default clock_timestamp()
);
alter table private.feedback_email_dispatches enable row level security;
revoke all on private.feedback_email_dispatches from public,anon,authenticated;
create function private.kick_feedback_email_worker() returns bigint language plpgsql security definer set search_path='' as $$
declare target text; secret text; bypass text; headers jsonb; request bigint;
begin
 if to_regclass('vault.decrypted_secrets') is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return null;end if;
 select decrypted_secret into target from vault.decrypted_secrets where name='crono_unidos_feedback_worker_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='crono_unidos_feedback_worker_secret';
 if target is null or secret is null then return null;end if;
 -- These values are controlled by the database owner, not by app users.
 -- HTTPS, exact path, no credentials/query/fragment/port or header injection.
 if target!~'^https://[a-zA-Z0-9.-]+/api/internal/feedback-email$' or length(target)>2048 or length(secret)<32 or length(secret)>256 or secret~E'[\\r\\n]' then raise exception 'Invalid feedback worker configuration';end if;
 if not exists(select 1 from private.feedback_email_outbox q join private.feedback_requests r on r.id=q.request_id join public.memberships m on m.org_id=r.org_id and m.user_id=r.user_id and m.status='approved' join public.profiles p on p.user_id=r.user_id and p.approved_at is not null join auth.users u on u.id=r.user_id and u.email_confirmed_at is not null where r.submitted_at is null and q.next_attempt_at<=clock_timestamp() and (q.status in('pending','retry') or (q.status='processing' and q.lease_until<clock_timestamp()))) then return null;end if;
 select decrypted_secret into bypass from vault.decrypted_secrets where name='crono_unidos_feedback_vercel_bypass';
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret);
 if bypass is not null then
 if length(bypass)>512 or bypass~E'[\\r\\n]' then raise exception 'Invalid worker protection configuration';end if;
 headers:=headers||jsonb_build_object('x-vercel-protection-bypass',bypass);
 end if;
 select net.http_post(url:=target,body:='{}'::jsonb,headers:=headers,timeout_milliseconds:=65000) into request;
 insert into private.feedback_email_dispatches(network_request_id) values(request);
 -- Keep only this worker's dispatch metadata; never mutate other cron jobs.
 delete from private.feedback_email_dispatches where created_at<clock_timestamp()-interval '7 days';
 return request;
end $$;
revoke all on function private.kick_feedback_email_worker() from public,anon,authenticated;
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('crono-unidos-feedback-email','* * * * *','select private.kick_feedback_email_worker()');
 else
  raise notice 'Feedback email scheduling unavailable: pg_cron is not installed';
 end if;
end $$;

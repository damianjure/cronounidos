-- Never send a frozen Preview sender/origin from a newly configured environment.
-- Preserve the old idempotent payload, but require explicit operator review.
alter table private.feedback_email_outbox drop constraint feedback_email_outbox_last_error_check;
alter table private.feedback_email_outbox add constraint feedback_email_outbox_last_error_check check(last_error in('transport_uncertain','provider_retry','provider_rejected','provider_duplicate','invalid_response','expired_window','identity_changed','request_answered','invalid_recipient','configuration_changed'));

create or replace function public.finish_feedback_email(p_request uuid,p_lease uuid,p_outcome text,p_message_id text default null) returns void language plpgsql security definer set search_path='' as $$
declare job private.feedback_email_outbox; result text; problem text;
begin
 if p_outcome is null or p_outcome not in('accepted','duplicate','retry','uncertain','rejected','invalid_response','invalid_recipient','configuration_changed') or length(p_message_id)>256 or p_message_id~E'[\\r\\n]' then raise exception 'Invalid mail outcome';end if;
 select * into job from private.feedback_email_outbox where request_id=p_request for update;
 -- An old worker cannot acknowledge or fail another worker's newer lease.
 if not found or job.lease_token is distinct from p_lease then raise exception 'Stale mail lease';end if;
 if job.status in('accepted','retry','review','failed') and exists(select 1 from private.feedback_email_attempts where lease_token=p_lease and outcome=p_outcome) then return;end if;
 if job.status<>'processing' then raise exception 'Mail not processing';end if;
 if p_outcome='accepted' and nullif(p_message_id,'') is null then raise exception 'Provider message ID required';end if;
 result:=case when p_outcome='configuration_changed' then 'review' when p_outcome in('accepted','duplicate') then 'accepted' when p_outcome in('rejected','invalid_recipient') then 'failed' else 'retry' end;
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

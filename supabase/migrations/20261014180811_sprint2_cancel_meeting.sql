-- Cancellation is versioned and hides the agenda without deleting its history.
create function public.cancel_editor_meeting(p_meeting uuid,p_expected_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare m public.meetings;
begin
  select * into m from public.meetings where id=p_meeting for update;
  if m.id is null or not private.can(m.org_id,'plan') then
    raise exception 'Forbidden';
  end if;
  if m.version<>p_expected_version then
    raise exception 'Version conflict';
  end if;
  if m.status in ('finished','cancelled') then
    raise exception 'Meeting closed';
  end if;
  update public.meetings
  set status='cancelled',version=version+1
  where id=m.id;
end
$$;
revoke all on function public.cancel_editor_meeting(uuid,integer) from public,anon;
grant execute on function public.cancel_editor_meeting(uuid,integer) to authenticated;

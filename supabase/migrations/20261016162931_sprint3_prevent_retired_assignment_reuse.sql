-- Old published revisions keep their original links, but editing from an old
-- snapshot must never revive a replaced person's previous confirmation.
create function private.validate_current_block_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.assignments a join public.meeting_blocks b on b.id=new.block_id join public.meeting_revisions r on r.id=b.revision_id where a.id=new.assignment_id and a.org_id=new.org_id and b.org_id=new.org_id and a.meeting_id=r.meeting_id and a.replaced_by_id is null) then raise exception 'Invalid or replaced canonical assignment';end if;
 return new;
end $$;
create trigger validate_current_block_link before insert or update on public.block_assignment_links for each row execute function private.validate_current_block_link();
revoke all on function private.validate_current_block_link() from public,anon,authenticated;

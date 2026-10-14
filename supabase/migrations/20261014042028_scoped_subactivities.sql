-- A parallel subactivity may belong to a different team than its parent block.
-- Parent timing visibility does not grant access to the child's private notes.
create function private.subactivity_can(p_block uuid,p_team uuid,p_permission public.permission_action)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from public.meeting_blocks b where b.id=p_block
 and private.revision_visible(b.revision_id)
 and private.can(b.org_id,p_permission,coalesce(p_team,b.team_id))
 )
$$;
revoke all on function private.subactivity_can(uuid,uuid,public.permission_action) from public,anon,authenticated;
grant execute on function private.subactivity_can(uuid,uuid,public.permission_action) to authenticated;
drop policy read_rows on public.block_subactivities;
create policy read_rows on public.block_subactivities for select to authenticated
using(private.subactivity_can(block_id,team_id,'read_content'));

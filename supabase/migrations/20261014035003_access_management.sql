-- Narrow administration RPCs. User identity links are never writable by the user.
create function public.link_member_person(p_org uuid,p_user uuid,p_person uuid) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not private.can(p_org,'administer') then raise exception 'Forbidden';end if;
 if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_user) then raise exception 'Membership required';end if;
 if p_person is not null and not exists(select 1 from public.people where id=p_person and org_id=p_org) then raise exception 'Invalid person';end if;
 if exists(select 1 from public.profiles where user_id=p_user and person_id is not null and org_id<>p_org) then raise exception 'Identity already linked in another organization';end if;
 update public.profiles set org_id=case when p_person is null then null else p_org end,person_id=p_person where user_id=p_user;
 end
$$;
create function public.set_member_status(p_org uuid,p_user uuid,p_status public.member_status) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not private.can(p_org,'administer') then raise exception 'Forbidden';end if;
 if p_status='approved' then raise exception 'Use approve_member';end if;
 if p_user=auth.uid() then raise exception 'Cannot suspend own account';end if;
 update public.memberships set status=p_status where org_id=p_org and user_id=p_user;
 if not found then raise exception 'Membership required';end if;
 end
$$;
create function private.validate_revision() returns trigger language plpgsql set search_path='' as $$
 begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Invalid IANA timezone';end if;
 if tg_op='UPDATE' and (new.org_id<>old.org_id or new.meeting_id<>old.meeting_id or new.created_by<>old.created_by) then raise exception 'Revision identity is immutable';end if;
 return new;end
$$;
create trigger validate_revision before insert or update on public.meeting_revisions for each row execute function private.validate_revision();
-- RLS cannot guard individual columns in a timing row: org-wide libraries and team
-- scoped linked content have distinct SELECT policies, without leaking other songs.
drop policy read_rows on public.songs;
create policy read_rows on public.songs for select to authenticated using(private.can(org_id,'read_content') or exists(select 1 from public.block_songs bs where bs.song_id=songs.id and private.block_can(bs.block_id,'read_content')));
drop policy read_rows on public.announcements;
create policy read_rows on public.announcements for select to authenticated using(private.can(org_id,'read_content') or exists(select 1 from public.block_announcements ba where ba.announcement_id=announcements.id and private.block_can(ba.block_id,'read_content')));
drop policy read_rows on public.messages;
create policy read_rows on public.messages for select to authenticated using(private.can(org_id,'read_content') or exists(select 1 from public.block_messages bm where bm.message_id=messages.id and private.block_can(bm.block_id,'read_content')));
drop policy read_rows on public.resources;
create policy read_rows on public.resources for select to authenticated using(private.can(org_id,'read_content') or exists(select 1 from public.resource_links rl where rl.resource_id=resources.id and rl.block_id is not null and private.block_can(rl.block_id,'read_content')));
revoke all on function public.link_member_person(uuid,uuid,uuid) from public,anon;
revoke all on function public.set_member_status(uuid,uuid,public.member_status) from public,anon;
grant execute on function public.link_member_person(uuid,uuid,uuid) to authenticated;
grant execute on function public.set_member_status(uuid,uuid,public.member_status) to authenticated;
revoke all on function private.validate_revision() from public,anon,authenticated;

alter table public.permission_grants add constraint admin_organization_scope check(permission<>'administer' or team_id is null);
-- Revisions cannot impersonate another creator through the Data API.
drop policy insert_rows on public.meeting_revisions;
create policy insert_rows on public.meeting_revisions for insert to authenticated with check(private.can(org_id,'plan') and created_by=auth.uid() and published_at is null);
-- Directly marking a revision published would skip the version lock. Column
-- grants force authenticated callers through publish_revision instead.
revoke update on public.meeting_revisions from authenticated;
grant update(timezone,scheduled_start) on public.meeting_revisions to authenticated;
revoke update on public.meetings from authenticated;
grant update(title,date,timezone,start_local_time,meeting_type_id,series_id) on public.meetings to authenticated;
-- Access grants are administrative, but any admin can revoke another admin's grants.
drop policy delete_rows on public.permission_grants;
create policy delete_rows on public.permission_grants for delete to authenticated using(private.can(org_id,'administer'));
alter table public.meetings add constraint positive_meeting_version check(version>0);
alter table public.meeting_blocks add column type_version integer check(type_version>0);
alter table public.meeting_blocks add column field_schema_snapshot jsonb not null default '[]' check(jsonb_typeof(field_schema_snapshot)='array');
create function private.snapshot_block_type() returns trigger language plpgsql set search_path='' as $$
 begin
 if new.block_type_id is not null then
 select version,field_schema_json into new.type_version,new.field_schema_snapshot from public.block_types where org_id=new.org_id and id=new.block_type_id;
 end if;
 return new;end
$$;
create trigger snapshot_type before insert on public.meeting_blocks for each row execute function private.snapshot_block_type();
revoke all on function private.snapshot_block_type() from public,anon,authenticated;
-- Read-only Auth email projection for identifying approval requests. Only the
-- account itself or an authorized org administrator can SELECT its profile.
alter table public.profiles add column email text;
update public.profiles p set email=u.email from auth.users u where u.id=p.user_id;
create or replace function private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
 begin insert into public.profiles(user_id,display_name,email) values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''),'Nueva cuenta'),100),new.email);return new;end
$$;
create function private.sync_profile_email() returns trigger language plpgsql security definer set search_path='' as $$
 begin update public.profiles set email=new.email where user_id=new.id;return new;end
$$;
create trigger sync_auth_email after update of email on auth.users for each row execute function private.sync_profile_email();
revoke all on function private.new_profile() from public,anon,authenticated;
revoke all on function private.sync_profile_email() from public,anon,authenticated;

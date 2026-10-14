-- Sprint 1. All authorization uses database membership/grants, never editable JWT metadata.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create type public.member_status as enum ('pending','approved','suspended');
create type public.permission_action as enum ('administer','plan','assign','edit_roles','confirm','read_agenda','read_people','read_content','operate_live');
create type public.position_priority as enum ('critical','required','optional');
create type public.confirmation_status as enum ('pending','confirmed','unavailable');
create type public.editorial_status as enum ('draft','published','finished','cancelled');

create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null check(slug ~ '^[a-z0-9-]{2,60}$'), timezone text not null default 'America/Argentina/Buenos_Aires'
);
create table public.people (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), first_name text not null, last_name text not null, active boolean not null default true, unique(org_id,id)
);
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade, org_id uuid references public.organizations(id), person_id uuid unique, display_name text not null default 'Nueva cuenta', approved_at timestamptz,
 foreign key(org_id,person_id) references public.people(org_id,id), check(person_id is null or org_id is not null)
);
create table public.memberships (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), user_id uuid not null references public.profiles(user_id) on delete cascade, status public.member_status not null default 'pending', unique(org_id,user_id)
);
create table public.teams (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), name text not null, active boolean not null default true, unique(org_id,id), unique(org_id,name)
);
create table public.roles (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), team_id uuid, name text not null, active boolean not null default true, unique(org_id,id), foreign key(org_id,team_id) references public.teams(org_id,id), unique(org_id,team_id,name)
);
create table public.team_memberships (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), team_id uuid not null, person_id uuid not null,
 foreign key(org_id,team_id) references public.teams(org_id,id), foreign key(org_id,person_id) references public.people(org_id,id), unique(team_id,person_id)
);
create table public.permission_grants (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id), subject_user_id uuid not null references auth.users(id), team_id uuid, permission public.permission_action not null, granted_by uuid references auth.users(id),
 foreign key(org_id,team_id) references public.teams(org_id,id), foreign key(org_id,subject_user_id) references public.memberships(org_id,user_id), unique nulls not distinct(org_id,subject_user_id,team_id,permission)
);
-- SECURITY DEFINER is confined to a non-exposed schema for recursion-free RLS lookups.
create function private.is_member(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.memberships m join public.profiles p on p.user_id=m.user_id where m.org_id=p_org and m.user_id=auth.uid() and m.status='approved' and p.approved_at is not null)
$$;
create function private.can(p_org uuid,p_permission public.permission_action,p_team uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member(p_org) and exists(select 1 from public.permission_grants g where g.org_id=p_org and g.subject_user_id=auth.uid() and ((g.permission='administer' and g.team_id is null) or (g.permission=p_permission and (g.team_id is null or (p_team is not null and g.team_id=p_team)))))
$$;
create function private.my_person(p_org uuid,p_person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_member(p_org) and exists(select 1 from public.profiles where user_id=auth.uid() and org_id=p_org and person_id=p_person)
$$;
create function private.shared_profile(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.memberships m where m.user_id=p_user and private.can(m.org_id,'administer'))
$$;
create function public.has_permission(p_org uuid,p_permission public.permission_action,p_team uuid default null) returns boolean language sql stable security invoker set search_path='' as $$ select private.can(p_org,p_permission,p_team) $$;
create function private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
 begin insert into public.profiles(user_id,display_name) values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''),'Nueva cuenta'),100));return new;end
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.new_profile();
create function public.request_access(p_slug text) returns void language plpgsql security definer set search_path='' as $$
 declare org uuid; begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select id into org from public.organizations where slug=p_slug;
 if org is null then raise exception 'Organization unavailable';end if;
 insert into public.memberships(org_id,user_id) values(org,auth.uid()) on conflict(org_id,user_id) do nothing;
 end
$$;
create function public.register_invited_member(p_org uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
 begin if not private.can(p_org,'administer') then raise exception 'Forbidden';end if;
 insert into public.memberships(org_id,user_id) values(p_org,p_user) on conflict(org_id,user_id) do nothing;end
$$;
create function public.approve_member(p_org uuid,p_user uuid,p_role text,p_team uuid default null) returns void language plpgsql security definer set search_path='' as $$
 declare actions public.permission_action[]; action public.permission_action;
 begin
 if not private.can(p_org,'administer') then raise exception 'Forbidden';end if;
 if p_role not in ('admin','planner','leader','member') then raise exception 'Invalid role';end if;
 if p_role='leader' and p_team is null then raise exception 'Team required';end if;
 if p_team is not null and not exists(select 1 from public.teams where id=p_team and org_id=p_org) then raise exception 'Invalid team';end if;
 update public.memberships set status='approved' where org_id=p_org and user_id=p_user;
 if not found then raise exception 'Membership required';end if;
 update public.profiles set approved_at=coalesce(approved_at,now()) where user_id=p_user;
 -- Approval adds a preset, it does not silently revoke other manually configured grants.
 insert into public.permission_grants(org_id,subject_user_id,permission,granted_by) values(p_org,p_user,'read_agenda',auth.uid()) on conflict do nothing;
 actions=case p_role when 'admin' then array['administer']::public.permission_action[] when 'planner' then array['plan','assign','edit_roles','confirm','read_people','read_content','operate_live']::public.permission_action[] when 'leader' then array['assign','edit_roles','confirm','read_people','read_content']::public.permission_action[] else array[]::public.permission_action[] end;
 foreach action in array actions loop
 insert into public.permission_grants(org_id,subject_user_id,team_id,permission,granted_by) values(p_org,p_user,case when p_role='leader' then p_team else null end,action,auth.uid()) on conflict do nothing;
 end loop;end
$$;

create table public.meeting_types(id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),name text not null,color text not null check(color ~ '^#[0-9a-fA-F]{6}$'),unique(org_id,id));
create table public.series(id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),title text not null,unique(org_id,id));
create table public.meeting_templates(id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),name text not null,definition_version integer not null default 1 check(definition_version>0),definition_json jsonb not null default '{}' check(jsonb_typeof(definition_json)='object'),unique(org_id,id));
create table public.block_types(id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),name text not null,field_schema_json jsonb not null default '[]' check(jsonb_typeof(field_schema_json)='array'),version integer not null default 1 check(version>0),unique(org_id,id));
create table public.meetings(
 id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),meeting_type_id uuid,series_id uuid,title text not null,date date not null,timezone text not null default 'America/Argentina/Buenos_Aires',start_local_time time not null,status public.editorial_status not null default 'draft',published_revision_id uuid,closed_at timestamptz,version integer not null default 1,
 unique(org_id,id),foreign key(org_id,meeting_type_id) references public.meeting_types(org_id,id),foreign key(org_id,series_id) references public.series(org_id,id)
);
create table public.meeting_revisions(
 id uuid primary key default gen_random_uuid(),org_id uuid not null,meeting_id uuid not null,revision integer not null check(revision>0),created_by uuid not null references auth.users(id),published_at timestamptz,scheduled_start timestamptz not null,timezone text not null default 'America/Argentina/Buenos_Aires',
 unique(org_id,id),unique(meeting_id,id),unique(meeting_id,revision),foreign key(org_id,meeting_id) references public.meetings(org_id,id)
);
alter table public.meetings add foreign key(id,published_revision_id) references public.meeting_revisions(meeting_id,id) deferrable initially deferred;
create table public.meeting_blocks(
 id uuid primary key default gen_random_uuid(),org_id uuid not null,revision_id uuid not null,block_type_id uuid,team_id uuid,sort_order integer not null check(sort_order>=0),name text not null,duration_seconds integer not null check(duration_seconds between 0 and 86400),visibility text not null default 'public' check(visibility in ('public','internal')),
 unique(org_id,id),unique(revision_id,sort_order) deferrable initially deferred,foreign key(org_id,revision_id) references public.meeting_revisions(org_id,id),foreign key(org_id,block_type_id) references public.block_types(org_id,id),foreign key(org_id,team_id) references public.teams(org_id,id)
);
-- Split notes/custom fields from timing columns; read_agenda must not imply read_content.
create table public.block_details(id uuid primary key default gen_random_uuid(),org_id uuid not null,block_id uuid not null unique,notes text,custom_fields_json jsonb not null default '{}' check(jsonb_typeof(custom_fields_json)='object'),foreign key(org_id,block_id) references public.meeting_blocks(org_id,id));
create table public.block_subactivities(id uuid primary key default gen_random_uuid(),org_id uuid not null,block_id uuid not null,team_id uuid,title text not null,offset_seconds integer not null check(offset_seconds>=0),duration_seconds integer not null check(duration_seconds between 0 and 86400),notes text,custom_fields_json jsonb not null default '{}',unique(org_id,id),foreign key(org_id,block_id) references public.meeting_blocks(org_id,id),foreign key(org_id,team_id) references public.teams(org_id,id));
create table public.meeting_required_positions(id uuid primary key default gen_random_uuid(),org_id uuid not null,meeting_id uuid not null,team_id uuid not null,role_id uuid not null,priority public.position_priority not null,quantity_index integer not null default 1 check(quantity_index>0),unique(org_id,id),unique(meeting_id,id),unique(meeting_id,role_id,quantity_index),foreign key(org_id,meeting_id) references public.meetings(org_id,id),foreign key(org_id,team_id) references public.teams(org_id,id),foreign key(org_id,role_id) references public.roles(org_id,id));
create table public.assignments(id uuid primary key default gen_random_uuid(),org_id uuid not null,meeting_id uuid not null,position_id uuid,block_id uuid,person_id uuid not null,status public.confirmation_status not null default 'pending',responded_at timestamptz,replaced_by_id uuid references public.assignments(id),unique(org_id,id),foreign key(org_id,meeting_id) references public.meetings(org_id,id),foreign key(meeting_id,position_id) references public.meeting_required_positions(meeting_id,id),foreign key(org_id,block_id) references public.meeting_blocks(org_id,id),foreign key(org_id,person_id) references public.people(org_id,id),check(position_id is not null or block_id is not null));
create unique index one_current_assignment_per_position on public.assignments(position_id) where replaced_by_id is null and status<>'unavailable';
create table public.assignment_events(id uuid primary key default gen_random_uuid(),org_id uuid not null,assignment_id uuid not null,event text not null,actor_user_id uuid references auth.users(id),at timestamptz not null default now(),details_json jsonb not null default '{}',foreign key(org_id,assignment_id) references public.assignments(org_id,id));
create table public.assignment_conflict_exceptions(id uuid primary key default gen_random_uuid(),org_id uuid not null,meeting_id uuid not null,person_id uuid not null,assignment_1_id uuid not null,assignment_2_id uuid not null,justification text not null check(length(trim(justification))>=10),approved_by uuid not null references auth.users(id),foreign key(org_id,meeting_id) references public.meetings(org_id,id),foreign key(org_id,person_id) references public.people(org_id,id),foreign key(org_id,assignment_1_id) references public.assignments(org_id,id),foreign key(org_id,assignment_2_id) references public.assignments(org_id,id),check(assignment_1_id<>assignment_2_id));
create table public.songs(id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),title text not null,artist text,active boolean not null default true,external_ids_json jsonb not null default '{}',unique(org_id,id));
create table public.announcements(id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),title text not null,description text,active boolean not null default true,unique(org_id,id));
create table public.messages(id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),series_id uuid,title text not null,preacher_person_id uuid,foreign key(org_id,series_id) references public.series(org_id,id),foreign key(org_id,preacher_person_id) references public.people(org_id,id),unique(org_id,id));
create table public.resources(id uuid primary key default gen_random_uuid(),org_id uuid not null references public.organizations(id),title text not null,url text check(url ~ '^https://'),storage_path text,resource_type text not null,check(url is not null or storage_path is not null),unique(org_id,id));
create table public.block_songs(id uuid primary key default gen_random_uuid(),org_id uuid not null,block_id uuid not null,song_id uuid not null,sort_order integer not null default 0,foreign key(org_id,block_id) references public.meeting_blocks(org_id,id),foreign key(org_id,song_id) references public.songs(org_id,id));
create table public.block_announcements(id uuid primary key default gen_random_uuid(),org_id uuid not null,block_id uuid not null,announcement_id uuid not null,sort_order integer not null default 0,foreign key(org_id,block_id) references public.meeting_blocks(org_id,id),foreign key(org_id,announcement_id) references public.announcements(org_id,id));
create table public.block_messages(id uuid primary key default gen_random_uuid(),org_id uuid not null,block_id uuid not null,message_id uuid not null,sort_order integer not null default 0,foreign key(org_id,block_id) references public.meeting_blocks(org_id,id),foreign key(org_id,message_id) references public.messages(org_id,id));
create table public.resource_links(id uuid primary key default gen_random_uuid(),org_id uuid not null,resource_id uuid not null,block_id uuid,announcement_id uuid,foreign key(org_id,resource_id) references public.resources(org_id,id),foreign key(org_id,block_id) references public.meeting_blocks(org_id,id),foreign key(org_id,announcement_id) references public.announcements(org_id,id),check(num_nonnulls(block_id,announcement_id)=1));

create function private.revision_visible(p_revision uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.meeting_revisions r join public.meetings m on m.id=r.meeting_id where r.id=p_revision and (private.can(r.org_id,'plan') or (m.published_revision_id=r.id and r.published_at is not null and private.can(r.org_id,'read_agenda'))))
$$;
create function private.block_can(p_block uuid,p_permission public.permission_action) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.meeting_blocks b where b.id=p_block and private.revision_visible(b.revision_id) and private.can(b.org_id,p_permission,b.team_id))
$$;
create function private.assignment_can(p_assignment uuid,p_permission public.permission_action) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.assignments a left join public.meeting_required_positions p on p.id=a.position_id left join public.meeting_blocks b on b.id=a.block_id where a.id=p_assignment and (private.can(a.org_id,p_permission,coalesce(p.team_id,b.team_id)) or (p_permission='confirm' and private.my_person(a.org_id,a.person_id))))
$$;
-- Immutable published revisions and child content; editing requires a new draft.
create function private.freeze_revision() returns trigger language plpgsql set search_path='' as $$
 begin if old.published_at is not null then raise exception 'Published revision is immutable';end if;return case when tg_op='DELETE' then old else new end;end
$$;
create trigger freeze_revision before update or delete on public.meeting_revisions for each row execute function private.freeze_revision();
create function private.freeze_block() returns trigger language plpgsql security definer set search_path='' as $$
 declare r uuid; oldr uuid; begin
 if tg_table_name='meeting_blocks' then
 if tg_op<>'DELETE' then r=new.revision_id;end if;if tg_op<>'INSERT' then oldr=old.revision_id;end if;
 else
 if tg_op<>'DELETE' then select revision_id into r from public.meeting_blocks where id=new.block_id;end if;
 if tg_op<>'INSERT' then select revision_id into oldr from public.meeting_blocks where id=old.block_id;end if;
 end if;
 if exists(select 1 from public.meeting_revisions where id in (r,oldr) and published_at is not null) then raise exception 'Published content is immutable';end if;
 return case when tg_op='DELETE' then old else new end;end
$$;
create function private.validate_meeting() returns trigger language plpgsql set search_path='' as $$
 begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Invalid IANA timezone';end if;
 if new.published_revision_id is not null and not exists(select 1 from public.meeting_revisions r where r.id=new.published_revision_id and r.meeting_id=new.id and r.published_at is not null) then raise exception 'Revision must be published';end if;
 if new.status in ('published','finished') and new.published_revision_id is null then raise exception 'Published revision required';end if;
 return new;end
$$;
create trigger validate_meeting before insert or update on public.meetings for each row execute function private.validate_meeting();
create function private.validate_position() returns trigger language plpgsql set search_path='' as $$
 begin if not exists(select 1 from public.roles where id=new.role_id and org_id=new.org_id and (team_id is null or team_id=new.team_id)) then raise exception 'Role must belong to position team';end if;return new;end
$$;
create trigger validate_position before insert or update on public.meeting_required_positions for each row execute function private.validate_position();
create function private.validate_assignment() returns trigger language plpgsql set search_path='' as $$
 begin
 if new.block_id is not null and not exists(select 1 from public.meeting_blocks b join public.meeting_revisions r on r.id=b.revision_id where b.id=new.block_id and r.meeting_id=new.meeting_id) then raise exception 'Block must belong to meeting';end if;
 if new.replaced_by_id is not null and not exists(select 1 from public.assignments a where a.id=new.replaced_by_id and a.org_id=new.org_id and a.meeting_id=new.meeting_id and a.position_id is not distinct from new.position_id and a.id<>new.id) then raise exception 'Invalid replacement';end if;
 return new;end
$$;
create trigger validate_assignment before insert or update on public.assignments for each row execute function private.validate_assignment();
create function private.audit_assignment() returns trigger language plpgsql security definer set search_path='' as $$
 begin insert into public.assignment_events(org_id,assignment_id,event,actor_user_id,details_json) values(new.org_id,new.id,case when tg_op='INSERT' then 'created' else 'changed' end,auth.uid(),jsonb_build_object('status',new.status,'replaced_by_id',new.replaced_by_id,'previous_status',case when tg_op='UPDATE' then old.status else null end));return new;end
$$;
create trigger audit_assignment after insert or update on public.assignments for each row execute function private.audit_assignment();
-- Own confirmations are an atomic, narrow RPC; no direct UPDATE grant to participants.
create function public.confirm_assignment(p_assignment uuid,p_status public.confirmation_status) returns void language plpgsql security definer set search_path='' as $$
 begin if not private.assignment_can(p_assignment,'confirm') then raise exception 'Forbidden';end if;
 update public.assignments set status=p_status,responded_at=now() where id=p_assignment and replaced_by_id is null;
 if not found then raise exception 'Assignment no longer current';end if;end
$$;
create function public.publish_revision(p_meeting uuid,p_revision uuid,p_expected_version integer) returns void language plpgsql security definer set search_path='' as $$
 declare m public.meetings; begin
 select * into m from public.meetings where id=p_meeting for update;
 if m.id is null or not private.can(m.org_id,'plan') then raise exception 'Forbidden';end if;
 if m.version<>p_expected_version then raise exception 'Version conflict';end if;
 if m.status in ('finished','cancelled') then raise exception 'Meeting closed';end if;
 update public.meeting_revisions set published_at=now() where id=p_revision and meeting_id=p_meeting and published_at is null;
 if not found then raise exception 'Draft revision required';end if;
 update public.meetings set published_revision_id=p_revision,status='published',version=version+1 where id=p_meeting;
 end
$$;
-- This is the ONLY anon entry point. It intentionally bypasses RLS to project a tiny allowlist.
create function public.public_agenda(p_meeting uuid default null) returns table(meeting_id uuid,activity text,starts_at timestamptz,duration_seconds integer,timezone text,sort_order integer) language sql stable security definer set search_path='' as $$
 with upcoming as (
 select m.id,r.id revision_id,r.scheduled_start,r.timezone from public.meetings m join public.meeting_revisions r on r.id=m.published_revision_id and r.meeting_id=m.id
 where m.status='published' and r.published_at is not null and (p_meeting is null or m.id=p_meeting) and (p_meeting is not null or r.scheduled_start>=now()-interval '1 day') order by r.scheduled_start limit 20
 ), timed as (
 select u.id,u.timezone,b.name,b.visibility,b.sort_order,b.duration_seconds,u.scheduled_start+coalesce(sum(b.duration_seconds) over(partition by u.id order by b.sort_order rows between unbounded preceding and 1 preceding),0)*interval '1 second' starts_at from upcoming u join public.meeting_blocks b on b.revision_id=u.revision_id
 ) select id,name,starts_at,duration_seconds,timezone,sort_order from timed where visibility='public' order by starts_at,sort_order
$$;
create trigger freeze_content before insert or update or delete on public.meeting_blocks for each row execute function private.freeze_block();
create trigger freeze_content before insert or update or delete on public.block_details for each row execute function private.freeze_block();
create trigger freeze_content before insert or update or delete on public.block_subactivities for each row execute function private.freeze_block();
create trigger freeze_content before insert or update or delete on public.block_songs for each row execute function private.freeze_block();
create trigger freeze_content before insert or update or delete on public.block_announcements for each row execute function private.freeze_block();
create trigger freeze_content before insert or update or delete on public.block_messages for each row execute function private.freeze_block();
create trigger freeze_content before insert or update or delete on public.resource_links for each row execute function private.freeze_block();
alter table public.organizations enable row level security;
revoke all on public.organizations from anon,authenticated;
grant select,insert,update,delete on public.organizations to authenticated;
alter table public.people enable row level security;
revoke all on public.people from anon,authenticated;
grant select,insert,update,delete on public.people to authenticated;
alter table public.profiles enable row level security;
revoke all on public.profiles from anon,authenticated;
grant select,insert,update,delete on public.profiles to authenticated;
alter table public.memberships enable row level security;
revoke all on public.memberships from anon,authenticated;
grant select,insert,update,delete on public.memberships to authenticated;
alter table public.teams enable row level security;
revoke all on public.teams from anon,authenticated;
grant select,insert,update,delete on public.teams to authenticated;
alter table public.roles enable row level security;
revoke all on public.roles from anon,authenticated;
grant select,insert,update,delete on public.roles to authenticated;
alter table public.team_memberships enable row level security;
revoke all on public.team_memberships from anon,authenticated;
grant select,insert,update,delete on public.team_memberships to authenticated;
alter table public.permission_grants enable row level security;
revoke all on public.permission_grants from anon,authenticated;
grant select,insert,update,delete on public.permission_grants to authenticated;
alter table public.meeting_types enable row level security;
revoke all on public.meeting_types from anon,authenticated;
grant select,insert,update,delete on public.meeting_types to authenticated;
alter table public.series enable row level security;
revoke all on public.series from anon,authenticated;
grant select,insert,update,delete on public.series to authenticated;
alter table public.meeting_templates enable row level security;
revoke all on public.meeting_templates from anon,authenticated;
grant select,insert,update,delete on public.meeting_templates to authenticated;
alter table public.block_types enable row level security;
revoke all on public.block_types from anon,authenticated;
grant select,insert,update,delete on public.block_types to authenticated;
alter table public.meetings enable row level security;
revoke all on public.meetings from anon,authenticated;
grant select,insert,update,delete on public.meetings to authenticated;
alter table public.meeting_revisions enable row level security;
revoke all on public.meeting_revisions from anon,authenticated;
grant select,insert,update,delete on public.meeting_revisions to authenticated;
alter table public.meeting_blocks enable row level security;
revoke all on public.meeting_blocks from anon,authenticated;
grant select,insert,update,delete on public.meeting_blocks to authenticated;
alter table public.block_details enable row level security;
revoke all on public.block_details from anon,authenticated;
grant select,insert,update,delete on public.block_details to authenticated;
alter table public.block_subactivities enable row level security;
revoke all on public.block_subactivities from anon,authenticated;
grant select,insert,update,delete on public.block_subactivities to authenticated;
alter table public.meeting_required_positions enable row level security;
revoke all on public.meeting_required_positions from anon,authenticated;
grant select,insert,update,delete on public.meeting_required_positions to authenticated;
alter table public.assignments enable row level security;
revoke all on public.assignments from anon,authenticated;
grant select,insert,update,delete on public.assignments to authenticated;
alter table public.assignment_events enable row level security;
revoke all on public.assignment_events from anon,authenticated;
grant select,insert,update,delete on public.assignment_events to authenticated;
alter table public.assignment_conflict_exceptions enable row level security;
revoke all on public.assignment_conflict_exceptions from anon,authenticated;
grant select,insert,update,delete on public.assignment_conflict_exceptions to authenticated;
alter table public.songs enable row level security;
revoke all on public.songs from anon,authenticated;
grant select,insert,update,delete on public.songs to authenticated;
alter table public.announcements enable row level security;
revoke all on public.announcements from anon,authenticated;
grant select,insert,update,delete on public.announcements to authenticated;
alter table public.messages enable row level security;
revoke all on public.messages from anon,authenticated;
grant select,insert,update,delete on public.messages to authenticated;
alter table public.resources enable row level security;
revoke all on public.resources from anon,authenticated;
grant select,insert,update,delete on public.resources to authenticated;
alter table public.block_songs enable row level security;
revoke all on public.block_songs from anon,authenticated;
grant select,insert,update,delete on public.block_songs to authenticated;
alter table public.block_announcements enable row level security;
revoke all on public.block_announcements from anon,authenticated;
grant select,insert,update,delete on public.block_announcements to authenticated;
alter table public.block_messages enable row level security;
revoke all on public.block_messages from anon,authenticated;
grant select,insert,update,delete on public.block_messages to authenticated;
alter table public.resource_links enable row level security;
revoke all on public.resource_links from anon,authenticated;
grant select,insert,update,delete on public.resource_links to authenticated;
create policy read_org on public.organizations for select to authenticated using (private.is_member(id));
create policy edit_org on public.organizations for update to authenticated using (private.can(id,'administer')) with check (private.can(id,'administer'));
create policy read_profiles on public.profiles for select to authenticated using (user_id=auth.uid() or private.shared_profile(user_id));
create policy read_memberships on public.memberships for select to authenticated using (user_id=auth.uid() or private.can(org_id,'administer'));
create policy read_rows on public.permission_grants for select to authenticated using (subject_user_id=auth.uid() or private.can(org_id,'administer'));
create policy insert_rows on public.permission_grants for insert to authenticated with check (private.can(org_id,'administer') and granted_by=auth.uid());
create policy update_rows on public.permission_grants for update to authenticated using (private.can(org_id,'administer') and granted_by=auth.uid()) with check (private.can(org_id,'administer') and granted_by=auth.uid());
create policy delete_rows on public.permission_grants for delete to authenticated using (private.can(org_id,'administer') and granted_by=auth.uid());
create policy read_rows on public.teams for select to authenticated using (private.can(org_id,'read_agenda'));
create policy insert_rows on public.teams for insert to authenticated with check (private.can(org_id,'edit_roles',id));
create policy update_rows on public.teams for update to authenticated using (private.can(org_id,'edit_roles',id)) with check (private.can(org_id,'edit_roles',id));
create policy delete_rows on public.teams for delete to authenticated using (private.can(org_id,'edit_roles',id));
create policy read_rows on public.roles for select to authenticated using (private.can(org_id,'read_people',team_id));
create policy insert_rows on public.roles for insert to authenticated with check (private.can(org_id,'edit_roles',team_id));
create policy update_rows on public.roles for update to authenticated using (private.can(org_id,'edit_roles',team_id)) with check (private.can(org_id,'edit_roles',team_id));
create policy delete_rows on public.roles for delete to authenticated using (private.can(org_id,'edit_roles',team_id));
create policy read_rows on public.team_memberships for select to authenticated using (private.can(org_id,'read_people',team_id) or private.my_person(org_id,person_id));
create policy insert_rows on public.team_memberships for insert to authenticated with check (private.can(org_id,'assign',team_id));
create policy update_rows on public.team_memberships for update to authenticated using (private.can(org_id,'assign',team_id)) with check (private.can(org_id,'assign',team_id));
create policy delete_rows on public.team_memberships for delete to authenticated using (private.can(org_id,'assign',team_id));
create policy read_rows on public.people for select to authenticated using (private.can(org_id,'read_people') or private.my_person(org_id,id) or exists(select 1 from public.team_memberships tm where tm.person_id=people.id and tm.org_id=people.org_id and private.can(tm.org_id,'read_people',tm.team_id)));
create policy insert_rows on public.people for insert to authenticated with check (private.can(org_id,'assign'));
create policy update_rows on public.people for update to authenticated using (private.can(org_id,'assign')) with check (private.can(org_id,'assign'));
create policy delete_rows on public.people for delete to authenticated using (private.can(org_id,'assign'));
create policy read_rows on public.meeting_types for select to authenticated using (private.can(org_id,'read_agenda'));
create policy insert_rows on public.meeting_types for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.meeting_types for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.meeting_types for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.series for select to authenticated using (private.can(org_id,'read_content'));
create policy insert_rows on public.series for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.series for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.series for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.block_types for select to authenticated using (private.can(org_id,'read_agenda'));
create policy insert_rows on public.block_types for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.block_types for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.block_types for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.meeting_templates for select to authenticated using (private.can(org_id,'plan'));
create policy insert_rows on public.meeting_templates for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.meeting_templates for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.meeting_templates for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.meetings for select to authenticated using (private.can(org_id,'plan') or (published_revision_id is not null and private.can(org_id,'read_agenda')));
create policy insert_rows on public.meetings for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.meetings for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.meetings for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.meeting_revisions for select to authenticated using (private.revision_visible(id));
create policy insert_rows on public.meeting_revisions for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.meeting_revisions for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.meeting_revisions for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.meeting_blocks for select to authenticated using (private.revision_visible(revision_id));
create policy insert_rows on public.meeting_blocks for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.meeting_blocks for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.meeting_blocks for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.block_details for select to authenticated using (private.block_can(block_id,'read_content'));
create policy insert_rows on public.block_details for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.block_details for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.block_details for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.block_subactivities for select to authenticated using (private.block_can(block_id,'read_content'));
create policy insert_rows on public.block_subactivities for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.block_subactivities for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.block_subactivities for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.block_songs for select to authenticated using (private.block_can(block_id,'read_content'));
create policy insert_rows on public.block_songs for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.block_songs for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.block_songs for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.block_announcements for select to authenticated using (private.block_can(block_id,'read_content'));
create policy insert_rows on public.block_announcements for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.block_announcements for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.block_announcements for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.block_messages for select to authenticated using (private.block_can(block_id,'read_content'));
create policy insert_rows on public.block_messages for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.block_messages for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.block_messages for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.meeting_required_positions for select to authenticated using (private.can(org_id,'assign',team_id) or private.can(org_id,'read_people',team_id));
create policy insert_rows on public.meeting_required_positions for insert to authenticated with check (private.can(org_id,'assign',team_id));
create policy update_rows on public.meeting_required_positions for update to authenticated using (private.can(org_id,'assign',team_id)) with check (private.can(org_id,'assign',team_id));
create policy delete_rows on public.meeting_required_positions for delete to authenticated using (private.can(org_id,'assign',team_id));
create policy read_assignments on public.assignments for select to authenticated using (private.assignment_can(id,'assign') or private.assignment_can(id,'confirm'));
create policy insert_rows on public.assignments for insert to authenticated with check ((position_id is null or exists(select 1 from public.meeting_required_positions p where p.id=assignments.position_id and private.can(p.org_id,'assign',p.team_id))) and (block_id is null or private.block_can(block_id,'assign')));
create policy update_rows on public.assignments for update to authenticated using ((position_id is null or exists(select 1 from public.meeting_required_positions p where p.id=assignments.position_id and private.can(p.org_id,'assign',p.team_id))) and (block_id is null or private.block_can(block_id,'assign'))) with check ((position_id is null or exists(select 1 from public.meeting_required_positions p where p.id=assignments.position_id and private.can(p.org_id,'assign',p.team_id))) and (block_id is null or private.block_can(block_id,'assign')));
create policy read_events on public.assignment_events for select to authenticated using (private.assignment_can(assignment_id,'confirm') or private.assignment_can(assignment_id,'assign'));
create policy read_rows on public.assignment_conflict_exceptions for select to authenticated using (private.can(org_id,'assign'));
create policy insert_rows on public.assignment_conflict_exceptions for insert to authenticated with check (private.can(org_id,'assign') and approved_by=auth.uid());
create policy update_rows on public.assignment_conflict_exceptions for update to authenticated using (private.can(org_id,'assign') and approved_by=auth.uid()) with check (private.can(org_id,'assign') and approved_by=auth.uid());
create policy delete_rows on public.assignment_conflict_exceptions for delete to authenticated using (private.can(org_id,'assign') and approved_by=auth.uid());
create policy read_rows on public.songs for select to authenticated using (private.can(org_id,'read_content'));
create policy insert_rows on public.songs for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.songs for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.songs for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.announcements for select to authenticated using (private.can(org_id,'read_content'));
create policy insert_rows on public.announcements for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.announcements for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.announcements for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.messages for select to authenticated using (private.can(org_id,'read_content'));
create policy insert_rows on public.messages for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.messages for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.messages for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.resources for select to authenticated using (private.can(org_id,'read_content'));
create policy insert_rows on public.resources for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.resources for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.resources for delete to authenticated using (private.can(org_id,'plan'));
create policy read_rows on public.resource_links for select to authenticated using ((block_id is not null and private.block_can(block_id,'read_content')) or (block_id is null and private.can(org_id,'read_content')));
create policy insert_rows on public.resource_links for insert to authenticated with check (private.can(org_id,'plan'));
create policy update_rows on public.resource_links for update to authenticated using (private.can(org_id,'plan')) with check (private.can(org_id,'plan'));
create policy delete_rows on public.resource_links for delete to authenticated using (private.can(org_id,'plan'));
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.can(uuid,public.permission_action,uuid) to authenticated;
grant execute on function private.my_person(uuid,uuid) to authenticated;
grant execute on function private.shared_profile(uuid) to authenticated;
grant execute on function private.revision_visible(uuid) to authenticated;
grant execute on function private.block_can(uuid,public.permission_action) to authenticated;
grant execute on function private.assignment_can(uuid,public.permission_action) to authenticated;
revoke all on function public.has_permission(uuid,public.permission_action,uuid) from public,anon;
grant execute on function public.has_permission(uuid,public.permission_action,uuid) to authenticated;
revoke all on function public.request_access(text) from public,anon;
grant execute on function public.request_access(text) to authenticated;
revoke all on function public.register_invited_member(uuid,uuid) from public,anon;
grant execute on function public.register_invited_member(uuid,uuid) to authenticated;
revoke all on function public.approve_member(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.approve_member(uuid,uuid,text,uuid) to authenticated;
revoke all on function public.confirm_assignment(uuid,public.confirmation_status) from public,anon;
grant execute on function public.confirm_assignment(uuid,public.confirmation_status) to authenticated;
revoke all on function public.publish_revision(uuid,uuid,integer) from public,anon;
grant execute on function public.publish_revision(uuid,uuid,integer) to authenticated;
revoke all on function public.public_agenda(uuid) from public;
grant execute on function public.public_agenda(uuid) to anon,authenticated;
create index people_org_idx on public.people(org_id);
create index memberships_org_idx on public.memberships(org_id);
create index teams_org_idx on public.teams(org_id);
create index roles_org_idx on public.roles(org_id);
create index team_memberships_org_idx on public.team_memberships(org_id);
create index permission_grants_org_idx on public.permission_grants(org_id);
create index meeting_types_org_idx on public.meeting_types(org_id);
create index series_org_idx on public.series(org_id);
create index meeting_templates_org_idx on public.meeting_templates(org_id);
create index block_types_org_idx on public.block_types(org_id);
create index meetings_org_idx on public.meetings(org_id);
create index meeting_revisions_org_idx on public.meeting_revisions(org_id);
create index meeting_blocks_org_idx on public.meeting_blocks(org_id);
create index block_details_org_idx on public.block_details(org_id);
create index block_subactivities_org_idx on public.block_subactivities(org_id);
create index meeting_required_positions_org_idx on public.meeting_required_positions(org_id);
create index assignments_org_idx on public.assignments(org_id);
create index assignment_events_org_idx on public.assignment_events(org_id);
create index assignment_conflict_exceptions_org_idx on public.assignment_conflict_exceptions(org_id);
create index songs_org_idx on public.songs(org_id);
create index announcements_org_idx on public.announcements(org_id);
create index messages_org_idx on public.messages(org_id);
create index resources_org_idx on public.resources(org_id);
create index block_songs_org_idx on public.block_songs(org_id);
create index block_announcements_org_idx on public.block_announcements(org_id);
create index block_messages_org_idx on public.block_messages(org_id);
create index resource_links_org_idx on public.resource_links(org_id);
create index memberships_user_idx on public.memberships(user_id);
create index team_memberships_person_idx on public.team_memberships(person_id);
create index meeting_blocks_revision_idx on public.meeting_blocks(revision_id,sort_order);
create index grants_lookup_idx on public.permission_grants(subject_user_id,org_id,permission,team_id);
create index assignments_person_idx on public.assignments(person_id);
create index assignment_events_assignment_idx on public.assignment_events(assignment_id);

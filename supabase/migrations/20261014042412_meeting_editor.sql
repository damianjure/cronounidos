-- Sprint 2, first vertical slice: atomic editor snapshots. Never writes remote DB.
alter table public.meetings add column draft_revision_id uuid;
alter table public.meetings add foreign key(id,draft_revision_id) references public.meeting_revisions(meeting_id,id) deferrable initially deferred;
alter table public.meeting_revisions add column title text;
alter table public.meeting_revisions add column local_date date;
alter table public.meeting_revisions add column start_local_time time;
alter table public.meeting_revisions add column meeting_type_id uuid;
alter table public.meeting_revisions add column series_id uuid;
alter table public.meeting_revisions add foreign key(org_id,meeting_type_id) references public.meeting_types(org_id,id);
alter table public.meeting_revisions add foreign key(org_id,series_id) references public.series(org_id,id);
alter table public.meeting_blocks add column client_key uuid not null default gen_random_uuid();
alter table public.meeting_blocks add unique(revision_id,client_key);
alter table public.block_subactivities add column client_key uuid not null default gen_random_uuid();
alter table public.block_subactivities add column field_schema_snapshot jsonb not null default '[]';
alter table public.assignments add column team_id uuid;
alter table public.assignments add column role_id uuid;
alter table public.assignments add foreign key(org_id,team_id) references public.teams(org_id,id);
alter table public.assignments add foreign key(org_id,role_id) references public.roles(org_id,id);
create table public.block_assignment_links(
 id uuid primary key default gen_random_uuid(),org_id uuid not null,
 block_id uuid not null,assignment_id uuid not null,
 foreign key(org_id,block_id) references public.meeting_blocks(org_id,id),
 foreign key(org_id,assignment_id) references public.assignments(org_id,id),unique(block_id,assignment_id)
);
alter table public.block_assignment_links enable row level security;
revoke all on public.block_assignment_links from public,anon,authenticated;
grant select on public.block_assignment_links to authenticated;
create index block_assignment_links_org_idx on public.block_assignment_links(org_id);
create index block_assignment_links_assignment_idx on public.block_assignment_links(assignment_id);
create policy read_links on public.block_assignment_links for select to authenticated
using(private.block_can(block_id,'read_content') and private.assignment_can(assignment_id,'assign'));
create function private.validate_assignment_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.meeting_blocks b join public.meeting_revisions r on r.id=b.revision_id join public.assignments a on a.id=new.assignment_id where b.id=new.block_id and a.meeting_id=r.meeting_id and a.org_id=r.org_id) then raise exception 'Cross-meeting assignment link';end if;
 if exists(select 1 from public.meeting_blocks b join public.meeting_revisions r on r.id=b.revision_id where b.id=new.block_id and r.published_at is not null) then raise exception 'Published content is immutable';end if;
 return new;end
$$;
create trigger check_link before insert or update on public.block_assignment_links for each row execute function private.validate_assignment_link();
create function private.editor_allowed(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.can(p_org,'plan') and private.can(p_org,'read_content') and private.can(p_org,'read_people') and private.can(p_org,'assign')
$$;
create function public.can_edit_meetings(p_org uuid) returns boolean language sql stable security invoker set search_path='' as $$ select private.editor_allowed(p_org) $$;
create function private.check_fields(p_schema jsonb,p_values jsonb) returns void language plpgsql set search_path='' as $$
declare field jsonb; val jsonb; key text; kind text;
begin
 if jsonb_typeof(p_schema)<>'array' or jsonb_typeof(p_values)<>'object' or jsonb_array_length(p_schema)>50 then raise exception 'Invalid custom fields';end if;
 if (select count(distinct f->>'key') from jsonb_array_elements(p_schema) f)<>jsonb_array_length(p_schema) then raise exception 'Duplicate custom field';end if;
 for key in select jsonb_object_keys(p_values) loop
 if not exists(select 1 from jsonb_array_elements(p_schema) f where f->>'key'=key) then raise exception 'Unknown custom field';end if;
 end loop;
 for field in select value from jsonb_array_elements(p_schema) loop
 key=field->>'key';kind=field->>'type';val=p_values->key;
 if coalesce(jsonb_typeof(field->'key'),'missing')<>'string' or coalesce(jsonb_typeof(field->'type'),'missing')<>'string' or coalesce(jsonb_typeof(field->'label'),'missing')<>'string' or key !~ '^[a-z][a-z0-9_]{0,49}$' or key in ('duration','duration_seconds','team_id','person_id','song_id','role_id') or length(field->>'label') not between 1 and 100 or kind not in ('text','number','url','date','select','checkbox') then raise exception 'Invalid field schema';end if;
 if kind='select' and (coalesce(jsonb_typeof(field->'options'),'missing')<>'array' or jsonb_array_length(field->'options')=0 or jsonb_array_length(field->'options')>50) then raise exception 'Invalid selection options';end if;
 if val is null or val='null'::jsonb or val='""'::jsonb then continue;end if;
 if kind in ('text','url','date','select') and jsonb_typeof(val)<>'string' then raise exception 'Invalid custom field value';end if;
 if kind='number' and jsonb_typeof(val)<>'number' or kind='checkbox' and jsonb_typeof(val)<>'boolean' then raise exception 'Invalid custom field value';end if;
 if kind='url' and (val#>>'{}') !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then raise exception 'Unsafe URL';end if;
 if kind='date' then if (val#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid field date';end if;perform (val#>>'{}')::date;end if;
 if kind='select' and not coalesce(field->'options','[]'::jsonb) @> jsonb_build_array(val) then raise exception 'Invalid selection';end if;
 if kind='text' and length(val#>>'{}')>12000 then raise exception 'Field too long';end if;
 end loop;end
$$;
create function private.write_editor_revision(p_meeting uuid,p_metadata jsonb,p_blocks jsonb,p_reset_people boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare m public.meetings; rev uuid; sequence integer; b jsonb; sub jsonb; person jsonb; key uuid; new_block_id uuid; old_block uuid; existing_assignment uuid; ref uuid; idx integer=0; old public.meeting_blocks; definition jsonb; selected_team uuid; selected_role uuid;
begin
 select * into m from public.meetings where id=p_meeting;
 if length(p_blocks::text)>524288 then raise exception 'Snapshot too large';end if;
 if jsonb_typeof(p_blocks)<>'array' or jsonb_array_length(p_blocks)>200 or jsonb_typeof(p_metadata)<>'object' then raise exception 'Invalid snapshot';end if;
 if length(trim(p_metadata->>'title')) not between 1 and 200 or (p_metadata->>'startLocalTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (p_metadata->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid meeting metadata';end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_metadata->>'timezone') then raise exception 'Invalid IANA timezone';end if;
 select coalesce(max(revision),0)+1 into sequence from public.meeting_revisions where meeting_id=m.id;
 insert into public.meeting_revisions(org_id,meeting_id,revision,created_by,scheduled_start,timezone,title,local_date,start_local_time,meeting_type_id,series_id)
 values(m.org_id,m.id,sequence,auth.uid(),((p_metadata->>'date')::date+(p_metadata->>'startLocalTime')::time) at time zone (p_metadata->>'timezone'),p_metadata->>'timezone',trim(p_metadata->>'title'),(p_metadata->>'date')::date,(p_metadata->>'startLocalTime')::time,(p_metadata->>'meetingTypeId')::uuid,(p_metadata->>'seriesId')::uuid) returning id into rev;
 for b in select value from jsonb_array_elements(p_blocks) loop
 if length(trim(b->>'name')) not between 1 and 200 or coalesce(b->>'visibility','public') not in ('public','internal') or length(coalesce(b->>'notes',''))>12000 then raise exception 'Invalid block';end if;
 old_block=(b->>'id')::uuid; old=null;
 if old_block is not null then
 select * into old from public.meeting_blocks where id=old_block and org_id=m.org_id;
 if old.id is null or (not p_reset_people and not exists(select 1 from public.meeting_revisions where id=old.revision_id and meeting_id=m.id)) then raise exception 'Invalid source block';end if;
 end if;
 definition=coalesce(b->'fieldSchema','[]'::jsonb);
 perform private.check_fields(definition,coalesce(b->'customFields','{}'::jsonb));
 insert into public.meeting_blocks(org_id,revision_id,block_type_id,team_id,sort_order,name,duration_seconds,visibility,client_key)
 values(m.org_id,rev,(b->>'blockTypeId')::uuid,(b->>'teamId')::uuid,idx,trim(b->>'name'),(b->>'durationSeconds')::integer,coalesce(b->>'visibility','public'),coalesce((b->>'clientKey')::uuid,gen_random_uuid())) returning id into new_block_id;
 update public.meeting_blocks set field_schema_snapshot=definition,type_version=case when old.block_type_id is not distinct from (b->>'blockTypeId')::uuid then coalesce(old.type_version,type_version) else type_version end where id=new_block_id;
 insert into public.block_details(org_id,block_id,notes,custom_fields_json) values(m.org_id,new_block_id,coalesce(b->>'notes',''),coalesce(b->'customFields','{}'::jsonb));
 for ref in select value::text::uuid from jsonb_array_elements_text(coalesce(b->'songIds','[]')) loop insert into public.block_songs(org_id,block_id,song_id,sort_order) values(m.org_id,new_block_id,ref,(select count(*) from public.block_songs where block_id=new_block_id));end loop;
 for ref in select value::text::uuid from jsonb_array_elements_text(coalesce(b->'announcementIds','[]')) loop insert into public.block_announcements(org_id,block_id,announcement_id,sort_order) values(m.org_id,new_block_id,ref,(select count(*) from public.block_announcements where block_id=new_block_id));end loop;
 for ref in select value::text::uuid from jsonb_array_elements_text(coalesce(b->'messageIds','[]')) loop insert into public.block_messages(org_id,block_id,message_id) values(m.org_id,new_block_id,ref);end loop;
 for ref in select value::text::uuid from jsonb_array_elements_text(coalesce(b->'resourceIds','[]')) loop insert into public.resource_links(org_id,block_id,resource_id) values(m.org_id,new_block_id,ref);end loop;
 for person in select value from jsonb_array_elements(coalesce(b->'responsibles','[]')) loop
 existing_assignment=null;selected_team=(person->>'teamId')::uuid;selected_role=(person->>'roleId')::uuid;
 if selected_role is not null and not exists(select 1 from public.roles where id=selected_role and org_id=m.org_id and (team_id is null or team_id is not distinct from selected_team)) then raise exception 'Invalid responsible role';end if;
 if not p_reset_people and person->>'assignmentId' is not null then
 select a.id into existing_assignment from public.assignments a where a.id=(person->>'assignmentId')::uuid and a.org_id=m.org_id and a.meeting_id=m.id and a.person_id=(person->>'personId')::uuid and a.team_id is not distinct from selected_team and a.role_id is not distinct from selected_role and (a.block_id=old_block or exists(select 1 from public.block_assignment_links l where l.assignment_id=a.id and l.block_id=old_block));
 if existing_assignment is null then raise exception 'Invalid canonical assignment';end if;
 end if;
 if existing_assignment is null then
 insert into public.assignments(org_id,meeting_id,block_id,person_id,team_id,role_id,status,responded_at) values(m.org_id,m.id,new_block_id,(person->>'personId')::uuid,selected_team,selected_role,'pending',null) returning id into existing_assignment;
 end if;
 insert into public.block_assignment_links(org_id,block_id,assignment_id) values(m.org_id,new_block_id,existing_assignment);
 end loop;
 for sub in select value from jsonb_array_elements(coalesce(b->'subactivities','[]')) loop
 if (sub->>'offsetSeconds')::integer+(sub->>'durationSeconds')::integer>(b->>'durationSeconds')::integer or length(trim(sub->>'title')) not between 1 and 200 or length(coalesce(sub->>'notes',''))>12000 then raise exception 'Invalid parallel activity';end if;
 perform private.check_fields(coalesce(sub->'fieldSchema','[]'),coalesce(sub->'customFields','{}'));
 insert into public.block_subactivities(org_id,block_id,team_id,title,offset_seconds,duration_seconds,notes,custom_fields_json,client_key,field_schema_snapshot) values(m.org_id,new_block_id,(sub->>'teamId')::uuid,trim(sub->>'title'),(sub->>'offsetSeconds')::integer,(sub->>'durationSeconds')::integer,coalesce(sub->>'notes',''),coalesce(sub->'customFields','{}'),coalesce((sub->>'clientKey')::uuid,gen_random_uuid()),coalesce(sub->'fieldSchema','[]'));
 end loop;
 idx=idx+1;
 end loop;
 return rev;end
$$;
create function private.editor_snapshot(p_meeting uuid,p_revision uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('meetingId',m.id,'version',m.version,'revisionId',r.id,'publishedRevisionId',m.published_revision_id,
 'metadata',jsonb_build_object('title',coalesce(r.title,m.title),'date',coalesce(r.local_date,m.date)::text,'startLocalTime',to_char(coalesce(r.start_local_time,m.start_local_time),'HH24:MI'),'timezone',coalesce(r.timezone,m.timezone),'meetingTypeId',case when r.title is null then m.meeting_type_id else r.meeting_type_id end,'seriesId',case when r.title is null then m.series_id else r.series_id end),
 'blocks',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'clientKey',b.client_key,'blockTypeId',b.block_type_id,'teamId',b.team_id,'name',b.name,'durationSeconds',b.duration_seconds,'visibility',b.visibility,'notes',coalesce(d.notes,''),'fieldSchema',b.field_schema_snapshot,'customFields',coalesce(d.custom_fields_json,'{}'),
 'songIds',coalesce((select jsonb_agg(song_id order by sort_order) from public.block_songs where block_id=b.id),'[]'),
 'announcementIds',coalesce((select jsonb_agg(announcement_id order by sort_order) from public.block_announcements where block_id=b.id),'[]'),
 'messageIds',coalesce((select jsonb_agg(message_id order by sort_order) from public.block_messages where block_id=b.id),'[]'),
 'resourceIds',coalesce((select jsonb_agg(resource_id) from public.resource_links where block_id=b.id),'[]'),
 'responsibles',coalesce((select jsonb_agg(jsonb_build_object('assignmentId',a.id,'personId',a.person_id,'teamId',a.team_id,'roleId',a.role_id)) from public.assignments a where a.org_id=m.org_id and a.meeting_id=m.id and a.replaced_by_id is null and (a.block_id=b.id or exists(select 1 from public.block_assignment_links l where l.assignment_id=a.id and l.block_id=b.id))),'[]'),
 'subactivities',coalesce((select jsonb_agg(jsonb_build_object('clientKey',s.client_key,'title',s.title,'teamId',s.team_id,'offsetSeconds',s.offset_seconds,'durationSeconds',s.duration_seconds,'notes',coalesce(s.notes,''),'fieldSchema',s.field_schema_snapshot,'customFields',s.custom_fields_json)) from public.block_subactivities s where s.block_id=b.id),'[]')) order by b.sort_order) from public.meeting_blocks b left join public.block_details d on d.block_id=b.id where b.revision_id=r.id),'[]'))
 from public.meetings m left join public.meeting_revisions r on r.id=coalesce(p_revision,m.draft_revision_id,m.published_revision_id) and r.meeting_id=m.id where m.id=p_meeting
$$;
create function public.get_editor_snapshot(p_meeting uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;begin select org_id into org from public.meetings where id=p_meeting;if org is null or not private.editor_allowed(org) then raise exception 'Forbidden';end if;return private.editor_snapshot(p_meeting);end
$$;
create function public.create_editor_meeting(p_org uuid,p_metadata jsonb,p_template uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare meeting uuid; revision uuid; blocks jsonb='[]';begin
 if not private.editor_allowed(p_org) then raise exception 'Forbidden';end if;
 if p_template is not null then select definition_json->'blocks' into blocks from public.meeting_templates where id=p_template and org_id=p_org;if blocks is null then raise exception 'Invalid template';end if;end if;
 insert into public.meetings(org_id,title,date,start_local_time,timezone,meeting_type_id,series_id) values(p_org,p_metadata->>'title',(p_metadata->>'date')::date,(p_metadata->>'startLocalTime')::time,p_metadata->>'timezone',(p_metadata->>'meetingTypeId')::uuid,(p_metadata->>'seriesId')::uuid) returning id into meeting;
 revision=private.write_editor_revision(meeting,p_metadata,blocks,true);
 update public.meetings set draft_revision_id=revision where id=meeting;
 return private.editor_snapshot(meeting);end
$$;
create function public.save_editor_snapshot(p_meeting uuid,p_expected_version integer,p_metadata jsonb,p_blocks jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.meetings; revision uuid;begin
 select * into m from public.meetings where id=p_meeting for update;
 if m.id is null or not private.editor_allowed(m.org_id) then raise exception 'Forbidden';end if;
 if m.version<>p_expected_version then raise exception 'Version conflict';end if;
 if m.status in ('finished','cancelled') then raise exception 'Meeting closed';end if;
 revision=private.write_editor_revision(m.id,p_metadata,p_blocks);
 update public.meetings set draft_revision_id=revision,version=version+1 where id=m.id;
 return private.editor_snapshot(m.id);end
$$;
create or replace function public.publish_revision(p_meeting uuid,p_revision uuid,p_expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare m public.meetings; r public.meeting_revisions;begin
 select * into m from public.meetings where id=p_meeting for update;
 if m.id is null or not private.can(m.org_id,'plan') then raise exception 'Forbidden';end if;
 if m.version<>p_expected_version then raise exception 'Version conflict';end if;
 if m.status in ('finished','cancelled') then raise exception 'Meeting closed';end if;
 select * into r from public.meeting_revisions where id=p_revision and meeting_id=m.id and published_at is null;
 if r.id is null then raise exception 'Draft revision required';end if;
 if m.draft_revision_id is not null and m.draft_revision_id<>r.id then raise exception 'Draft revision required';end if;
 insert into public.assignment_events(org_id,assignment_id,event,actor_user_id,details_json)
 select m.org_id,a.id,'removed_from_published_plan',auth.uid(),jsonb_build_object('previous_revision',m.published_revision_id,'revision',r.id)
 from public.assignments a where a.meeting_id=m.id
 and exists(select 1 from public.meeting_blocks b where b.revision_id=m.published_revision_id and (a.block_id=b.id or exists(select 1 from public.block_assignment_links l where l.assignment_id=a.id and l.block_id=b.id)))
 and not exists(select 1 from public.meeting_blocks b where b.revision_id=r.id and (a.block_id=b.id or exists(select 1 from public.block_assignment_links l where l.assignment_id=a.id and l.block_id=b.id)));
 update public.meeting_revisions set published_at=now() where id=r.id;
 update public.meetings set published_revision_id=r.id,draft_revision_id=null,status='published',version=version+1,
 title=coalesce(r.title,m.title),date=coalesce(r.local_date,m.date),start_local_time=coalesce(r.start_local_time,m.start_local_time),timezone=r.timezone,
 meeting_type_id=case when r.title is null then m.meeting_type_id else r.meeting_type_id end,series_id=case when r.title is null then m.series_id else r.series_id end where id=m.id;
 end
$$;
create function public.publish_editor_snapshot(p_meeting uuid,p_expected_version integer,p_metadata jsonb,p_blocks jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;begin
 snapshot=public.save_editor_snapshot(p_meeting,p_expected_version,p_metadata,p_blocks);
 perform public.publish_revision(p_meeting,(snapshot->>'revisionId')::uuid,(snapshot->>'version')::integer);
 return private.editor_snapshot(p_meeting);end
$$;
create function public.duplicate_editor_meeting(p_source uuid,p_metadata jsonb,p_options jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.meetings; target uuid; revision uuid; snapshot jsonb; blocks jsonb='[]'; b jsonb; opt text; pos public.meeting_required_positions; new_position uuid; a public.assignments;
begin
 select * into m from public.meetings where id=p_source;
 if m.id is null or not private.editor_allowed(m.org_id) then raise exception 'Forbidden';end if;
 foreach opt in array array['structure','responsibles','songs','announcements','notes','resources'] loop if coalesce(jsonb_typeof(p_options->opt),'missing')<>'boolean' then raise exception 'Invalid copy options';end if;end loop;
 snapshot=private.editor_snapshot(m.id);
 if (p_options->>'structure')::boolean then
 for b in select value from jsonb_array_elements(snapshot->'blocks') loop
 b=jsonb_set(b,'{clientKey}',to_jsonb(gen_random_uuid()));
 if not (p_options->>'notes')::boolean then b=jsonb_set(jsonb_set(jsonb_set(b,'{notes}','""'),'{customFields}','{}'),'{messageIds}','[]');b=jsonb_set(b,'{subactivities}',coalesce((select jsonb_agg(jsonb_set(jsonb_set(jsonb_set(s,'{notes}','""'),'{customFields}','{}'),'{clientKey}',to_jsonb(gen_random_uuid()))) from jsonb_array_elements(b->'subactivities') s),'[]'));end if;
 if not (p_options->>'responsibles')::boolean then b=jsonb_set(b,'{responsibles}','[]');end if;
 if not (p_options->>'songs')::boolean then b=jsonb_set(b,'{songIds}','[]');end if;
 if not (p_options->>'announcements')::boolean then b=jsonb_set(b,'{announcementIds}','[]');end if;
 if not (p_options->>'resources')::boolean then b=jsonb_set(b,'{resourceIds}','[]');end if;
 blocks=blocks||jsonb_build_array(b);
 end loop;end if;
 insert into public.meetings(org_id,title,date,start_local_time,timezone,meeting_type_id,series_id) values(m.org_id,p_metadata->>'title',(p_metadata->>'date')::date,(p_metadata->>'startLocalTime')::time,p_metadata->>'timezone',(p_metadata->>'meetingTypeId')::uuid,(p_metadata->>'seriesId')::uuid) returning id into target;
 revision=private.write_editor_revision(target,p_metadata,blocks,true);
 if (p_options->>'structure')::boolean then
 for pos in select * from public.meeting_required_positions where meeting_id=m.id loop
 insert into public.meeting_required_positions(org_id,meeting_id,team_id,role_id,priority,quantity_index) values(m.org_id,target,pos.team_id,pos.role_id,pos.priority,pos.quantity_index) returning id into new_position;
 if (p_options->>'responsibles')::boolean then
 select * into a from public.assignments where position_id=pos.id and replaced_by_id is null order by (status<>'unavailable') desc,responded_at desc nulls last,id limit 1;
 if a.id is not null then insert into public.assignments(org_id,meeting_id,position_id,person_id,team_id,role_id,status,responded_at) values(m.org_id,target,new_position,a.person_id,a.team_id,a.role_id,'pending',null);end if;
 end if;end loop;end if;
 update public.meetings set draft_revision_id=revision where id=target;
 return private.editor_snapshot(target);end
$$;
-- API writes must go through the versioned editor; no direct mutable draft updates.
revoke insert,update,delete on public.meetings,public.meeting_revisions,public.meeting_blocks,public.block_details,public.block_subactivities,public.block_songs,public.block_announcements,public.block_messages,public.resource_links from authenticated;
revoke update(title,date,timezone,start_local_time,meeting_type_id,series_id) on public.meetings from authenticated;
revoke update(timezone,scheduled_start) on public.meeting_revisions from authenticated;
revoke all on function private.validate_assignment_link() from public,anon,authenticated;
revoke all on function private.editor_allowed(uuid) from public,anon,authenticated;
revoke all on function private.check_fields(jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.write_editor_revision(uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
revoke all on function private.editor_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function private.editor_allowed(uuid) to authenticated;
revoke all on function public.can_edit_meetings(uuid) from public,anon;
grant execute on function public.can_edit_meetings(uuid) to authenticated;
revoke all on function public.get_editor_snapshot(uuid) from public,anon;
grant execute on function public.get_editor_snapshot(uuid) to authenticated;
revoke all on function public.create_editor_meeting(uuid,jsonb,uuid) from public,anon;
grant execute on function public.create_editor_meeting(uuid,jsonb,uuid) to authenticated;
revoke all on function public.save_editor_snapshot(uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.save_editor_snapshot(uuid,integer,jsonb,jsonb) to authenticated;
revoke all on function public.publish_editor_snapshot(uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.publish_editor_snapshot(uuid,integer,jsonb,jsonb) to authenticated;
revoke all on function public.duplicate_editor_meeting(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.duplicate_editor_meeting(uuid,jsonb,jsonb) to authenticated;

create or replace function private.assignment_can(p_assignment uuid,p_permission public.permission_action) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from public.assignments a left join public.meeting_required_positions p on p.id=a.position_id left join public.meeting_blocks b on b.id=a.block_id join public.meetings m on m.id=a.meeting_id
 where a.id=p_assignment
 and (a.position_id is not null or private.can(a.org_id,'plan') or b.revision_id=m.published_revision_id or exists(select 1 from public.block_assignment_links l join public.meeting_blocks lb on lb.id=l.block_id where l.assignment_id=a.id and lb.revision_id=m.published_revision_id))
 and (private.can(a.org_id,p_permission,coalesce(a.team_id,p.team_id,b.team_id)) or (p_permission='confirm' and private.my_person(a.org_id,a.person_id))))
$$;

-- Block-oriented lookups stay bounded as revision history grows.
create index block_songs_block_idx on public.block_songs(block_id,sort_order);
create index block_announcements_block_idx on public.block_announcements(block_id,sort_order);
create index block_messages_block_idx on public.block_messages(block_id,sort_order);
create index resource_links_block_idx on public.resource_links(block_id);
create index subactivities_block_idx on public.block_subactivities(block_id);
create index assignments_meeting_idx on public.assignments(meeting_id);
create index assignments_block_idx on public.assignments(block_id);

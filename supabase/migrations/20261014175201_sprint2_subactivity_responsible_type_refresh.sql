-- Sprint 2: optional responsible for each parallel activity; refresh type version only when explicitly matched to current schema.
alter table public.block_subactivities add column person_id uuid;
alter table public.block_subactivities add foreign key(org_id,person_id) references public.people(org_id,id);
create index subactivities_person_idx on public.block_subactivities(person_id) where person_id is not null;

create or replace function private.write_editor_revision(p_meeting uuid,p_metadata jsonb,p_blocks jsonb,p_reset_people boolean default false)
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
 update public.meeting_blocks set field_schema_snapshot=definition,type_version=case when old.block_type_id is not distinct from (b->>'blockTypeId')::uuid and definition is distinct from (select t.field_schema_json from public.block_types t where t.id=(b->>'blockTypeId')::uuid and t.org_id=m.org_id) then coalesce(old.type_version,type_version) else type_version end where id=new_block_id;
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
 insert into public.block_subactivities(org_id,block_id,team_id,person_id,title,offset_seconds,duration_seconds,notes,custom_fields_json,client_key,field_schema_snapshot) values(m.org_id,new_block_id,(sub->>'teamId')::uuid,(sub->>'personId')::uuid,trim(sub->>'title'),(sub->>'offsetSeconds')::integer,(sub->>'durationSeconds')::integer,coalesce(sub->>'notes',''),coalesce(sub->'customFields','{}'),coalesce((sub->>'clientKey')::uuid,gen_random_uuid()),coalesce(sub->'fieldSchema','[]'));
 end loop;
 idx=idx+1;
 end loop;
 return rev;end
$$;
create or replace function private.editor_snapshot(p_meeting uuid,p_revision uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('meetingId',m.id,'version',m.version,'revisionId',r.id,'publishedRevisionId',m.published_revision_id,
 'metadata',jsonb_build_object('title',coalesce(r.title,m.title),'date',coalesce(r.local_date,m.date)::text,'startLocalTime',to_char(coalesce(r.start_local_time,m.start_local_time),'HH24:MI'),'timezone',coalesce(r.timezone,m.timezone),'meetingTypeId',case when r.title is null then m.meeting_type_id else r.meeting_type_id end,'seriesId',case when r.title is null then m.series_id else r.series_id end),
 'blocks',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'clientKey',b.client_key,'blockTypeId',b.block_type_id,'teamId',b.team_id,'name',b.name,'durationSeconds',b.duration_seconds,'visibility',b.visibility,'notes',coalesce(d.notes,''),'fieldSchema',b.field_schema_snapshot,'customFields',coalesce(d.custom_fields_json,'{}'),
 'songIds',coalesce((select jsonb_agg(song_id order by sort_order) from public.block_songs where block_id=b.id),'[]'),
 'announcementIds',coalesce((select jsonb_agg(announcement_id order by sort_order) from public.block_announcements where block_id=b.id),'[]'),
 'messageIds',coalesce((select jsonb_agg(message_id order by sort_order) from public.block_messages where block_id=b.id),'[]'),
 'resourceIds',coalesce((select jsonb_agg(resource_id) from public.resource_links where block_id=b.id),'[]'),
 'responsibles',coalesce((select jsonb_agg(jsonb_build_object('assignmentId',a.id,'personId',a.person_id,'teamId',a.team_id,'roleId',a.role_id)) from public.assignments a where a.org_id=m.org_id and a.meeting_id=m.id and a.replaced_by_id is null and (a.block_id=b.id or exists(select 1 from public.block_assignment_links l where l.assignment_id=a.id and l.block_id=b.id))),'[]'),
 'subactivities',coalesce((select jsonb_agg(jsonb_build_object('clientKey',s.client_key,'title',s.title,'teamId',s.team_id,'personId',s.person_id,'offsetSeconds',s.offset_seconds,'durationSeconds',s.duration_seconds,'notes',coalesce(s.notes,''),'fieldSchema',s.field_schema_snapshot,'customFields',s.custom_fields_json)) from public.block_subactivities s where s.block_id=b.id),'[]')) order by b.sort_order) from public.meeting_blocks b left join public.block_details d on d.block_id=b.id where b.revision_id=r.id),'[]'))
 from public.meetings m left join public.meeting_revisions r on r.id=coalesce(p_revision,m.draft_revision_id,m.published_revision_id) and r.meeting_id=m.id where m.id=p_meeting
$$;

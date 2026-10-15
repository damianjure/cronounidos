-- Explicit, all-or-nothing refresh of selected meetings. Never changes the published pointer.
create function public.apply_template_selected(
  p_template uuid,
  p_template_version integer,
  p_targets jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.meeting_templates;
  target jsonb;
  m public.meetings;
  current_snapshot jsonb;
  template_block jsonb;
  current_block jsonb;
  candidate jsonb;
  new_blocks jsonb;
  used_keys uuid[];
  revision uuid;
  changed jsonb = '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Forbidden'; end if;
  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) not between 1 and 20 then
    raise exception 'Select between 1 and 20 meetings';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_targets) x
    where jsonb_typeof(x) <> 'object'
       or (x->>'id') is null
       or (x->>'version') is null
  ) or (select count(distinct x->>'id') from jsonb_array_elements(p_targets) x) <> jsonb_array_length(p_targets) then
    raise exception 'Invalid or repeated targets';
  end if;

  select * into t from public.meeting_templates where id = p_template for share;
  if t.id is null or not private.editor_allowed(t.org_id) then raise exception 'Forbidden'; end if;
  if t.definition_version <> p_template_version then raise exception 'Template version conflict'; end if;
  if jsonb_typeof(t.definition_json->'blocks') <> 'array' then raise exception 'Invalid template'; end if;

  -- Deterministic lock order avoids deadlocks with concurrent batch applications.
  for target in select value from jsonb_array_elements(p_targets) order by value->>'id' loop
    select * into m from public.meetings where id = (target->>'id')::uuid for update;
    if m.id is null or m.org_id <> t.org_id or not private.editor_allowed(m.org_id) then
      raise exception 'Forbidden';
    end if;
    if m.version <> (target->>'version')::integer then raise exception 'Version conflict'; end if;
    if m.status in ('finished', 'cancelled') then raise exception 'Meeting closed'; end if;
    if m.published_revision_id is not null and m.draft_revision_id is not null then
      raise exception 'Existing draft must be resolved first';
    end if;

    current_snapshot = private.editor_snapshot(m.id);
    new_blocks = '[]'::jsonb;
    used_keys = array[]::uuid[];
    for template_block in select value from jsonb_array_elements(t.definition_json->'blocks') loop
      current_block = null;
      -- Preserve assignments and their confirmation state only for an unambiguous
      -- existing block with the same type and name. Never copy another meeting's people.
      for candidate in select value from jsonb_array_elements(current_snapshot->'blocks') loop
        if candidate->>'name' = template_block->>'name'
          and candidate->>'blockTypeId' is not distinct from template_block->>'blockTypeId'
          and not ((candidate->>'clientKey')::uuid = any(used_keys)) then
          current_block = candidate;
          exit;
        end if;
      end loop;
      if current_block is not null then
        used_keys = array_append(used_keys, (current_block->>'clientKey')::uuid);
        template_block = template_block || jsonb_build_object(
          'id', current_block->'id',
          'clientKey', current_block->'clientKey',
          'responsibles', current_block->'responsibles'
        );
      else
        template_block = template_block || jsonb_build_object(
          'id', null,
          'clientKey', gen_random_uuid(),
          'responsibles', '[]'::jsonb
        );
      end if;
      new_blocks = new_blocks || jsonb_build_array(template_block);
    end loop;
    revision = private.write_editor_revision(m.id, current_snapshot->'metadata', new_blocks);
    update public.meetings set draft_revision_id = revision, version = version + 1 where id = m.id;
    changed = changed || jsonb_build_array(jsonb_build_object('id', m.id, 'revisionId', revision));
  end loop;
  return changed;
end
$$;

revoke all on function public.apply_template_selected(uuid, integer, jsonb) from public, anon;
grant execute on function public.apply_template_selected(uuid, integer, jsonb) to authenticated;

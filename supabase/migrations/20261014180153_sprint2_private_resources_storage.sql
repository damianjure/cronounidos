-- Private editor uploads. The DO guard keeps PGlite schema tests independent
-- of Supabase Storage while local/hosted Supabase installs real policies.
alter table public.resources add constraint resources_storage_org_path
  check (storage_path is null or split_part(storage_path, '/', 1) = org_id::text);

do $setup$
begin
  if to_regclass('storage.objects') is null then return; end if;
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('crono-resources','crono-resources',false,5242880,
         array['image/png','image/jpeg','image/webp','application/pdf'])
  on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

  execute 'drop policy if exists crono_resources_read on storage.objects';
  execute 'drop policy if exists crono_resources_insert on storage.objects';
  execute 'drop policy if exists crono_resources_delete on storage.objects';
  execute $sql$create policy crono_resources_read on storage.objects
    for select to authenticated using (
      bucket_id='crono-resources'
      and split_part(name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.has_permission(split_part(name,'/',1)::uuid,'read_content',null)
    )$sql$;
  execute $sql$create policy crono_resources_insert on storage.objects
    for insert to authenticated with check (
      bucket_id='crono-resources'
      and split_part(name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.has_permission(split_part(name,'/',1)::uuid,'plan',null)
    )$sql$;
  execute $sql$create policy crono_resources_delete on storage.objects
    for delete to authenticated using (
      bucket_id='crono-resources'
      and split_part(name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.has_permission(split_part(name,'/',1)::uuid,'plan',null)
    )$sql$;
end
$setup$;

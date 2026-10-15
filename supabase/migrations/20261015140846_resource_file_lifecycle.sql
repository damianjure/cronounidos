-- A database transaction cannot atomically delete bytes in Supabase Storage.
-- Queue the old immutable path in the same transaction as the catalog change;
-- an authorized server action removes the object and acknowledges the job.
create unique index resources_storage_path_unique on public.resources(storage_path)
  where storage_path is not null;

create table private.resource_file_cleanup (
  org_id uuid not null references public.organizations(id),
  path text primary key,
  queued_at timestamptz not null default now()
);
alter table private.resource_file_cleanup enable row level security;
revoke all on private.resource_file_cleanup from public, anon, authenticated;

create function private.queue_resource_file_cleanup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.storage_path is not null
    and (tg_op = 'DELETE' or old.storage_path is distinct from new.storage_path) then
    insert into private.resource_file_cleanup(org_id, path)
      values (old.org_id, old.storage_path)
      on conflict(path) do nothing;
  end if;
  return coalesce(new, old);
end
$$;
create trigger queue_resource_file_cleanup
  after update of storage_path or delete on public.resources
  for each row execute function private.queue_resource_file_cleanup();

create function private.require_resource_file(p_org uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare found boolean;
begin
  if p_path !~ ('^' || p_org::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|pdf)$') then
    raise exception 'Invalid resource path';
  end if;
  if pg_catalog.to_regclass('storage.objects') is not null then
    execute 'select exists(select 1 from storage.objects where bucket_id = $1 and name = $2)'
      into found using 'crono-resources', p_path;
    if not found then raise exception 'Uploaded file missing'; end if;
  end if;
end
$$;

create function public.replace_unlinked_resource_file(
  p_resource uuid, p_old_path text, p_new_path text, p_title text, p_resource_type text
) returns void language plpgsql security definer set search_path = '' as $$
declare r public.resources;
begin
  select * into r from public.resources where id = p_resource for update;
  if r.id is null or not private.can(r.org_id, 'plan') or not private.can(r.org_id, 'read_content') then
    raise exception 'Forbidden';
  end if;
  if r.storage_path is null or r.storage_path <> p_old_path then raise exception 'Resource changed'; end if;
  if exists(select 1 from public.resource_links where resource_id = r.id) then raise exception 'Resource in use'; end if;
  if length(trim(p_title)) not between 1 and 200 or p_resource_type not in ('image', 'document')
    or p_new_path = p_old_path then raise exception 'Invalid resource'; end if;
  perform private.require_resource_file(r.org_id, p_new_path);
  update public.resources set title = trim(p_title), storage_path = p_new_path,
    resource_type = p_resource_type where id = r.id;
end
$$;

create function public.delete_unlinked_resource_file(p_resource uuid, p_old_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.resources;
begin
  select * into r from public.resources where id = p_resource for update;
  if r.id is null or not private.can(r.org_id, 'plan') or not private.can(r.org_id, 'read_content') then
    raise exception 'Forbidden';
  end if;
  if r.storage_path is null or r.storage_path <> p_old_path then raise exception 'Resource changed'; end if;
  if exists(select 1 from public.resource_links where resource_id = r.id) then raise exception 'Resource in use'; end if;
  delete from public.resources where id = r.id;
end
$$;

create function public.pending_resource_file_cleanup(p_org uuid)
returns table(path text) language plpgsql security definer set search_path = '' as $$
begin
  if not private.can(p_org, 'plan') or not private.can(p_org, 'read_content') then
    raise exception 'Forbidden';
  end if;
  return query select job.path from private.resource_file_cleanup job
    where job.org_id = p_org
      and not exists(select 1 from public.resources r where r.storage_path = job.path)
    order by job.queued_at limit 20;
end
$$;

create function public.queue_unattached_resource_file(p_org uuid, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can(p_org, 'plan') or not private.can(p_org, 'read_content') then
    raise exception 'Forbidden';
  end if;
  perform private.require_resource_file(p_org, p_path);
  if exists(select 1 from public.resources where storage_path = p_path) then
    raise exception 'Resource file in use';
  end if;
  insert into private.resource_file_cleanup(org_id, path) values(p_org, p_path)
    on conflict(path) do nothing;
end
$$;

create function public.ack_resource_file_cleanup(p_org uuid, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can(p_org, 'plan') or not private.can(p_org, 'read_content') then
    raise exception 'Forbidden';
  end if;
  if exists(select 1 from public.resources where storage_path = p_path) then
    raise exception 'Resource file still in use';
  end if;
  delete from private.resource_file_cleanup where org_id = p_org and path = p_path;
end
$$;

revoke all on function public.replace_unlinked_resource_file(uuid,text,text,text,text),
  public.delete_unlinked_resource_file(uuid,text),
  public.pending_resource_file_cleanup(uuid),
  public.queue_unattached_resource_file(uuid,text),
  public.ack_resource_file_cleanup(uuid,text) from public, anon;
grant execute on function public.replace_unlinked_resource_file(uuid,text,text,text,text),
  public.delete_unlinked_resource_file(uuid,text),
  public.pending_resource_file_cleanup(uuid),
  public.queue_unattached_resource_file(uuid,text),
  public.ack_resource_file_cleanup(uuid,text) to authenticated;

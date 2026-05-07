create extension if not exists pgcrypto;

create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    slug text not null unique,
    is_active boolean not null default true,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();

alter table public.profiles
    add column if not exists organization_id uuid references public.organizations(id) on delete set null;

alter table public.clients
    add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

alter table public.processes
    add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

create index if not exists idx_profiles_organization_id on public.profiles (organization_id);
create index if not exists idx_clients_organization_id on public.clients (organization_id);
create index if not exists idx_processes_organization_id on public.processes (organization_id);

alter table public.profiles
    drop constraint if exists profiles_role_check;

alter table public.profiles
    add constraint profiles_role_check check (role in ('super_admin', 'admin', 'user'));

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, full_name, role, organization_id, gender, permissions, folder_access)
    values (
        new.id,
        coalesce(new.email, ''),
        coalesce(new.raw_user_meta_data ->> 'full_name', ''),
        coalesce(new.raw_user_meta_data ->> 'role', 'user'),
        nullif(new.raw_user_meta_data ->> 'organization_id', '')::uuid,
        coalesce(new.raw_user_meta_data ->> 'gender', 'neutro'),
        coalesce((new.raw_user_meta_data -> 'permissions')::jsonb, '{"view": true, "edit": false, "delete": false}'::jsonb),
        coalesce((new.raw_user_meta_data -> 'folder_access')::jsonb, '["painel","clientes","processos","prazos","configuracoes"]'::jsonb)
    )
    on conflict (id) do update
    set
        email = excluded.email,
        full_name = case
            when excluded.full_name <> '' then excluded.full_name
            else public.profiles.full_name
        end,
        role = excluded.role,
        organization_id = coalesce(excluded.organization_id, public.profiles.organization_id),
        gender = excluded.gender,
        permissions = coalesce(excluded.permissions, public.profiles.permissions),
        folder_access = coalesce(excluded.folder_access, public.profiles.folder_access),
        updated_at = now();

    return new;
end;
$$;

alter table public.clients
    alter column organization_id set not null;

alter table public.processes
    alter column organization_id set not null;

create or replace function public.current_profile_organization_id()
returns uuid
language sql
stable
as $$
    select organization_id
    from public.profiles
    where id = auth.uid()
$$;

alter table public.processes
    add column if not exists doc_size_bytes bigint default 0;

alter table public.clients enable row level security;
alter table public.processes enable row level security;

drop policy if exists "clients by organization" on public.clients;
create policy "clients by organization"
on public.clients
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role <> 'super_admin'
          and organization_id = public.clients.organization_id
    )
)
with check (
    exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role <> 'super_admin'
          and organization_id = public.clients.organization_id
    )
);

drop policy if exists "processes by organization" on public.processes;
create policy "processes by organization"
on public.processes
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role <> 'super_admin'
          and organization_id = public.processes.organization_id
    )
)
with check (
    exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and role <> 'super_admin'
          and organization_id = public.processes.organization_id
    )
);

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    full_name text not null default '',
    role text not null default 'user' check (role in ('admin', 'user')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, full_name, role)
    values (
        new.id,
        coalesce(new.email, ''),
        coalesce(new.raw_user_meta_data ->> 'full_name', ''),
        coalesce(new.raw_user_meta_data ->> 'role', 'user')
    )
    on conflict (id) do update
    set
        email = excluded.email,
        full_name = case
            when excluded.full_name <> '' then excluded.full_name
            else public.profiles.full_name
        end,
        role = case
            when public.profiles.role in ('admin', 'user') then public.profiles.role
            else excluded.role
        end,
        updated_at = now();

    return new;
end;
$$;

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at();

insert into public.profiles (id, email, full_name, role)
select
    users.id,
    coalesce(users.email, ''),
    coalesce(users.raw_user_meta_data ->> 'full_name', ''),
    'user'
from auth.users as users
on conflict (id) do update
set
    email = excluded.email,
    full_name = case
        when excluded.full_name <> '' then excluded.full_name
        else public.profiles.full_name
    end,
    updated_at = now();

-- Promova manualmente o administrador principal depois de rodar este script.
-- Troque o e-mail abaixo pelo seu e execute junto, se quiser:
-- update public.profiles set role = 'admin' where email = 'seu-email@empresa.com';

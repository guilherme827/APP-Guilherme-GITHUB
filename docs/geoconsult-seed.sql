-- Seed interno da operação GEOCONSULT.
-- Execute somente no banco da GEOCONSULT, depois de docs/supabase-multitenant.sql.

insert into public.organizations (name, slug)
values ('GEOCONSULT Pará', 'geoconsult-para')
on conflict (slug) do update
set
    name = excluded.name,
    updated_at = now();

with para_org as (
    select id from public.organizations where slug = 'geoconsult-para' limit 1
),
admin_profile as (
    select id
    from public.profiles
    where email = 'guilherme@geoconsultpa.com'
    limit 1
)
update public.organizations
set created_by = (select id from admin_profile)
where slug = 'geoconsult-para'
  and created_by is null;

with para_org as (
    select id from public.organizations where slug = 'geoconsult-para' limit 1
)
update public.profiles
set
    organization_id = (select id from para_org),
    role = case
        when email = 'guilherme@geoconsultpa.com' then 'admin'
        when role = 'super_admin' then role
        else role
    end,
    updated_at = now()
where organization_id is null
   or email = 'guilherme@geoconsultpa.com';

with para_org as (
    select id from public.organizations where slug = 'geoconsult-para' limit 1
)
update public.clients
set
    organization_id = (select id from para_org),
    updated_at = now()
where organization_id is null;

with para_org as (
    select id from public.organizations where slug = 'geoconsult-para' limit 1
)
update public.processes
set
    organization_id = (select id from para_org),
    updated_at = now()
where organization_id is null;

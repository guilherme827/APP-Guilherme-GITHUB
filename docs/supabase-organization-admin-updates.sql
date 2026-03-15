alter table public.profiles
    add column if not exists cpf text not null default '';

alter table public.organizations
    add column if not exists enabled_modules jsonb not null default '["painel","clientes","processos","prazos","financeiro","configuracoes"]'::jsonb;

update public.organizations
set enabled_modules = coalesce(
    enabled_modules,
    '["painel","clientes","processos","prazos","financeiro","configuracoes"]'::jsonb
)
where enabled_modules is null;

update public.profiles
set cpf = coalesce(cpf, '')
where cpf is null;

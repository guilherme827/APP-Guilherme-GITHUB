-- Restaurar acesso de Super Admin e corrigir visibilidade por organização

-- Clientes
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
          and (
            role = 'super_admin' 
            or organization_id = public.clients.organization_id
          )
    )
);

-- Processos
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
          and (
            role = 'super_admin' 
            or organization_id = public.processes.organization_id
          )
    )
);

-- Organizações (garantir que todos autenticados possam ver a lista ou pelo menos a sua)
alter table public.organizations enable row level security;
drop policy if exists "organizations visibility" on public.organizations;
create policy "organizations visibility"
on public.organizations
for select
to authenticated
using (true); -- Permitir leitura global de organizações para facilitar login/contexto

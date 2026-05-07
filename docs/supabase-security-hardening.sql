-- Correção emergencial para o alerta do Supabase:
-- "Table publicly accessible / rls_disabled_in_public".
--
-- Como usar:
-- 1. Abra Supabase Dashboard > SQL Editor.
-- 2. Execute este arquivo inteiro no projeto indicado pelo alerta.
-- 3. Reabra Security Advisor e confirme que nao existem tabelas public sem RLS.

begin;

-- 1) Fechamento imediato: habilita RLS em todas as tabelas comuns do schema public.
--    Em Supabase, tabelas no schema public ficam expostas pela Data API; RLS deve estar
--    ativo em todas elas. Tabelas sem policy ficam bloqueadas para anon/authenticated,
--    mas continuam acessiveis pelo backend com service_role.
do $$
declare
    table_record record;
begin
    for table_record in
        select n.nspname as schema_name, c.relname as table_name
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'p')
          and c.relrowsecurity = false
    loop
        execute format('alter table %I.%I enable row level security', table_record.schema_name, table_record.table_name);
    end loop;
end $$;

-- 2) Politicas minimas para tabelas acessadas diretamente pelo cliente Supabase.
do $$
begin
    if to_regclass('public.profiles') is not null then
        execute 'alter table public.profiles enable row level security';
        execute 'drop policy if exists "read own profile" on public.profiles';
        execute $policy$
            create policy "read own profile"
            on public.profiles
            for select
            to authenticated
            using ((select auth.uid()) = id)
        $policy$;
    end if;

    if to_regclass('public.user_preferences') is not null then
        execute 'alter table public.user_preferences enable row level security';
        execute 'drop policy if exists "read own preferences" on public.user_preferences';
        execute $policy$
            create policy "read own preferences"
            on public.user_preferences
            for select
            to authenticated
            using ((select auth.uid()) = user_id)
        $policy$;

        execute 'drop policy if exists "insert own preferences" on public.user_preferences';
        execute $policy$
            create policy "insert own preferences"
            on public.user_preferences
            for insert
            to authenticated
            with check ((select auth.uid()) = user_id)
        $policy$;

        execute 'drop policy if exists "update own preferences" on public.user_preferences';
        execute $policy$
            create policy "update own preferences"
            on public.user_preferences
            for update
            to authenticated
            using ((select auth.uid()) = user_id)
            with check ((select auth.uid()) = user_id)
        $policy$;

        execute 'drop policy if exists "delete own preferences" on public.user_preferences';
        execute $policy$
            create policy "delete own preferences"
            on public.user_preferences
            for delete
            to authenticated
            using ((select auth.uid()) = user_id)
        $policy$;
    end if;
end $$;

-- 3) Politicas por organizacao para dados operacionais.
--    O backend do app usa service_role e tambem valida usuario/organizacao nos handlers;
--    estas policies adicionam defesa em profundidade se alguem tentar usar a Data API.
do $$
begin
    if to_regclass('public.organizations') is not null then
        execute 'alter table public.organizations enable row level security';
        execute 'drop policy if exists "organizations visible by membership" on public.organizations';
        execute 'drop policy if exists "organizations visibility" on public.organizations';
        execute $policy$
            create policy "organizations visible by membership"
            on public.organizations
            for select
            to authenticated
            using (
                exists (
                    select 1
                    from public.profiles p
                    where p.id = (select auth.uid())
                      and (
                        p.role = 'super_admin'
                        or p.organization_id = public.organizations.id
                      )
                )
            )
        $policy$;
    end if;

    if to_regclass('public.clients') is not null then
        execute 'alter table public.clients enable row level security';
        execute 'drop policy if exists "clients by organization" on public.clients';
        execute $policy$
            create policy "clients by organization"
            on public.clients
            for all
            to authenticated
            using (
                exists (
                    select 1
                    from public.profiles p
                    where p.id = (select auth.uid())
                      and (
                        p.role = 'super_admin'
                        or p.organization_id = public.clients.organization_id
                      )
                )
            )
            with check (
                exists (
                    select 1
                    from public.profiles p
                    where p.id = (select auth.uid())
                      and (
                        p.role = 'super_admin'
                        or p.organization_id = public.clients.organization_id
                      )
                )
            )
        $policy$;
    end if;

    if to_regclass('public.processes') is not null then
        execute 'alter table public.processes enable row level security';
        execute 'drop policy if exists "processes by organization" on public.processes';
        execute $policy$
            create policy "processes by organization"
            on public.processes
            for all
            to authenticated
            using (
                exists (
                    select 1
                    from public.profiles p
                    where p.id = (select auth.uid())
                      and (
                        p.role = 'super_admin'
                        or p.organization_id = public.processes.organization_id
                      )
                )
            )
            with check (
                exists (
                    select 1
                    from public.profiles p
                    where p.id = (select auth.uid())
                      and (
                        p.role = 'super_admin'
                        or p.organization_id = public.processes.organization_id
                      )
                )
            )
        $policy$;
    end if;
end $$;

-- 4) Garante RLS nas tabelas usadas apenas pelo backend/service_role.
--    Sem policy direta, anon/authenticated nao conseguem ler ou escrever por Data API.
alter table if exists public.projects enable row level security;
alter table if exists public.trash enable row level security;
alter table if exists public.activity_logs enable row level security;
alter table if exists public.ai_provider_configs enable row level security;
alter table if exists public.ai_models enable row level security;
alter table if exists public.ai_agents enable row level security;
alter table if exists public.ai_usage_logs enable row level security;
alter table if exists public.ai_knowledge_chunks enable row level security;
alter table if exists public.finance_cashboxes enable row level security;
alter table if exists public.finance_cashbox_transactions enable row level security;
alter table if exists public.finance_fichas enable row level security;
alter table if exists public.finance_contracts enable row level security;
alter table if exists public.finance_contract_entries enable row level security;
alter table if exists public.finance_agendamentos enable row level security;

-- 5) Verificacao: esta consulta deve retornar zero linhas.
--    Se retornar algo, essa tabela ainda precisa de RLS.
-- select schemaname, tablename
-- from pg_tables
-- where schemaname = 'public'
--   and rowsecurity = false
-- order by tablename;

commit;

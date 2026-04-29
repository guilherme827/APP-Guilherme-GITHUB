create table if not exists public.finance_cashboxes (
    id text primary key,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    title text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.finance_cashbox_transactions (
    id text primary key,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    cashbox_id text not null references public.finance_cashboxes(id) on delete cascade,
    occurred_on date not null,
    description text not null default '',
    entry_type text not null check (entry_type in ('entrada', 'debito', 'retirada')),
    credit_amount numeric(14,2) not null default 0,
    debit_amount numeric(14,2) not null default 0,
    transfer_group_id text,
    transfer_direction text check (transfer_direction in ('incoming', 'outgoing') or transfer_direction is null),
    counterpart_cashbox_id text references public.finance_cashboxes(id) on delete set null,
    ficha_title text not null default '',
    sort_index integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.finance_fichas (
    id text primary key,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    title text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.finance_contracts (
    id text primary key,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    ficha_id text not null references public.finance_fichas(id) on delete cascade,
    cashbox_id text references public.finance_cashboxes(id) on delete set null,
    description text not null,
    created_on date not null default current_date,
    sort_index integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.finance_contract_entries (
    id text primary key,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    contract_id text not null references public.finance_contracts(id) on delete cascade,
    entry_type text not null check (entry_type in ('payment', 'debit', 'schedule')),
    occurred_on date not null,
    description text not null default '',
    amount numeric(14,2) not null default 0,
    sort_index integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.finance_agendamentos (
    id text primary key,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    title text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_finance_cashboxes_org on public.finance_cashboxes (organization_id);
create index if not exists idx_finance_cashbox_transactions_org_cashbox on public.finance_cashbox_transactions (organization_id, cashbox_id, occurred_on, sort_index);
create index if not exists idx_finance_fichas_org on public.finance_fichas (organization_id);
create index if not exists idx_finance_contracts_org_ficha on public.finance_contracts (organization_id, ficha_id, sort_index);
create index if not exists idx_finance_contract_entries_org_contract on public.finance_contract_entries (organization_id, contract_id, entry_type, occurred_on, sort_index);
create index if not exists idx_finance_agendamentos_org on public.finance_agendamentos (organization_id);

drop trigger if exists set_finance_cashboxes_updated_at on public.finance_cashboxes;
create trigger set_finance_cashboxes_updated_at
before update on public.finance_cashboxes
for each row
execute function public.set_updated_at();

drop trigger if exists set_finance_cashbox_transactions_updated_at on public.finance_cashbox_transactions;
create trigger set_finance_cashbox_transactions_updated_at
before update on public.finance_cashbox_transactions
for each row
execute function public.set_updated_at();

drop trigger if exists set_finance_fichas_updated_at on public.finance_fichas;
create trigger set_finance_fichas_updated_at
before update on public.finance_fichas
for each row
execute function public.set_updated_at();

drop trigger if exists set_finance_contracts_updated_at on public.finance_contracts;
create trigger set_finance_contracts_updated_at
before update on public.finance_contracts
for each row
execute function public.set_updated_at();

drop trigger if exists set_finance_contract_entries_updated_at on public.finance_contract_entries;
create trigger set_finance_contract_entries_updated_at
before update on public.finance_contract_entries
for each row
execute function public.set_updated_at();

drop trigger if exists set_finance_agendamentos_updated_at on public.finance_agendamentos;
create trigger set_finance_agendamentos_updated_at
before update on public.finance_agendamentos
for each row
execute function public.set_updated_at();

alter table public.finance_cashboxes enable row level security;
alter table public.finance_cashbox_transactions enable row level security;
alter table public.finance_fichas enable row level security;
alter table public.finance_contracts enable row level security;
alter table public.finance_contract_entries enable row level security;
alter table public.finance_agendamentos enable row level security;

drop policy if exists "finance cashboxes org members" on public.finance_cashboxes;
create policy "finance cashboxes org members"
on public.finance_cashboxes
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = finance_cashboxes.organization_id
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = finance_cashboxes.organization_id
    )
);

drop policy if exists "finance cashbox transactions org members" on public.finance_cashbox_transactions;
create policy "finance cashbox transactions org members"
on public.finance_cashbox_transactions
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = finance_cashbox_transactions.organization_id
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = finance_cashbox_transactions.organization_id
    )
);

drop policy if exists "finance fichas org members" on public.finance_fichas;
create policy "finance fichas org members"
on public.finance_fichas
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = finance_fichas.organization_id
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = finance_fichas.organization_id
    )
);

drop policy if exists "finance contracts org members" on public.finance_contracts;
create policy "finance contracts org members"
on public.finance_contracts
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = finance_contracts.organization_id
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = finance_contracts.organization_id
    )
);

drop policy if exists "finance contract entries org members" on public.finance_contract_entries;
create policy "finance contract entries org members"
on public.finance_contract_entries
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = finance_contract_entries.organization_id
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = finance_contract_entries.organization_id
    )
);

drop policy if exists "finance agendamentos org members" on public.finance_agendamentos;
create policy "finance agendamentos org members"
on public.finance_agendamentos
for all
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = finance_agendamentos.organization_id
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.organization_id = finance_agendamentos.organization_id
    )
);

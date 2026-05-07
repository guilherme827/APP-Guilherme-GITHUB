-- Limpeza pré-produção.
-- Revise um backup antes de executar em produção.

begin;

-- Pagamentos de ficha são derivados de finance_contract_entries.
-- Eles não devem existir também como transações manuais do caixa.
delete from public.finance_cashbox_transactions
where id like 'ficha-payment-%';

-- Depois que as tabelas estruturais do financeiro estiverem preenchidas,
-- o estado legado em user_preferences deixa de ser fonte de verdade.
delete from public.user_preferences preferences
where preferences.preference_key = 'finance.state'
  and exists (
      select 1
      from public.finance_cashboxes cashboxes
      where cashboxes.organization_id = preferences.organization_id
  );

-- Backups de conflito antigos ficam no navegador, mas se algum foi sincronizado
-- por engano como preferência remota, ele não deve permanecer indefinidamente.
delete from public.user_preferences
where preference_key like 'app-control-finance-v1:%:conflict-backup';

commit;

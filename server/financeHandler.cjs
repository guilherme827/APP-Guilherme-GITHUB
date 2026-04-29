const accountHandler = require('./accountHandler.cjs');

const FINANCE_PREFERENCE_KEY = 'finance.state';
const FINANCE_TABLES = {
    cashboxes: 'finance_cashboxes',
    cashboxTransactions: 'finance_cashbox_transactions',
    fichas: 'finance_fichas',
    contracts: 'finance_contracts',
    contractEntries: 'finance_contract_entries',
    agendamentos: 'finance_agendamentos'
};

function isMissingFinanceTables(error) {
    const message = String(error?.message || '');
    return error?.code === 'PGRST205'
        || /relation .*finance_/i.test(message)
        || /could not find the table/i.test(message)
        || /schema cache/i.test(message);
}

function isMissingPreferenceTable(error) {
    const message = String(error?.message || '');
    return error?.code === 'PGRST205'
        || /relation .*user_preferences/i.test(message)
        || /could not find the table/i.test(message)
        || /schema cache/i.test(message);
}

function normalizeItemsByTab(itemsByTab) {
    const safe = itemsByTab && typeof itemsByTab === 'object' ? itemsByTab : {};
    return {
        caixa: Array.isArray(safe.caixa) ? safe.caixa : [],
        fichas: Array.isArray(safe.fichas) ? safe.fichas : [],
        agendamentos: Array.isArray(safe.agendamentos) ? safe.agendamentos : []
    };
}

function isValidFinanceState(state) {
    return state !== null && typeof state === 'object' && !Array.isArray(state);
}

function normalizeDateStorageValue(value) {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
        const [day, month, year] = raw.split('/');
        return `${year}-${month}-${day}`;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
}

function formatDateForInput(value) {
    const iso = normalizeDateStorageValue(value);
    if (!iso) return '';
    const [year, month, day] = iso.split('-');
    return `${day}/${month}/${year}`;
}

function parseCurrencyValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const normalized = String(value || '')
        .replace(/[R$\s]/g, '')
        .replace(/\./g, '')
        .replace(',', '.');
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrency(value) {
    const numeric = Number(value || 0);
    const formatted = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(Math.abs(numeric));
    return numeric < 0 ? `-${formatted}` : formatted;
}

function buildContractSummary(contract) {
    const debits = Array.isArray(contract?.debits) ? contract.debits : [];
    const payments = Array.isArray(contract?.payments) ? contract.payments : [];
    const contracted = debits.reduce((sum, item) => sum + Number(item?.value || 0), 0);
    const paid = payments.reduce((sum, item) => sum + Number(item?.value || 0), 0);
    return { contracted, paid, balance: paid - contracted };
}

function buildFichaStateRows(fichas, contracts, contractEntries) {
    const entriesByContractId = (contractEntries || []).reduce((map, row) => {
        const list = map.get(String(row.contract_id)) || [];
        list.push(row);
        map.set(String(row.contract_id), list);
        return map;
    }, new Map());

    const contractsByFichaId = (contracts || []).reduce((map, row) => {
        const list = map.get(String(row.ficha_id)) || [];
        list.push(row);
        map.set(String(row.ficha_id), list);
        return map;
    }, new Map());

    return (fichas || []).map((ficha) => {
        const fichaContracts = (contractsByFichaId.get(String(ficha.id)) || [])
            .sort((left, right) => Number(left.sort_index || 0) - Number(right.sort_index || 0) || String(left.id).localeCompare(String(right.id)))
            .map((contract) => {
                const rows = (entriesByContractId.get(String(contract.id)) || [])
                    .sort((left, right) => (
                        String(left.occurred_on || '').localeCompare(String(right.occurred_on || ''))
                        || Number(left.sort_index || 0) - Number(right.sort_index || 0)
                        || String(left.id).localeCompare(String(right.id))
                    ));

                const payments = rows
                    .filter((row) => row.entry_type === 'payment')
                    .map((row) => ({
                        id: row.id,
                        date: normalizeDateStorageValue(row.occurred_on),
                        description: row.description || '',
                        value: Number(row.amount || 0)
                    }));

                const debits = rows
                    .filter((row) => row.entry_type === 'debit')
                    .map((row) => ({
                        id: row.id,
                        date: normalizeDateStorageValue(row.occurred_on),
                        description: row.description || '',
                        value: Number(row.amount || 0)
                    }));

                const schedules = rows
                    .filter((row) => row.entry_type === 'schedule')
                    .map((row) => ({
                        id: row.id,
                        date: normalizeDateStorageValue(row.occurred_on),
                        description: row.description || '',
                        value: Number(row.amount || 0)
                    }));

                return {
                    id: contract.id,
                    createdAt: normalizeDateStorageValue(contract.created_on),
                    description: contract.description || '',
                    amount: 0,
                    cashboxId: contract.cashbox_id || '',
                    payments,
                    debits,
                    schedules
                };
            });

        const totals = fichaContracts.reduce((acc, contract) => {
            const summary = buildContractSummary(contract);
            acc.contracted += summary.contracted;
            acc.paid += summary.paid;
            acc.balance += summary.balance;
            return acc;
        }, { contracted: 0, paid: 0, balance: 0, scheduled: 0 });
        totals.scheduled = fichaContracts.reduce((sum, contract) => (
            sum + (contract.schedules || []).reduce((inner, item) => inner + Number(item?.value || 0), 0)
        ), 0);

        return {
            id: ficha.id,
            type: 'ficha',
            title: ficha.title || '',
            owners: '',
            contracts: fichaContracts,
            metrics: [
                { label: 'Valor Contratado', value: formatCurrency(totals.contracted), tone: 'info' },
                { label: 'Pagamentos', value: formatCurrency(totals.paid), tone: 'positive' },
                { label: 'Saldo', value: formatCurrency(totals.balance), tone: totals.balance < 0 ? 'negative' : totals.balance > 0 ? 'positive' : 'info' }
            ],
            footer: [
                { label: 'Agendado', value: formatCurrency(totals.scheduled), tone: 'warning' },
                { label: 'Recebido', value: formatCurrency(totals.paid), tone: 'positive' },
                { label: 'Contratos', value: String(fichaContracts.length), tone: 'info' }
            ],
            createdAt: ficha.created_at || null
        };
    });
}

function buildCashboxStateRows(cashboxes, transactions) {
    const txByCashboxId = (transactions || []).reduce((map, row) => {
        const list = map.get(String(row.cashbox_id)) || [];
        list.push(row);
        map.set(String(row.cashbox_id), list);
        return map;
    }, new Map());

    return (cashboxes || []).map((cashbox) => {
        const cashboxTransactions = (txByCashboxId.get(String(cashbox.id)) || [])
            .sort((left, right) => (
                String(left.occurred_on || '').localeCompare(String(right.occurred_on || ''))
                || Number(left.sort_index || 0) - Number(right.sort_index || 0)
                || String(left.id).localeCompare(String(right.id))
            ));

        let runningBalance = 0;
        const rows = cashboxTransactions.map((row) => {
            const creditAmount = Number(row.credit_amount || 0);
            const debitAmount = Number(row.debit_amount || 0);
            runningBalance += creditAmount - debitAmount;
            return {
                id: row.id,
                transferId: row.transfer_group_id || '',
                transferDirection: row.transfer_direction || '',
                counterpartCashboxId: row.counterpart_cashbox_id || '',
                fichaTitle: row.ficha_title || '',
                date: formatDateForInput(row.occurred_on),
                isoDate: normalizeDateStorageValue(row.occurred_on),
                description: row.description || '',
                type: row.entry_type || (creditAmount > 0 ? 'entrada' : 'debito'),
                credit: creditAmount > 0 ? formatCurrency(creditAmount) : '',
                debit: debitAmount > 0 ? formatCurrency(-debitAmount) : '',
                balance: formatCurrency(runningBalance)
            };
        });

        const totalCredits = rows.reduce((sum, row) => sum + parseCurrencyValue(row.credit), 0);
        const totalDebits = rows.reduce((sum, row) => sum + Math.abs(parseCurrencyValue(row.debit)), 0);
        const balance = rows.length > 0 ? parseCurrencyValue(rows[rows.length - 1].balance) : 0;

        return {
            id: cashbox.id,
            type: 'caixa',
            title: cashbox.title || '',
            owners: 'Responsavel nao informado',
            transactions: rows,
            metrics: [
                { label: 'Entradas', value: formatCurrency(totalCredits), tone: 'positive' },
                { label: 'Saidas', value: formatCurrency(totalDebits), tone: 'negative' },
                { label: 'Saldo Total', value: formatCurrency(balance), tone: balance >= 0 ? 'positive' : 'negative' }
            ],
            footer: [
                { label: 'A Receber', value: 'R$ 0,00', tone: 'info' },
                { label: 'Agendado', value: 'R$ 0,00', tone: 'warning' },
                { label: 'Vencido', value: 'R$ 0,00', tone: 'negative' }
            ],
            createdAt: cashbox.created_at || null
        };
    });
}

function buildAgendamentoStateRows(agendamentos) {
    return (agendamentos || []).map((item) => ({
        id: item.id,
        type: 'agendamento',
        title: item.title || '',
        owners: 'Sem responsavel definido',
        metrics: [
            { label: 'Previsto', value: 'R$ 0,00', tone: 'warning' },
            { label: 'Recebido', value: 'R$ 0,00', tone: 'positive' },
            { label: 'Saldo', value: 'R$ 0,00', tone: 'info' }
        ],
        footer: [
            { label: 'Data', value: formatDateForInput(item.created_at), tone: 'info' },
            { label: 'Status', value: 'Pendente', tone: 'warning' },
            { label: 'Atraso', value: 'Nao', tone: 'negative' }
        ],
        createdAt: item.created_at || null
    }));
}

function buildFinanceStateFromRows(rows) {
    const cashboxes = buildCashboxStateRows(rows.cashboxes, rows.cashboxTransactions);
    const fichas = buildFichaStateRows(rows.fichas, rows.contracts, rows.contractEntries);
    const agendamentos = buildAgendamentoStateRows(rows.agendamentos);
    const timestamps = [
        ...(rows.cashboxes || []).map((item) => item.updated_at),
        ...(rows.cashboxTransactions || []).map((item) => item.updated_at),
        ...(rows.fichas || []).map((item) => item.updated_at),
        ...(rows.contracts || []).map((item) => item.updated_at),
        ...(rows.contractEntries || []).map((item) => item.updated_at),
        ...(rows.agendamentos || []).map((item) => item.updated_at)
    ].filter(Boolean).sort();

    return {
        version: 2,
        userScoped: false,
        itemsByTab: {
            caixa: cashboxes,
            fichas,
            agendamentos
        },
        updatedAt: timestamps.at(-1) || null
    };
}

function extractDomainRowsFromState(state, organizationId) {
    const itemsByTab = normalizeItemsByTab(state.itemsByTab);
    const cashboxes = itemsByTab.caixa.map((cashbox, index) => ({
        id: String(cashbox.id),
        organization_id: organizationId,
        title: String(cashbox.title || '').trim(),
        created_at: cashbox.createdAt || null,
        updated_at: state.updatedAt || null,
        _sortIndex: index
    }));

    const cashboxTransactions = itemsByTab.caixa.flatMap((cashbox) => (
        (Array.isArray(cashbox.transactions) ? cashbox.transactions : []).map((transaction, index) => ({
            id: String(transaction.id),
            organization_id: organizationId,
            cashbox_id: String(cashbox.id),
            occurred_on: normalizeDateStorageValue(transaction.isoDate || transaction.date || cashbox.createdAt || new Date().toISOString().slice(0, 10)),
            description: String(transaction.description || '').trim(),
            entry_type: String(transaction.type || (transaction.credit ? 'entrada' : 'debito')),
            credit_amount: Math.max(parseCurrencyValue(transaction.credit), 0),
            debit_amount: Math.max(Math.abs(parseCurrencyValue(transaction.debit)), 0),
            transfer_group_id: transaction.transferId || null,
            transfer_direction: transaction.transferDirection || null,
            counterpart_cashbox_id: transaction.counterpartCashboxId || null,
            ficha_title: transaction.fichaTitle || '',
            sort_index: index
        }))
    ));

    const fichas = itemsByTab.fichas.map((ficha, index) => ({
        id: String(ficha.id),
        organization_id: organizationId,
        title: String(ficha.title || '').trim(),
        created_at: ficha.createdAt || null,
        updated_at: state.updatedAt || null,
        _sortIndex: index
    }));

    const contracts = itemsByTab.fichas.flatMap((ficha) => (
        (Array.isArray(ficha.contracts) ? ficha.contracts : []).map((contract, index) => ({
            id: String(contract.id),
            organization_id: organizationId,
            ficha_id: String(ficha.id),
            cashbox_id: contract.cashboxId || null,
            description: String(contract.description || '').trim(),
            created_on: normalizeDateStorageValue(contract.createdAt || state.updatedAt || new Date().toISOString().slice(0, 10)),
            sort_index: index
        }))
    ));

    const contractEntries = itemsByTab.fichas.flatMap((ficha) => (
        (Array.isArray(ficha.contracts) ? ficha.contracts : []).flatMap((contract) => (
            [
                ...((contract.payments || []).map((entry, index) => ({
                    id: String(entry.id),
                    organization_id: organizationId,
                    contract_id: String(contract.id),
                    entry_type: 'payment',
                    occurred_on: normalizeDateStorageValue(entry.date),
                    description: String(entry.description || '').trim(),
                    amount: Math.max(Number(entry.value || 0), 0),
                    sort_index: index
                }))),
                ...((contract.debits || []).map((entry, index) => ({
                    id: String(entry.id),
                    organization_id: organizationId,
                    contract_id: String(contract.id),
                    entry_type: 'debit',
                    occurred_on: normalizeDateStorageValue(entry.date),
                    description: String(entry.description || '').trim(),
                    amount: Math.max(Number(entry.value || 0), 0),
                    sort_index: index
                }))),
                ...((contract.schedules || []).map((entry, index) => ({
                    id: String(entry.id),
                    organization_id: organizationId,
                    contract_id: String(contract.id),
                    entry_type: 'schedule',
                    occurred_on: normalizeDateStorageValue(entry.date),
                    description: String(entry.description || '').trim(),
                    amount: Math.max(Number(entry.value || 0), 0),
                    sort_index: index
                })))
            ]
        ))
    ));

    const agendamentos = itemsByTab.agendamentos.map((item, index) => ({
        id: String(item.id),
        organization_id: organizationId,
        title: String(item.title || '').trim(),
        created_at: item.createdAt || null,
        updated_at: state.updatedAt || null,
        _sortIndex: index
    }));

    return { cashboxes, cashboxTransactions, fichas, contracts, contractEntries, agendamentos };
}

async function fetchFinanceRows(serviceClient, organizationId) {
    const [cashboxes, cashboxTransactions, fichas, contracts, contractEntries, agendamentos] = await Promise.all([
        serviceClient.from(FINANCE_TABLES.cashboxes).select('*').eq('organization_id', organizationId).order('created_at', { ascending: true }),
        serviceClient.from(FINANCE_TABLES.cashboxTransactions).select('*').eq('organization_id', organizationId).order('occurred_on', { ascending: true }),
        serviceClient.from(FINANCE_TABLES.fichas).select('*').eq('organization_id', organizationId).order('created_at', { ascending: true }),
        serviceClient.from(FINANCE_TABLES.contracts).select('*').eq('organization_id', organizationId).order('sort_index', { ascending: true }),
        serviceClient.from(FINANCE_TABLES.contractEntries).select('*').eq('organization_id', organizationId).order('sort_index', { ascending: true }),
        serviceClient.from(FINANCE_TABLES.agendamentos).select('*').eq('organization_id', organizationId).order('created_at', { ascending: true })
    ]);

    const results = { cashboxes, cashboxTransactions, fichas, contracts, contractEntries, agendamentos };
    const firstError = Object.values(results).find((result) => result?.error)?.error || null;
    if (firstError) {
        if (isMissingFinanceTables(firstError)) {
            const missing = new Error('As tabelas estruturais do financeiro ainda não foram criadas no Supabase. Execute docs/supabase-finance.sql antes de usar este módulo.');
            missing.code = 'FINANCE_TABLES_MISSING';
            throw missing;
        }
        throw new Error(firstError.message || 'Não foi possível carregar a estrutura do financeiro.');
    }

    return {
        cashboxes: cashboxes.data || [],
        cashboxTransactions: cashboxTransactions.data || [],
        fichas: fichas.data || [],
        contracts: contracts.data || [],
        contractEntries: contractEntries.data || [],
        agendamentos: agendamentos.data || []
    };
}

async function fetchLegacyFinanceState(serviceClient, userId, organizationId) {
    const query = serviceClient
        .from('user_preferences')
        .select('preference_value, updated_at')
        .eq('user_id', userId)
        .eq('preference_key', FINANCE_PREFERENCE_KEY);

    const scopedQuery = organizationId
        ? query.eq('organization_id', organizationId)
        : query.is('organization_id', null);

    const { data, error } = await scopedQuery.maybeSingle();
    if (error) {
        if (isMissingPreferenceTable(error)) return null;
        throw new Error(error.message || 'Não foi possível ler o financeiro legado.');
    }

    return data?.preference_value || null;
}

async function replaceFinanceRows(serviceClient, organizationId, state) {
    const rows = extractDomainRowsFromState(state, organizationId);

    await serviceClient.from(FINANCE_TABLES.contractEntries).delete().eq('organization_id', organizationId);
    await serviceClient.from(FINANCE_TABLES.contracts).delete().eq('organization_id', organizationId);
    await serviceClient.from(FINANCE_TABLES.cashboxTransactions).delete().eq('organization_id', organizationId);
    await serviceClient.from(FINANCE_TABLES.fichas).delete().eq('organization_id', organizationId);
    await serviceClient.from(FINANCE_TABLES.cashboxes).delete().eq('organization_id', organizationId);
    await serviceClient.from(FINANCE_TABLES.agendamentos).delete().eq('organization_id', organizationId);

    if (rows.cashboxes.length > 0) {
        const { error } = await serviceClient.from(FINANCE_TABLES.cashboxes).insert(rows.cashboxes.map(({ _sortIndex, ...row }) => row));
        if (error) throw new Error(error.message || 'Não foi possível salvar os caixas.');
    }

    if (rows.cashboxTransactions.length > 0) {
        const { error } = await serviceClient.from(FINANCE_TABLES.cashboxTransactions).insert(rows.cashboxTransactions);
        if (error) throw new Error(error.message || 'Não foi possível salvar as movimentações de caixa.');
    }

    if (rows.fichas.length > 0) {
        const { error } = await serviceClient.from(FINANCE_TABLES.fichas).insert(rows.fichas.map(({ _sortIndex, ...row }) => row));
        if (error) throw new Error(error.message || 'Não foi possível salvar as fichas.');
    }

    if (rows.contracts.length > 0) {
        const { error } = await serviceClient.from(FINANCE_TABLES.contracts).insert(rows.contracts);
        if (error) throw new Error(error.message || 'Não foi possível salvar os contratos.');
    }

    if (rows.contractEntries.length > 0) {
        const { error } = await serviceClient.from(FINANCE_TABLES.contractEntries).insert(rows.contractEntries);
        if (error) throw new Error(error.message || 'Não foi possível salvar os lançamentos contratuais.');
    }

    if (rows.agendamentos.length > 0) {
        const { error } = await serviceClient.from(FINANCE_TABLES.agendamentos).insert(rows.agendamentos.map(({ _sortIndex, ...row }) => row));
        if (error) throw new Error(error.message || 'Não foi possível salvar os agendamentos.');
    }
}

function hasAnyFinanceRows(rows) {
    return Object.values(rows).some((value) => Array.isArray(value) && value.length > 0);
}

async function readFinanceState(serviceClient, userId, organizationId) {
    const rows = await fetchFinanceRows(serviceClient, organizationId);
    if (hasAnyFinanceRows(rows)) {
        const state = buildFinanceStateFromRows(rows);
        return { state, updatedAt: state.updatedAt };
    }

    const legacyState = await fetchLegacyFinanceState(serviceClient, userId, organizationId);
    if (isValidFinanceState(legacyState)) {
        const migratedState = {
            version: 2,
            userScoped: false,
            itemsByTab: normalizeItemsByTab(legacyState.itemsByTab),
            updatedAt: legacyState.updatedAt || new Date().toISOString()
        };
        await replaceFinanceRows(serviceClient, organizationId, migratedState);
        return {
            state: migratedState,
            updatedAt: migratedState.updatedAt
        };
    }

    return {
        state: {
            version: 2,
            userScoped: false,
            itemsByTab: normalizeItemsByTab(null),
            updatedAt: null
        },
        updatedAt: null
    };
}

async function writeFinanceState(serviceClient, organizationId, state) {
    const nextState = {
        version: 2,
        userScoped: false,
        itemsByTab: normalizeItemsByTab(state.itemsByTab),
        updatedAt: state.updatedAt || new Date().toISOString()
    };
    await replaceFinanceRows(serviceClient, organizationId, nextState);
    const saved = await fetchFinanceRows(serviceClient, organizationId);
    const normalized = buildFinanceStateFromRows(saved);
    return {
        state: normalized,
        updatedAt: normalized.updatedAt
    };
}

async function handleGet(req, res, env) {
    const auth = await accountHandler.authenticateUser(req, env);
    if (auth.error) {
        accountHandler.sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }

    try {
        const profile = await accountHandler.ensureOwnProfile(auth);
        if (!profile.organization_id) {
            accountHandler.sendJson(res, 403, { error: 'Usuário sem organização vinculada para acessar o financeiro.' });
            return;
        }
        const finance = await readFinanceState(auth.serviceClient, auth.user.id, profile.organization_id);
        accountHandler.sendJson(res, 200, {
            data: {
                state: finance.state,
                updatedAt: finance.updatedAt
            }
        });
    } catch (error) {
        accountHandler.sendJson(res, 500, { error: error.message || 'Não foi possível carregar o financeiro.' });
    }
}

async function handlePut(req, res, env) {
    const auth = await accountHandler.authenticateUser(req, env);
    if (auth.error) {
        accountHandler.sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }

    let body;
    try {
        body = await accountHandler.parseBody(req);
    } catch {
        accountHandler.sendJson(res, 400, { error: 'Payload inválido.' });
        return;
    }

    if (!isValidFinanceState(body?.state)) {
        accountHandler.sendJson(res, 400, { error: 'Estado financeiro inválido.' });
        return;
    }

    try {
        const profile = await accountHandler.ensureOwnProfile(auth);
        if (!profile.organization_id) {
            accountHandler.sendJson(res, 403, { error: 'Usuário sem organização vinculada para acessar o financeiro.' });
            return;
        }
        const saved = await writeFinanceState(auth.serviceClient, profile.organization_id, body.state);
        accountHandler.sendJson(res, 200, {
            data: {
                state: saved.state,
                updatedAt: saved.updatedAt
            }
        });
    } catch (error) {
        accountHandler.sendJson(res, 500, { error: error.message || 'Não foi possível salvar o financeiro.' });
    }
}

module.exports = async function financeHandler(req, res, env = process.env) {
    if (req.method === 'GET') {
        await handleGet(req, res, env);
        return;
    }

    if (req.method === 'PUT') {
        await handlePut(req, res, env);
        return;
    }

    accountHandler.sendJson(res, 405, { error: 'Método não suportado.' });
};
module.exports.readFinanceState = readFinanceState;
module.exports.writeFinanceState = writeFinanceState;
module.exports.fetchLegacyFinanceState = fetchLegacyFinanceState;
module.exports.fetchFinanceRows = fetchFinanceRows;
module.exports.buildFinanceStateFromRows = buildFinanceStateFromRows;

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createMockReq,
    createMockRes,
    createSupabaseClientMock,
    loadServerHandlerWithSupabaseMock
} from './helpers/loadServerHandlerWithSupabaseMock.mjs';

const env = {
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_test',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test'
};

test('account handler should not auto-promote hardcoded admin fallback email', async () => {
    const createClientMock = createSupabaseClientMock({
        getUser: () => ({
            data: {
                user: {
                    id: 'user-1',
                    email: 'guilherme@geoconsultpa.com',
                    user_metadata: {}
                }
            },
            error: null
        }),
        resolveQuery: ({ table, mode, action, filters, payload }) => {
            if (table !== 'profiles') return { data: null, error: null };

            const idFilter = filters.find((item) => item.field === 'id')?.value;
            const emailFilter = filters.find((item) => item.field === 'email')?.value;

            if (action === 'select' && mode === 'maybeSingle' && idFilter === 'user-1') {
                return { data: null, error: null };
            }

            if (action === 'select' && mode === 'limit' && emailFilter === 'guilherme@geoconsultpa.com') {
                return { data: [], error: null };
            }

            if (action === 'upsert' && mode === 'single') {
                return { data: payload, error: null };
            }

            return { data: null, error: null };
        }
    });
    const handler = loadServerHandlerWithSupabaseMock('server/accountHandler.cjs', createClientMock);
    const req = createMockReq({ method: 'GET', headers: { authorization: 'Bearer valid-token' } });
    const res = createMockRes();

    await handler(req, res, env);

    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(String(res.body || '{}'));
    assert.equal(payload.data.role, 'user');
});

test('team members handler should allow super_admin to list organization members', async () => {
    const createClientMock = createSupabaseClientMock({
        getUser: () => ({
            data: { user: { id: 'admin-1', email: 'root@example.com' } },
            error: null
        }),
        resolveQuery: ({ table, mode, action, filters }) => {
            if (table !== 'profiles') return { data: null, error: null };

            const idFilter = filters.find((item) => item.field === 'id')?.value;
            const orgFilter = filters.find((item) => item.field === 'organization_id')?.value;

            if (action === 'select' && mode === 'single' && idFilter === 'admin-1') {
                return { data: { id: 'admin-1', role: 'super_admin', organization_id: 'org-1' }, error: null };
            }

            if (action === 'select' && mode === 'then' && orgFilter === 'org-1') {
                return { data: [{ id: 'member-1', email: 'member@example.com', organization_id: 'org-1' }], error: null };
            }

            return { data: null, error: null };
        }
    });
    const handler = loadServerHandlerWithSupabaseMock('server/teamMembersHandler.cjs', createClientMock);
    const req = createMockReq({ method: 'GET', headers: { authorization: 'Bearer valid-token' } });
    const res = createMockRes();

    await handler(req, res, env);

    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(String(res.body || '{}'));
    assert.equal(Array.isArray(payload.data), true);
    assert.equal(payload.data[0].id, 'member-1');
});

test('team members handler should sanitize folder access to organization modules on create', async () => {
    let persistedProfilePayload = null;
    const createClientMock = createSupabaseClientMock({
        getUser: () => ({
            data: { user: { id: 'admin-1', email: 'root@example.com' } },
            error: null
        }),
        adminApi: {
            createUser: async () => ({
                data: { user: { id: 'member-2' } },
                error: null
            })
        },
        resolveQuery: ({ table, mode, action, filters, payload, selectColumns }) => {
            const idFilter = filters.find((item) => item.field === 'id')?.value;
            const orgFilter = filters.find((item) => item.field === 'organization_id')?.value;

            if (table === 'profiles' && action === 'select' && mode === 'single' && idFilter === 'admin-1') {
                return { data: { id: 'admin-1', role: 'super_admin', organization_id: 'org-1' }, error: null };
            }

            if (table === 'organizations' && action === 'select' && mode === 'single' && idFilter === 'org-1' && /enabled_modules/.test(selectColumns || '')) {
                return { data: { enabled_modules: ['clientes', 'processos'] }, error: null };
            }

            if (table === 'profiles' && action === 'upsert' && mode === 'single') {
                persistedProfilePayload = payload;
                return { data: payload, error: null };
            }

            return { data: null, error: null };
        }
    });
    const handler = loadServerHandlerWithSupabaseMock('server/teamMembersHandler.cjs', createClientMock);
    const req = createMockReq({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: {
            full_name: 'Novo Membro',
            email: 'member@example.com',
            password: '123456',
            role: 'user',
            permissions: { view: true, edit: false, delete: false },
            folder_access: ['clientes', 'admin-panel', 'organizacoes', 'foo']
        }
    });
    const res = createMockRes();

    await handler(req, res, env);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(persistedProfilePayload?.folder_access, ['clientes']);
});

test('ai knowledge handler should allow super_admin to read knowledge stats', async () => {
    const createClientMock = createSupabaseClientMock({
        getUser: () => ({
            data: { user: { id: 'admin-1', email: 'root@example.com' } },
            error: null
        }),
        resolveQuery: ({ table, mode, action, filters }) => {
            const idFilter = filters.find((item) => item.field === 'id')?.value;
            const orgFilter = filters.find((item) => item.field === 'organization_id')?.value;

            if (table === 'profiles' && action === 'select' && mode === 'single' && idFilter === 'admin-1') {
                return { data: { id: 'admin-1', role: 'super_admin', organization_id: 'org-1' }, error: null };
            }

            if (table === 'ai_knowledge_chunks' && action === 'select' && mode === 'then' && orgFilter === 'org-1') {
                return {
                    data: [
                        { id: '1', entity_type: 'titular', source_scope: 'client_profile', updated_at: '2026-04-20T12:00:00Z' },
                        { id: '2', entity_type: 'processo', source_scope: 'process_summary', updated_at: '2026-04-20T13:00:00Z' }
                    ],
                    error: null
                };
            }

            return { data: null, error: null };
        }
    });
    const handler = loadServerHandlerWithSupabaseMock('server/aiKnowledgeHandler.cjs', createClientMock);
    const req = createMockReq({ method: 'GET', headers: { authorization: 'Bearer valid-token' } });
    const res = createMockRes();

    await handler(req, res, env);

    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(String(res.body || '{}'));
    assert.equal(payload.data.total_chunks, 2);
    assert.equal(payload.data.by_entity_type.titular, 1);
    assert.equal(payload.data.by_entity_type.processo, 1);
});

test('admin backup handler should allow super_admin to generate empty backup', async () => {
    const createClientMock = createSupabaseClientMock({
        getUser: () => ({
            data: { user: { id: 'admin-1', email: 'root@example.com' } },
            error: null
        }),
        resolveQuery: ({ table, mode, action, filters }) => {
            const idFilter = filters.find((item) => item.field === 'id')?.value;
            const orgFilter = filters.find((item) => item.field === 'organization_id')?.value;

            if (table === 'profiles' && action === 'select' && mode === 'single' && idFilter === 'admin-1') {
                return { data: { id: 'admin-1', role: 'super_admin', organization_id: 'org-1' }, error: null };
            }

            if (['clients', 'processes', 'trash'].includes(table) && action === 'select' && orgFilter === 'org-1') {
                return { data: [], error: null };
            }

            return { data: null, error: null };
        }
    });
    const handler = loadServerHandlerWithSupabaseMock('server/adminBackupHandler.cjs', createClientMock);
    const req = createMockReq({ method: 'GET', headers: { authorization: 'Bearer valid-token' } });
    const res = createMockRes();

    await handler(req, res, env);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'application/zip');
    assert.match(String(res.headers['Content-Disposition'] || ''), /backup-geoconsult-org-1-/);
    assert.equal(Buffer.isBuffer(res.body), true);
});

test('bootstrap handler should aggregate profile, organization and preferences in one response', async () => {
    const createClientMock = createSupabaseClientMock({
        getUser: () => ({
            data: {
                user: {
                    id: 'user-1',
                    email: 'user@example.com',
                    user_metadata: {
                        full_name: 'User Example',
                        gender: 'neutro',
                        role: 'user',
                        organization_id: 'org-1',
                        permissions: { view: true, edit: false, delete: false },
                        folder_access: ['painel', 'clientes']
                    }
                }
            },
            error: null
        }),
        resolveQuery: ({ table, mode, action, filters, selectColumns }) => {
            const idFilter = filters.find((item) => item.field === 'id')?.value;
            const userIdFilter = filters.find((item) => item.field === 'user_id')?.value;

            if (table === 'profiles' && action === 'select' && mode === 'maybeSingle' && idFilter === 'user-1') {
                return {
                    data: {
                        id: 'user-1',
                        email: 'user@example.com',
                        full_name: 'User Example',
                        gender: 'neutro',
                        role: 'user',
                        organization_id: 'org-1',
                        permissions: { view: true, edit: false, delete: false },
                        folder_access: ['painel', 'clientes']
                    },
                    error: null
                };
            }

            if (table === 'profiles' && action === 'select' && mode === 'limit') {
                return { data: [], error: null };
            }

            if (table === 'trash' && action === 'select' && mode === 'then') {
                return { data: [], error: null };
            }

            if (table === 'clients' && action === 'select' && mode === 'then') {
                return { data: [{ id: 'client-1' }, { id: 'client-2' }], error: null };
            }

            if (table === 'processes' && action === 'select' && mode === 'then') {
                return {
                    data: [
                        {
                            id: 'process-1',
                            client_id: 'client-1',
                            tipo: 'Requerimento',
                            tipo_sigla: 'REQ',
                            numero_titulo: '',
                            fase: 'Requerimento',
                            data_protocolo: '2026-04-10',
                            data_outorga: '',
                            deadlines: [{ id: 'deadline-1', date: '2026-04-29' }]
                        }
                    ],
                    error: null
                };
            }

            if (table === 'organizations' && action === 'select' && mode === 'single' && idFilter === 'org-1') {
                return {
                    data: {
                        id: 'org-1',
                        name: 'Org Teste',
                        slug: 'org-teste',
                        enabled_modules: ['painel', 'clientes', 'processos']
                    },
                    error: null
                };
            }

            if (table === 'user_preferences' && action === 'select' && mode === 'then' && userIdFilter === 'user-1') {
                return {
                    data: [
                        { preference_key: 'ui.theme', preference_value: 'esmeralda', updated_at: '2026-04-28T12:00:00Z' },
                        { preference_key: 'ui.alert_lead_days', preference_value: 21, updated_at: '2026-04-28T12:00:00Z' }
                    ],
                    error: null
                };
            }

            return { data: null, error: null };
        }
    });
    const handler = loadServerHandlerWithSupabaseMock('server/bootstrapHandler.cjs', createClientMock);
    const req = createMockReq({ method: 'GET', headers: { authorization: 'Bearer valid-token' } });
    const res = createMockRes();

    await handler(req, res, env);

    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(String(res.body || '{}'));
    assert.equal(payload.data.profile.id, 'user-1');
    assert.equal(payload.data.organization.id, 'org-1');
    assert.equal(payload.data.preferences.theme, 'esmeralda');
    assert.equal(payload.data.preferences.alertLeadDays, 21);
    assert.equal(payload.data.dashboardSummary.totalTitulares, 2);
    assert.equal(payload.data.dashboardSummary.totalProcessos, 1);
});

test('finance handler should return the remote finance state for the authenticated user', async () => {
    const financeRows = {
        finance_cashboxes: [{ id: 'cash-1', organization_id: 'org-1', title: 'Geoconsult', created_at: '2026-04-28T10:00:00Z', updated_at: '2026-04-28T15:00:00Z' }],
        finance_cashbox_transactions: [{ id: 'txn-1', organization_id: 'org-1', cashbox_id: 'cash-1', occurred_on: '2026-04-28', description: 'Entrada teste', entry_type: 'entrada', credit_amount: 1200, debit_amount: 0, transfer_group_id: null, transfer_direction: null, counterpart_cashbox_id: null, ficha_title: '', sort_index: 0, updated_at: '2026-04-28T15:00:00Z' }],
        finance_fichas: [],
        finance_contracts: [],
        finance_contract_entries: [],
        finance_agendamentos: []
    };
    const createClientMock = createSupabaseClientMock({
        getUser: (token) => ({
            data: {
                user: token === 'valid-token'
                    ? { id: 'user-1', email: 'user@example.com', user_metadata: {} }
                    : null
            },
            error: null
        }),
        resolveQuery: ({ table, mode, action, filters }) => {
            const idFilter = filters.find((item) => item.field === 'id')?.value;
            const organizationFilter = filters.find((item) => item.field === 'organization_id')?.value;

            if (table === 'profiles' && action === 'select' && mode === 'maybeSingle' && idFilter === 'user-1') {
                return {
                    data: {
                        id: 'user-1',
                        email: 'user@example.com',
                        full_name: 'User Example',
                        gender: 'neutro',
                        role: 'user',
                        organization_id: 'org-1',
                        permissions: { view: true, edit: false, delete: false },
                        folder_access: ['painel', 'financeiro']
                    },
                    error: null
                };
            }

            if (table === 'profiles' && action === 'select' && mode === 'limit') {
                return { data: [], error: null };
            }

            if (organizationFilter === 'org-1' && action === 'select' && mode === 'then' && Object.prototype.hasOwnProperty.call(financeRows, table)) {
                return { data: financeRows[table], error: null };
            }

            return { data: null, error: null };
        }
    });
    const handler = loadServerHandlerWithSupabaseMock('server/financeHandler.cjs', createClientMock);
    const req = createMockReq({ method: 'GET', headers: { authorization: 'Bearer valid-token' } });
    const res = createMockRes();

    await handler(req, res, env);

    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(String(res.body || '{}'));
    assert.deepEqual(payload.data.state.itemsByTab.caixa.map((item) => item.id), ['cash-1']);
    assert.equal(payload.data.state.itemsByTab.caixa[0].transactions[0].description, 'Entrada teste');
    assert.equal(payload.data.updatedAt, '2026-04-28T15:00:00Z');
});

test('finance handler should persist scoped finance state via PUT', async () => {
    const rowsByTable = {
        finance_cashboxes: [],
        finance_cashbox_transactions: [],
        finance_fichas: [],
        finance_contracts: [],
        finance_contract_entries: [],
        finance_agendamentos: []
    };
    const createClientMock = createSupabaseClientMock({
        getUser: (token) => ({
            data: {
                user: token === 'valid-token'
                    ? { id: 'user-1', email: 'user@example.com', user_metadata: {} }
                    : null
            },
            error: null
        }),
        resolveQuery: ({ table, mode, action, filters, payload }) => {
            const idFilter = filters.find((item) => item.field === 'id')?.value;
            const organizationFilter = filters.find((item) => item.field === 'organization_id')?.value;

            if (table === 'profiles' && action === 'select' && mode === 'maybeSingle' && idFilter === 'user-1') {
                return {
                    data: {
                        id: 'user-1',
                        email: 'user@example.com',
                        full_name: 'User Example',
                        gender: 'neutro',
                        role: 'user',
                        organization_id: 'org-1',
                        permissions: { view: true, edit: false, delete: false },
                        folder_access: ['painel', 'financeiro']
                    },
                    error: null
                };
            }

            if (table === 'profiles' && action === 'select' && mode === 'limit') {
                return { data: [], error: null };
            }

            const payloadOrganizationId = Array.isArray(payload)
                ? payload[0]?.organization_id
                : payload?.organization_id;

            if ((organizationFilter === 'org-1' || payloadOrganizationId === 'org-1') && Object.prototype.hasOwnProperty.call(rowsByTable, table)) {
                if (action === 'delete' && mode === 'then') {
                    rowsByTable[table] = [];
                    return { data: [], error: null };
                }

                if (action === 'insert' && mode === 'then') {
                    rowsByTable[table] = Array.isArray(payload) ? payload : [payload];
                    return { data: rowsByTable[table], error: null };
                }

                if (action === 'select' && mode === 'then') {
                    return { data: rowsByTable[table], error: null };
                }
            }

            return { data: null, error: null };
        }
    });
    const handler = loadServerHandlerWithSupabaseMock('server/financeHandler.cjs', createClientMock);
    const req = createMockReq({
        method: 'PUT',
        headers: { authorization: 'Bearer valid-token' },
        body: {
            state: {
                itemsByTab: {
                    caixa: [{ id: 'cash-2', title: 'Caixa novo', transactions: [] }],
                    fichas: [],
                    agendamentos: []
                }
            }
        }
    });
    const res = createMockRes();

    await handler(req, res, env);

    assert.equal(res.statusCode, 200);
    assert.equal(rowsByTable.finance_cashboxes.length, 1);
    assert.equal(rowsByTable.finance_cashboxes[0].organization_id, 'org-1');
    assert.equal(rowsByTable.finance_cashboxes[0].id, 'cash-2');
    assert.equal(rowsByTable.finance_cashboxes[0].title, 'Caixa novo');
});

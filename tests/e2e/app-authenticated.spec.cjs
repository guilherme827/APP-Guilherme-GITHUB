const { test, expect } = require('@playwright/test');

const MOCK_CLIENTS = [
    {
        id: 'client-1',
        type: 'PF',
        nome: 'Marina Albuquerque',
        cpf: '142.553.890-00',
        nomeFantasia: '',
        cnpj: '',
        nomeEmpresarial: '',
        email: 'marina.albuquerque@geoconsult.com',
        telefone: '(91) 99999-0000',
        logradouro: 'Av. Central',
        numero: '100',
        bairro: 'Centro',
        cidade: 'Belem',
        uf: 'PA',
        cep: '66000-000',
        documents: []
    }
];

const MOCK_PROCESSES = [
    {
        id: 'process-1',
        clientId: 'client-1',
        projectId: null,
        projectName: '',
        tipo: 'Licenciamento',
        numeroProcesso: 'PROC-001',
        numeroTitulo: '',
        fase: 'protocolo',
        dataProtocolo: '2026-03-10',
        dataOutorga: '',
        docBase64: '',
        docStoragePath: '',
        deadlines: [
            {
                id: 'deadline-1',
                desc: 'Entrega de memoria descritiva',
                date: '2026-03-20',
                status: 'pending'
            }
        ],
        events: []
    }
];

const ADMIN_TEAM = [
    {
        id: 'user-admin',
        email: 'admin@geoconsult.com',
        full_name: 'Admin Geoconsult',
        role: 'admin',
        gender: 'neutro',
        permissions: { view: true, edit: true, delete: true },
        folder_access: ['painel', 'clientes', 'processos', 'prazos', 'financeiro', 'configuracoes']
    },
    {
        id: 'user-analyst',
        email: 'analyst@geoconsult.com',
        full_name: 'Analista Operacional',
        role: 'user',
        gender: 'feminino',
        permissions: { view: true, edit: true, delete: false },
        folder_access: ['painel', 'clientes', 'processos', 'prazos', 'configuracoes']
    }
];

async function bootAuthenticatedApp(page, profile, extra = {}) {
    const runtime = {
        session: {
            access_token: 'e2e-access-token',
            refresh_token: 'e2e-refresh-token',
            token_type: 'bearer',
            user: {
                id: profile.id,
                email: profile.email
            }
        },
        profile,
        clients: MOCK_CLIENTS,
        processes: MOCK_PROCESSES,
        ...extra
    };

    await page.goto('/');
    await page.evaluate((serializedRuntime) => {
        window.localStorage.setItem('app-control-e2e-runtime', JSON.stringify(serializedRuntime));
        window.__APP_CONTROL_E2E__ = serializedRuntime;
    }, runtime);
    await page.reload();
    await expect(page).toHaveURL(/\/app$/);
}

test.describe('Authenticated app', () => {
    test('permite navegar pelas secoes principais com sessao mockada', async ({ page }) => {
        await bootAuthenticatedApp(page, {
            id: 'user-1',
            email: 'operador@geoconsult.com',
            full_name: 'Operador Geoconsult',
            role: 'user',
            gender: 'neutro',
            permissions: { view: true, edit: true, delete: false },
            folder_access: ['painel', 'clientes', 'processos', 'prazos', 'financeiro', 'configuracoes']
        });

        await expect(page.getByLabel('Adicionar widget')).toBeVisible();

        await page.getByLabel('Titulares').click();
        await expect(page.getByPlaceholder('Buscar titular...')).toBeVisible();
        await expect(page.getByLabel('Adicionar titular')).toBeVisible();

        await page.getByLabel('Processos').click();
        await expect(page.getByPlaceholder('Buscar titular...')).toBeVisible();
        await expect(page.getByLabel('Adicionar processo')).toBeVisible();
        await expect(page.getByRole('button', { name: /Marina Albuquerque/i })).toBeVisible();

        await page.getByLabel('Prazos').click();
        await expect(page.getByText('PRAZOS EM ABERTO')).toBeVisible();

        await page.getByLabel('Financeiro').click();
        await expect(page.getByText('Financeiro individual preparado.')).toBeVisible();

        await page.getByLabel('Configuracoes').first().click();
        await expect(page.getByText('Perfil e seguranca')).toBeVisible();
        await expect(page.locator('#settings-open-team')).toHaveCount(0);
    });

    test('permite fluxo administrativo ate a gestao de equipe', async ({ page }) => {
        await bootAuthenticatedApp(page, ADMIN_TEAM[0], {
            teamProfiles: ADMIN_TEAM
        });

        await page.getByLabel('Configuracoes').first().click();
        await expect(page.getByText('Perfil e seguranca')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Gerenciar equipe' })).toBeVisible();

        await page.getByRole('button', { name: 'Gerenciar equipe' }).click();
        await expect(page.getByText('Equipe cadastrada')).toBeVisible();
        await expect(page.getByText('Analista Operacional')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Atualizar lista' })).toBeVisible();
    });

    test('permite criar e editar um titular pela interface', async ({ page }) => {
        await bootAuthenticatedApp(page, {
            id: 'user-1',
            email: 'operador@geoconsult.com',
            full_name: 'Operador Geoconsult',
            role: 'user',
            gender: 'neutro',
            permissions: { view: true, edit: true, delete: false },
            folder_access: ['painel', 'clientes', 'processos', 'prazos', 'financeiro', 'configuracoes']
        });

        await page.getByLabel('Titulares').click();
        await page.getByLabel('Adicionar titular').click();

        await expect(page.getByText('Novo Titular')).toBeVisible();
        await page.locator('input[name="nome"]').fill('Cliente E2E');
        await page.locator('input[name="cpf"]').fill('12345678901');
        await page.locator('input[name="email"]').fill('cliente.e2e@teste.com');
        await page.locator('input[name="telefone"]').fill('11999999999');
        await page.getByRole('button', { name: 'SALVAR TITULAR' }).click();

        await expect(page.getByPlaceholder('Buscar titular...')).toBeVisible();
        await page.getByPlaceholder('Buscar titular...').fill('Cliente E2E');
        await expect(page.getByRole('button', { name: /Cliente E2E/i })).toBeVisible();
        await page.getByRole('button', { name: /Cliente E2E/i }).click();
        await expect(page.getByRole('heading', { name: 'Cliente E2E' })).toBeVisible();

        await page.getByRole('button', { name: 'Editar' }).click();
        await expect(page.getByText('Editar Titular')).toBeVisible();
        await page.locator('input[name="nome"]').fill('Cliente E2E Atualizado');
        await page.getByRole('button', { name: 'SALVAR TITULAR' }).click();

        await page.getByPlaceholder('Buscar titular...').fill('Atualizado');
        await expect(page.getByRole('button', { name: /Cliente E2E Atualizado/i })).toBeVisible();
    });

    test('permite criar e editar um processo pela interface', async ({ page }) => {
        await bootAuthenticatedApp(page, {
            id: 'user-1',
            email: 'operador@geoconsult.com',
            full_name: 'Operador Geoconsult',
            role: 'user',
            gender: 'neutro',
            permissions: { view: true, edit: true, delete: false },
            folder_access: ['painel', 'clientes', 'processos', 'prazos', 'financeiro', 'configuracoes']
        });

        await page.getByLabel('Processos').click();
        await page.getByLabel('Adicionar processo').click();
        await page.getByRole('button', { name: 'PREENCHER MANUALMENTE' }).click();

        await page.locator('#client-search-input').fill('Marina');
        await page.locator('#client-results .search-item').first().click();
        await page.locator('input[name="orgaoNomeCompleto"]').fill('Secretaria Estadual de Meio Ambiente');
        await page.locator('input[name="orgaoSigla"]').fill('SEMAS');
        await page.locator('input[name="tipo"]').fill('Licenca Previa');
        await page.locator('input[name="tipoSigla"]').fill('LP');
        await page.locator('input[name="tipologia"]').fill('Pesquisa Mineral');
        await page.locator('input[name="numeroProcesso"]').fill('PROC-E2E-001');
        await page.locator('input[name="dataProtocolo"]').fill('2026-03-14');
        await page.getByRole('button', { name: 'SALVAR PROCESSO' }).click();

        await expect(page.locator('.process-row', { hasText: 'PROC-E2E-001' })).toBeVisible();

        const createdRow = page.locator('.process-row', { hasText: 'PROC-E2E-001' }).first();
        await createdRow.locator('.proc-menu-btn').click();
        await createdRow.locator('.proc-action[data-action="edit"]').click();

        await expect(page.getByText('Configuração do Processo')).toBeVisible();
        await page.locator('input[name="numeroProcesso"]').fill('PROC-E2E-EDITADO');
        await page.locator('input[name="tipoSigla"]').fill('LPE');
        await page.getByRole('button', { name: 'SALVAR PROCESSO' }).click();

        await expect(page.getByText('PROC-E2E-EDITADO', { exact: true })).toBeVisible();
        await expect(page.getByText('LPE', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'OK' }).click();
        await page.getByText('PROCESSOS').first().click();
        await expect(page.locator('.process-row', { hasText: 'PROC-E2E-EDITADO' })).toBeVisible();
    });
});

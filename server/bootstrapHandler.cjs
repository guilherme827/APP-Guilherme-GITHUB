const accountHandler = require('./accountHandler.cjs');
const accessPolicy = require('../shared/accessPolicy.cjs');

function isMissingPreferenceTable(error) {
    const message = String(error?.message || '');
    return error?.code === 'PGRST205'
        || /relation .*user_preferences/i.test(message)
        || /could not find the table/i.test(message)
        || /schema cache/i.test(message);
}

async function getCurrentOrganization(serviceClient, profile) {
    if (!profile?.organization_id || accessPolicy.isSuperAdminRole(profile.role)) {
        return null;
    }

    const { data, error } = await serviceClient
        .from('organizations')
        .select('*')
        .eq('id', profile.organization_id)
        .single();

    if (error && /enabled_modules/i.test(String(error.message || ''))) {
        const fallbackResult = await serviceClient
            .from('organizations')
            .select('id, name, slug, is_active, created_by, created_at, updated_at')
            .eq('id', profile.organization_id)
            .single();

        if (fallbackResult.error || !fallbackResult.data) {
            throw new Error(fallbackResult.error?.message || 'Não foi possível carregar a organização atual.');
        }

        return {
            ...fallbackResult.data,
            enabled_modules: [...accessPolicy.ORGANIZATION_MODULE_IDS]
        };
    }

    if (error) {
        throw new Error(error.message || 'Não foi possível carregar a organização atual.');
    }

    return data
        ? {
            ...data,
            enabled_modules: accessPolicy.normalizeOrganizationModules(data.enabled_modules)
        }
        : null;
}

async function getUserPreferences(serviceClient, userId) {
    const fallback = {
        theme: 'niobio',
        alertLeadDays: 15
    };

    const { data, error } = await serviceClient
        .from('user_preferences')
        .select('preference_key, preference_value, updated_at')
        .eq('user_id', userId)
        .in('preference_key', ['ui.theme', 'ui.alert_lead_days']);

    if (error) {
        if (isMissingPreferenceTable(error)) {
            return fallback;
        }
        throw new Error(error.message || 'Não foi possível carregar as preferências do usuário.');
    }

    const themeRow = (data || []).find((row) => row.preference_key === 'ui.theme');
    const alertRow = (data || []).find((row) => row.preference_key === 'ui.alert_lead_days');

    const theme = String(themeRow?.preference_value || fallback.theme).trim() || fallback.theme;
    const alertLeadDays = Number(alertRow?.preference_value);

    return {
        theme,
        alertLeadDays: Number.isFinite(alertLeadDays) && alertLeadDays > 0 ? alertLeadDays : fallback.alertLeadDays
    };
}

function buildDashboardSummary(clients, processes) {
    const safeClients = Array.isArray(clients) ? clients : [];
    const safeProcesses = Array.isArray(processes) ? processes : [];
    const totalTitulares = safeClients.length;
    const totalProcessos = safeProcesses.length;
    const titularesComProcesso = new Set(
        safeProcesses.map((process) => String(process?.client_id || '').trim()).filter(Boolean)
    ).size;
    const titularesSemProcesso = Math.max(totalTitulares - titularesComProcesso, 0);
    const titularesComProcessoPercent = totalTitulares ? Math.round((titularesComProcesso / totalTitulares) * 100) : 0;

    const processTypeCounts = safeProcesses.reduce((acc, process) => {
        const label = String(process?.tipo_sigla || process?.tipo || 'OUT').trim().toUpperCase();
        const safeLabel = label.length > 10 ? label.slice(0, 10) : label;
        acc.set(safeLabel, (acc.get(safeLabel) || 0) + 1);
        return acc;
    }, new Map());

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const prazoItems = safeProcesses.reduce((acc, process) => {
        const deadlines = Array.isArray(process?.deadlines) ? process.deadlines : [];
        deadlines.forEach((deadline, index) => {
            const rawDate = String(deadline?.date || '').trim();
            if (!rawDate) return;
            const date = new Date(`${rawDate}T00:00:00`);
            if (Number.isNaN(date.getTime())) return;
            acc.push({
                id: String(deadline?.id || `${process?.id || 'process'}-${index}`),
                diffDays: Math.round((date.getTime() - today.getTime()) / 86400000)
            });
        });
        return acc;
    }, []);

    const overdueDeadlines = prazoItems.filter((item) => item.diffDays < 0);
    const todayDeadlines = prazoItems.filter((item) => item.diffDays === 0);
    const weekDeadlines = prazoItems.filter((item) => item.diffDays > 0 && item.diffDays <= 7);
    const monthDeadlines = prazoItems.filter((item) => item.diffDays > 7 && item.diffDays <= 30);
    const laterDeadlines = prazoItems.filter((item) => item.diffDays > 30);
    const totalPrazos = prazoItems.length;
    const maxDeadlineBucket = Math.max(
        overdueDeadlines.length,
        todayDeadlines.length,
        weekDeadlines.length,
        monthDeadlines.length,
        laterDeadlines.length,
        1
    );
    const prazoDistribution = [
        { label: 'Atrasados', value: overdueDeadlines.length, tone: 'late' },
        { label: 'Hoje', value: todayDeadlines.length, tone: 'today' },
        { label: 'Prox. semana', value: weekDeadlines.length, tone: 'soon' },
        { label: 'Prox. 30 dias', value: monthDeadlines.length, tone: 'month' },
        { label: 'Mais de 30 dias', value: laterDeadlines.length, tone: 'future' }
    ];
    const topProcessTypes = [...processTypeCounts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 3)
        .map(([label, value]) => ({ label, value }));

    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const outorgadosNoMes = safeProcesses.filter((process) => {
        const rawDate = String(process?.data_outorga || '').trim();
        if (!rawDate) return false;
        const parsedDate = new Date(`${rawDate}T00:00:00`);
        return !Number.isNaN(parsedDate.getTime())
            && parsedDate.getMonth() === currentMonth
            && parsedDate.getFullYear() === currentYear;
    }).length;
    const requerimentosProtocoladosNoMes = safeProcesses.filter((process) => {
        const rawDate = String(process?.data_protocolo || '').trim();
        if (!rawDate) return false;
        const parsedDate = new Date(`${rawDate}T00:00:00`);
        if (Number.isNaN(parsedDate.getTime())) return false;
        const hasTitulo = Boolean(String(process?.numero_titulo || '').trim());
        const fase = String(process?.fase || '')
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .trim();
        const isRequerimento = !hasTitulo || fase.includes('requerimento');
        return isRequerimento
            && parsedDate.getMonth() === currentMonth
            && parsedDate.getFullYear() === currentYear;
    }).length;

    return {
        totalTitulares,
        totalProcessos,
        titularesComProcesso,
        titularesSemProcesso,
        titularesComProcessoPercent,
        totalPrazos,
        maxDeadlineBucket,
        prazoDistribution,
        topProcessTypes,
        hasCriticalDeadlines: overdueDeadlines.length > 0,
        monthlyGoals: {
            outorgadosNoMes,
            requerimentosProtocoladosNoMes
        }
    };
}

async function getDashboardSummary(serviceClient, organizationId) {
    if (!organizationId) {
        return buildDashboardSummary([], []);
    }

    const [trashResult, clientsResult, processesResult] = await Promise.all([
        serviceClient
            .from('trash')
            .select('item_id, item_type')
            .eq('organization_id', organizationId),
        serviceClient
            .from('clients')
            .select('id')
            .eq('organization_id', organizationId),
        serviceClient
            .from('processes')
            .select('id, client_id, tipo, tipo_sigla, numero_titulo, fase, data_protocolo, data_outorga, deadlines')
            .eq('organization_id', organizationId)
    ]);

    if (trashResult.error) {
        throw new Error(trashResult.error.message || 'Não foi possível carregar a lixeira para o resumo inicial.');
    }
    if (clientsResult.error) {
        throw new Error(clientsResult.error.message || 'Não foi possível carregar os titulares para o resumo inicial.');
    }
    if (processesResult.error) {
        throw new Error(processesResult.error.message || 'Não foi possível carregar os processos para o resumo inicial.');
    }

    const trashedClientIds = new Set((trashResult.data || [])
        .filter((item) => item.item_type === 'titular')
        .map((item) => String(item.item_id)));
    const trashedProcessIds = new Set((trashResult.data || [])
        .filter((item) => item.item_type === 'processo')
        .map((item) => String(item.item_id)));

    const clients = (clientsResult.data || []).filter((item) => !trashedClientIds.has(String(item.id)));
    const processes = (processesResult.data || []).filter((item) => !trashedProcessIds.has(String(item.id)));

    return buildDashboardSummary(clients, processes);
}

module.exports = async function bootstrapHandler(req, res, env = process.env) {
    if (req.method !== 'GET') {
        accountHandler.sendJson(res, 405, { error: 'Método não suportado.' });
        return;
    }

    const auth = await accountHandler.authenticateUser(req, env);
    if (auth.error) {
        accountHandler.sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }

    try {
        const profile = await accountHandler.ensureOwnProfile(auth);
        const [organization, preferences, dashboardSummary] = await Promise.all([
            getCurrentOrganization(auth.serviceClient, profile),
            getUserPreferences(auth.serviceClient, auth.user.id),
            getDashboardSummary(auth.serviceClient, profile.organization_id)
        ]);

        accountHandler.sendJson(res, 200, {
            data: {
                profile,
                organization,
                preferences,
                dashboardSummary
            }
        });
    } catch (error) {
        accountHandler.sendJson(res, 500, { error: error.message || 'Não foi possível carregar o bootstrap inicial.' });
    }
};

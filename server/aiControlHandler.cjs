const { createClient } = require('@supabase/supabase-js');
const accessPolicy = require('../shared/accessPolicy.cjs');

const DEFAULT_AGENTS = [
    {
        slug: 'estagiario',
        name: 'Estagiario',
        description: 'Orquestrador geral das solicitacoes no chat global.',
        is_enabled: false,
        system_prompt: '',
        allowed_tools: ['delegate', 'search_internal_data', 'open_process', 'open_client'],
        allowed_modules: ['painel', 'clientes', 'processos', 'admin-panel'],
        monthly_token_limit: 0,
        monthly_cost_limit_brl: 0,
        priority: 10,
        visibility_scope: 'admin'
    },
    {
        slug: 'tecnico',
        name: 'Tecnico',
        description: 'Redator tecnico para documentos ambientais e engenharia.',
        is_enabled: false,
        system_prompt: '',
        allowed_tools: ['rag_process_docs', 'draft_document'],
        allowed_modules: ['processos'],
        monthly_token_limit: 0,
        monthly_cost_limit_brl: 0,
        priority: 20,
        visibility_scope: 'admin'
    },
    {
        slug: 'secretaria',
        name: 'Secretaria',
        description: 'Comunicacao corporativa com titulares e equipe.',
        is_enabled: false,
        system_prompt: '',
        allowed_tools: ['draft_email', 'draft_whatsapp', 'summarize_meeting'],
        allowed_modules: ['clientes', 'processos'],
        monthly_token_limit: 0,
        monthly_cost_limit_brl: 0,
        priority: 30,
        visibility_scope: 'admin'
    },
    {
        slug: 'compliance',
        name: 'Compliance',
        description: 'Checklists, normativas e pendencias regulatórias.',
        is_enabled: false,
        system_prompt: '',
        allowed_tools: ['check_rules', 'build_checklist', 'compare_requirements'],
        allowed_modules: ['processos'],
        monthly_token_limit: 0,
        monthly_cost_limit_brl: 0,
        priority: 40,
        visibility_scope: 'admin'
    },
    {
        slug: 'auditor',
        name: 'Auditor',
        description: 'Monitor de consumo, limites e custos das IAs.',
        is_enabled: true,
        system_prompt: '',
        allowed_tools: ['track_usage', 'block_request'],
        allowed_modules: ['admin-panel'],
        monthly_token_limit: 0,
        monthly_cost_limit_brl: 0,
        priority: 50,
        visibility_scope: 'admin'
    }
];

const DEFAULT_AI_MODELS = [
    {
        slug: 'gemini-2-0-flash-lite',
        name: 'Gemini 2.0 Flash-Lite',
        provider: 'gemini',
        model: 'gemini-2.0-flash-lite',
        temperature_default: 0.2,
        max_tokens_default: 4096,
        is_active: true,
        supports_chat: true,
        supports_rag: true,
        supports_tools: false,
        cost_input_per_million: 0,
        cost_output_per_million: 0,
        currency: 'BRL',
        notes: 'Modelo padrao leve para testes iniciais.'
    },
    {
        slug: 'gemini-2-0-flash',
        name: 'Gemini 2.0 Flash',
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        temperature_default: 0.2,
        max_tokens_default: 8192,
        is_active: true,
        supports_chat: true,
        supports_rag: true,
        supports_tools: false,
        cost_input_per_million: 0,
        cost_output_per_million: 0,
        currency: 'BRL',
        notes: 'Modelo padrao equilibrado para chat e orquestracao.'
    },
    {
        slug: 'gemini-2-5-flash-lite',
        name: 'Gemini 2.5 Flash-Lite',
        provider: 'gemini',
        model: 'gemini-2.5-flash-lite',
        temperature_default: 0.2,
        max_tokens_default: 8192,
        is_active: true,
        supports_chat: true,
        supports_rag: true,
        supports_tools: false,
        cost_input_per_million: 0,
        cost_output_per_million: 0,
        currency: 'BRL',
        notes: 'Opcao leve de nova geracao para testes.'
    },
    {
        slug: 'gemini-2-5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        temperature_default: 0.2,
        max_tokens_default: 8192,
        is_active: true,
        supports_chat: true,
        supports_rag: true,
        supports_tools: false,
        cost_input_per_million: 0,
        cost_output_per_million: 0,
        currency: 'BRL',
        notes: 'Opcao mais forte para o agente Tecnico.'
    }
];

const DEFAULT_AGENT_MODEL_SLUG = {
    estagiario: 'gemini-2-0-flash',
    tecnico: 'gemini-2-5-flash',
    secretaria: 'gemini-2-0-flash-lite',
    compliance: 'gemini-2-0-flash',
    auditor: 'gemini-2-0-flash-lite'
};

function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => {
            raw += String(chunk || '');
        });
        req.on('end', () => {
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

function getClients(env) {
    const supabaseUrl = String(env.VITE_SUPABASE_URL || '').trim();
    const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY || '').trim();
    const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
        throw new Error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY precisam estar configuradas no servidor.');
    }

    return {
        anonClient: createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } }),
        serviceClient: createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    };
}

async function authenticateRequester(req, env) {
    const { anonClient, serviceClient } = getClients(env);
    const authorization = String(req.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

    if (!token) {
        return { error: { status: 401, message: 'Token de autenticacao ausente.' } };
    }

    const { data: authData, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !authData?.user) {
        return { error: { status: 401, message: authError?.message || 'Sessao invalida.' } };
    }

    const { data: profile, error: profileError } = await serviceClient
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

    if (profileError || !profile) {
        return { error: { status: 403, message: profileError?.message || 'Perfil do usuario nao encontrado.' } };
    }

    if (!profile.organization_id) {
        return { error: { status: 403, message: 'Usuario sem organizacao vinculada.' } };
    }

    if (!accessPolicy.isAdminRole(profile.role)) {
        return { error: { status: 403, message: 'Acesso restrito ao Painel Administrativo.' } };
    }

    return { user: authData.user, profile, serviceClient };
}

function normalizeProviderConfig(input = {}) {
    return {
        label: String(input.label || '').trim(),
        provider: String(input.provider || '').trim().toLowerCase(),
        api_key: String(input.api_key || '').trim(),
        base_url: String(input.base_url || '').trim(),
        is_enabled: input.is_enabled !== false
    };
}

function normalizeAiModel(input = {}) {
    return {
        name: String(input.name || '').trim(),
        slug: String(input.slug || '').trim().toLowerCase(),
        provider: String(input.provider || '').trim().toLowerCase(),
        model: String(input.model || '').trim(),
        api_config_id: input.api_config_id || null,
        temperature_default: Number.isFinite(Number(input.temperature_default)) ? Number(input.temperature_default) : 0.2,
        max_tokens_default: Number.isFinite(Number(input.max_tokens_default)) ? Number(input.max_tokens_default) : 4096,
        is_active: input.is_active !== false,
        supports_chat: input.supports_chat !== false,
        supports_rag: input.supports_rag === true,
        supports_tools: input.supports_tools === true,
        cost_input_per_million: Number.isFinite(Number(input.cost_input_per_million)) ? Number(input.cost_input_per_million) : 0,
        cost_output_per_million: Number.isFinite(Number(input.cost_output_per_million)) ? Number(input.cost_output_per_million) : 0,
        currency: String(input.currency || 'BRL').trim().toUpperCase(),
        notes: String(input.notes || '').trim()
    };
}

function normalizeAgent(input = {}) {
    return {
        slug: String(input.slug || '').trim().toLowerCase(),
        name: String(input.name || '').trim(),
        description: String(input.description || '').trim(),
        is_enabled: input.is_enabled === true,
        ai_model_id: input.ai_model_id || null,
        system_prompt: String(input.system_prompt || '').trim(),
        allowed_tools: Array.isArray(input.allowed_tools) ? input.allowed_tools.filter(Boolean) : [],
        allowed_modules: Array.isArray(input.allowed_modules) ? input.allowed_modules.filter(Boolean) : [],
        monthly_token_limit: Number.isFinite(Number(input.monthly_token_limit)) ? Number(input.monthly_token_limit) : 0,
        monthly_cost_limit_brl: Number.isFinite(Number(input.monthly_cost_limit_brl)) ? Number(input.monthly_cost_limit_brl) : 0,
        priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 0,
        visibility_scope: String(input.visibility_scope || 'admin').trim()
    };
}

async function ensureDefaultAgents(auth) {
    const orgId = auth.profile.organization_id;
    const existingRes = await auth.serviceClient
        .from('ai_agents')
        .select('slug')
        .eq('organization_id', orgId);

    if (existingRes.error) {
        throw new Error(existingRes.error.message || 'Nao foi possivel verificar os agentes padrao.');
    }

    const existingSlugs = new Set((existingRes.data || []).map((item) => String(item.slug || '').trim().toLowerCase()));
    const missingPayload = DEFAULT_AGENTS
        .filter((agent) => !existingSlugs.has(agent.slug))
        .map((agent) => ({
            organization_id: orgId,
            ...agent
        }));

    if (missingPayload.length === 0) {
        return;
    }

    const { error } = await auth.serviceClient
        .from('ai_agents')
        .insert(missingPayload);

    if (error) {
        throw new Error(error.message || 'Nao foi possivel inicializar os agentes padrao.');
    }
}

async function ensureDefaultModelsAndAssignments(auth) {
    const orgId = auth.profile.organization_id;
    const existingModelsRes = await auth.serviceClient
        .from('ai_models')
        .select('slug')
        .eq('organization_id', orgId);

    if (existingModelsRes.error) {
        throw new Error(existingModelsRes.error.message || 'Nao foi possivel verificar o banco padrao de IAs.');
    }

    const existingModelSlugs = new Set((existingModelsRes.data || []).map((item) => String(item.slug || '').trim().toLowerCase()));
    const missingModelPayload = DEFAULT_AI_MODELS
        .filter((model) => !existingModelSlugs.has(model.slug))
        .map((model) => ({
            organization_id: orgId,
            api_config_id: null,
            ...model
        }));

    if (missingModelPayload.length > 0) {
        const insertModels = await auth.serviceClient
            .from('ai_models')
            .insert(missingModelPayload);

        if (insertModels.error) {
            throw new Error(insertModels.error.message || 'Nao foi possivel inicializar o banco padrao de IAs.');
        }
    }

    const [modelsRes, agentsRes] = await Promise.all([
        auth.serviceClient.from('ai_models').select('id, slug').eq('organization_id', orgId),
        auth.serviceClient.from('ai_agents').select('id, slug, ai_model_id').eq('organization_id', orgId)
    ]);

    if (modelsRes.error) throw new Error(modelsRes.error.message || 'Nao foi possivel carregar os modelos padrao.');
    if (agentsRes.error) throw new Error(agentsRes.error.message || 'Nao foi possivel carregar os agentes padrao.');

    const modelIdBySlug = new Map((modelsRes.data || []).map((item) => [item.slug, item.id]));
    const updates = (agentsRes.data || [])
        .filter((agent) => !agent.ai_model_id && DEFAULT_AGENT_MODEL_SLUG[agent.slug] && modelIdBySlug.has(DEFAULT_AGENT_MODEL_SLUG[agent.slug]))
        .map((agent) => ({
            id: agent.id,
            organization_id: orgId,
            ai_model_id: modelIdBySlug.get(DEFAULT_AGENT_MODEL_SLUG[agent.slug])
        }));

    if (updates.length > 0) {
        const updateRes = await auth.serviceClient.from('ai_agents').upsert(updates);
        if (updateRes.error) {
            throw new Error(updateRes.error.message || 'Nao foi possivel vincular as IAs padrao aos agentes.');
        }
    }
}

async function ensureProviderLinks(auth) {
    const orgId = auth.profile.organization_id;
    const [providersRes, modelsRes] = await Promise.all([
        auth.serviceClient
            .from('ai_provider_configs')
            .select('id, provider, is_enabled')
            .eq('organization_id', orgId),
        auth.serviceClient
            .from('ai_models')
            .select('id, provider, api_config_id')
            .eq('organization_id', orgId)
    ]);

    if (providersRes.error) {
        throw new Error(providersRes.error.message || 'Nao foi possivel carregar os provedores de IA.');
    }
    if (modelsRes.error) {
        throw new Error(modelsRes.error.message || 'Nao foi possivel carregar os modelos de IA.');
    }

    const enabledProvidersByType = (providersRes.data || []).reduce((acc, provider) => {
        if (!provider?.is_enabled) return acc;
        const key = String(provider.provider || '').trim().toLowerCase();
        if (!key) return acc;
        if (!acc[key]) acc[key] = [];
        acc[key].push(provider);
        return acc;
    }, {});

    const relinkPayload = (modelsRes.data || [])
        .filter((model) => !model.api_config_id)
        .map((model) => {
            const providerKey = String(model.provider || '').trim().toLowerCase();
            const matches = enabledProvidersByType[providerKey] || [];
            if (matches.length !== 1) return null;
            return {
                id: model.id,
                organization_id: orgId,
                api_config_id: matches[0].id
            };
        })
        .filter(Boolean);

    if (relinkPayload.length === 0) {
        return;
    }

    const updateRes = await auth.serviceClient
        .from('ai_models')
        .upsert(relinkPayload);

    if (updateRes.error) {
        throw new Error(updateRes.error.message || 'Nao foi possivel religar os modelos as credenciais.');
    }
}

function buildUsageSummary(logs = []) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartIso = monthStart.toISOString();

    const monthLogs = logs.filter((log) => String(log.created_at || '') >= monthStartIso);
    const totals = monthLogs.reduce((acc, log) => {
        acc.input_tokens += Number(log.input_tokens) || 0;
        acc.output_tokens += Number(log.output_tokens) || 0;
        acc.total_tokens += Number(log.total_tokens) || 0;
        acc.estimated_cost += Number(log.estimated_cost) || 0;
        return acc;
    }, { input_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost: 0 });

    const byAgent = Object.values(monthLogs.reduce((acc, log) => {
        const key = String(log.agent_slug || 'desconhecido');
        if (!acc[key]) {
            acc[key] = { agent_slug: key, total_tokens: 0, estimated_cost: 0, request_count: 0 };
        }
        acc[key].total_tokens += Number(log.total_tokens) || 0;
        acc[key].estimated_cost += Number(log.estimated_cost) || 0;
        acc[key].request_count += 1;
        return acc;
    }, {})).sort((a, b) => b.estimated_cost - a.estimated_cost);

    const byModel = Object.values(monthLogs.reduce((acc, log) => {
        const key = String(log.model_label || log.model || 'modelo-nao-definido');
        if (!acc[key]) {
            acc[key] = { model_label: key, total_tokens: 0, estimated_cost: 0, request_count: 0 };
        }
        acc[key].total_tokens += Number(log.total_tokens) || 0;
        acc[key].estimated_cost += Number(log.estimated_cost) || 0;
        acc[key].request_count += 1;
        return acc;
    }, {})).sort((a, b) => b.estimated_cost - a.estimated_cost);

    return {
        month: totals,
        by_agent: byAgent,
        by_model: byModel,
        recent_logs: logs.slice(0, 50)
    };
}

async function handleGet(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) return sendJson(res, auth.error.status, { error: auth.error.message });

    try {
        await ensureDefaultAgents(auth);
        await ensureDefaultModelsAndAssignments(auth);
        await ensureProviderLinks(auth);
        const orgId = auth.profile.organization_id;
        const [providerConfigsRes, modelsRes, agentsRes, usageLogsRes] = await Promise.all([
            auth.serviceClient.from('ai_provider_configs').select('*').eq('organization_id', orgId).order('id', { ascending: true }),
            auth.serviceClient.from('ai_models').select('*').eq('organization_id', orgId).order('id', { ascending: true }),
            auth.serviceClient.from('ai_agents').select('*').eq('organization_id', orgId).order('priority', { ascending: true }),
            auth.serviceClient.from('ai_usage_logs').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(200)
        ]);

        if (providerConfigsRes.error) throw new Error(providerConfigsRes.error.message || 'Nao foi possivel carregar os provedores de IA.');
        if (modelsRes.error) throw new Error(modelsRes.error.message || 'Nao foi possivel carregar o banco de IAs.');
        if (agentsRes.error) throw new Error(agentsRes.error.message || 'Nao foi possivel carregar os agentes.');
        if (usageLogsRes.error) throw new Error(usageLogsRes.error.message || 'Nao foi possivel carregar os logs de uso.');

        sendJson(res, 200, {
            data: {
                provider_configs: providerConfigsRes.data || [],
                ai_models: modelsRes.data || [],
                ai_agents: agentsRes.data || [],
                usage_summary: buildUsageSummary(usageLogsRes.data || [])
            }
        });
    } catch (error) {
        sendJson(res, 500, { error: error.message || 'Nao foi possivel carregar o Controle da IA.' });
    }
}

async function handlePost(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) return sendJson(res, auth.error.status, { error: auth.error.message });

    let body;
    try {
        body = await parseBody(req);
    } catch {
        return sendJson(res, 400, { error: 'Payload invalido.' });
    }

    const action = String(body.action || '').trim();
    const orgId = auth.profile.organization_id;

    try {
        if (action === 'upsert_provider_config') {
            const item = normalizeProviderConfig(body.item);
            if (!item.label || !item.provider || !item.api_key) {
                return sendJson(res, 400, { error: 'Label, provider e api_key sao obrigatorios.' });
            }

            const payload = { organization_id: orgId, ...item };
            let query = auth.serviceClient.from('ai_provider_configs');
            const result = body.item?.id
                ? await query.update(payload).eq('id', body.item.id).eq('organization_id', orgId).select('*').single()
                : await query.insert(payload).select('*').single();

            if (result.error) throw new Error(result.error.message || 'Nao foi possivel salvar o provedor de IA.');
            return sendJson(res, 200, { data: result.data });
        }

        if (action === 'delete_provider_config') {
            const id = body.id;
            if (!id) return sendJson(res, 400, { error: 'ID obrigatorio.' });
            const result = await auth.serviceClient.from('ai_provider_configs').delete().eq('id', id).eq('organization_id', orgId);
            if (result.error) throw new Error(result.error.message || 'Nao foi possivel excluir o provedor de IA.');
            return sendJson(res, 200, { data: { id } });
        }

        if (action === 'upsert_ai_model') {
            const item = normalizeAiModel(body.item);
            if (!item.name || !item.slug || !item.provider || !item.model) {
                return sendJson(res, 400, { error: 'Nome, slug, provider e model sao obrigatorios.' });
            }

            const payload = { organization_id: orgId, ...item };
            let query = auth.serviceClient.from('ai_models');
            const result = body.item?.id
                ? await query.update(payload).eq('id', body.item.id).eq('organization_id', orgId).select('*').single()
                : await query.insert(payload).select('*').single();

            if (result.error) throw new Error(result.error.message || 'Nao foi possivel salvar a IA.');
            return sendJson(res, 200, { data: result.data });
        }

        if (action === 'delete_ai_model') {
            const id = body.id;
            if (!id) return sendJson(res, 400, { error: 'ID obrigatorio.' });
            const result = await auth.serviceClient.from('ai_models').delete().eq('id', id).eq('organization_id', orgId);
            if (result.error) throw new Error(result.error.message || 'Nao foi possivel excluir a IA.');
            return sendJson(res, 200, { data: { id } });
        }

        if (action === 'update_ai_agent') {
            const item = normalizeAgent(body.item);
            if (!item.slug || !item.name) {
                return sendJson(res, 400, { error: 'Slug e nome do agente sao obrigatorios.' });
            }

            const result = await auth.serviceClient
                .from('ai_agents')
                .update({
                    ...item,
                    organization_id: orgId
                })
                .eq('slug', item.slug)
                .eq('organization_id', orgId)
                .select('*')
                .single();

            if (result.error) throw new Error(result.error.message || 'Nao foi possivel atualizar o agente.');
            return sendJson(res, 200, { data: result.data });
        }

        return sendJson(res, 400, { error: 'Acao nao suportada.' });
    } catch (error) {
        return sendJson(res, 500, { error: error.message || 'Falha ao salvar configuracoes de IA.' });
    }
}

module.exports = async function aiControlHandler(req, res, env = process.env) {
    if (req.method === 'GET') {
        await handleGet(req, res, env);
        return;
    }
    if (req.method === 'POST') {
        await handlePost(req, res, env);
        return;
    }
    sendJson(res, 405, { error: 'Metodo nao suportado.' });
};

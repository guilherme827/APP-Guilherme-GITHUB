const { createClient } = require('@supabase/supabase-js');

function getSupabaseClients(env) {
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

function parseJsonBody(req) {
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

async function authenticateAiRequester(req, env) {
    const { anonClient, serviceClient } = getSupabaseClients(env);
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

    return {
        user: authData.user,
        profile,
        serviceClient
    };
}

async function loadAgentBundle(serviceClient, organizationId, agentSlug) {
    const agentRes = await serviceClient
        .from('ai_agents')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('slug', agentSlug)
        .single();

    if (agentRes.error || !agentRes.data) {
        throw new Error('Agente nao encontrado.');
    }

    let model = null;
    let providerConfig = null;
    if (agentRes.data.ai_model_id) {
        const modelRes = await serviceClient
            .from('ai_models')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('id', agentRes.data.ai_model_id)
            .single();
        if (modelRes.error) {
            throw new Error(modelRes.error.message || 'Nao foi possivel carregar a IA do agente.');
        }
        model = modelRes.data || null;

        if (model?.api_config_id) {
            const providerRes = await serviceClient
                .from('ai_provider_configs')
                .select('*')
                .eq('organization_id', organizationId)
                .eq('id', model.api_config_id)
                .single();
            if (providerRes.error) {
                throw new Error(providerRes.error.message || 'Nao foi possivel carregar a credencial do provedor.');
            }
            providerConfig = providerRes.data || null;
        }
    }

    return { agent: agentRes.data, model, providerConfig };
}

async function getMonthUsage(serviceClient, organizationId, agentSlug) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data, error } = await serviceClient
        .from('ai_usage_logs')
        .select('total_tokens, estimated_cost')
        .eq('organization_id', organizationId)
        .eq('agent_slug', agentSlug)
        .gte('created_at', monthStart.toISOString());

    if (error) {
        throw new Error(error.message || 'Nao foi possivel validar o consumo do agente.');
    }

    return (data || []).reduce((acc, item) => {
        acc.total_tokens += Number(item.total_tokens) || 0;
        acc.estimated_cost += Number(item.estimated_cost) || 0;
        return acc;
    }, { total_tokens: 0, estimated_cost: 0 });
}

function assertAgentCanRun(bundle, usage) {
    if (!bundle?.agent?.is_enabled) {
        throw new Error('Este agente esta desativado no Painel Administrativo.');
    }
    if (!bundle?.model) {
        throw new Error('Nenhuma IA foi vinculada a este agente.');
    }
    if (bundle.model.is_active === false) {
        throw new Error('A IA selecionada para este agente esta desativada.');
    }
    if (!bundle.providerConfig?.api_key) {
        throw new Error('A IA selecionada nao possui credencial de API vinculada.');
    }

    const monthlyTokenLimit = Number(bundle.agent.monthly_token_limit) || 0;
    const monthlyCostLimit = Number(bundle.agent.monthly_cost_limit_brl) || 0;
    if (monthlyTokenLimit > 0 && Number(usage.total_tokens) >= monthlyTokenLimit) {
        throw new Error('O limite mensal de tokens deste agente foi atingido.');
    }
    if (monthlyCostLimit > 0 && Number(usage.estimated_cost) >= monthlyCostLimit) {
        throw new Error('O limite mensal de custo deste agente foi atingido.');
    }
}

function normalizeTextResponse(content) {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === 'string') return part;
                if (part?.type === 'text') return String(part.text || '');
                return '';
            })
            .filter(Boolean)
            .join('\n');
    }
    return '';
}

function mapProviderError(error, provider = '') {
    const raw = String(error?.message || '').trim();
    const lower = raw.toLowerCase();
    const providerName = String(provider || '').trim().toLowerCase();

    if (
        lower.includes('quota exceeded') ||
        lower.includes('you exceeded your current quota') ||
        lower.includes('rate limit') ||
        lower.includes('429')
    ) {
        if (providerName === 'gemini') {
            return 'A credencial Gemini configurada no app esta sem cota disponivel no momento. Verifique o billing/quota da chave no Google AI Studio e tente novamente.';
        }
        if (providerName === 'openai') {
            return 'A credencial OpenAI configurada no app esta sem cota disponivel no momento. Verifique o billing e tente novamente.';
        }
        if (providerName === 'anthropic') {
            return 'A credencial Anthropic configurada no app esta sem cota disponivel no momento. Verifique o limite da conta e tente novamente.';
        }
        return 'A credencial de IA configurada no app esta sem cota disponivel no momento. Verifique o billing/quota do provider e tente novamente.';
    }

    if (lower.includes('api key not valid') || lower.includes('invalid api key') || lower.includes('authentication')) {
        return 'A credencial configurada para esta IA parece invalida. Revise a chave na Central de IA.';
    }

    return raw || 'Falha no provedor de IA.';
}

function isRetryableProviderError(error) {
    const raw = String(error?.message || '').trim().toLowerCase();
    if (!raw) return false;
    return (
        raw.includes('quota exceeded') ||
        raw.includes('you exceeded your current quota') ||
        raw.includes('rate limit') ||
        raw.includes('resource has been exhausted') ||
        raw.includes('429') ||
        raw.includes('sem cota disponivel') ||
        raw.includes('sem cota disponível')
    );
}

async function executeOpenAI(bundle, messages) {
    const response = await fetch(`${bundle.providerConfig.base_url || 'https://api.openai.com'}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bundle.providerConfig.api_key}`
        },
        body: JSON.stringify({
            model: bundle.model.model,
            messages,
            temperature: Number(bundle.model.temperature_default) || 0.2,
            max_tokens: Number(bundle.model.max_tokens_default) || 4096
        })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.message || 'Falha no provedor OpenAI.');
    }

    return {
        text: normalizeTextResponse(payload?.choices?.[0]?.message?.content || ''),
        usage: {
            input_tokens: Number(payload?.usage?.prompt_tokens) || 0,
            output_tokens: Number(payload?.usage?.completion_tokens) || 0,
            total_tokens: Number(payload?.usage?.total_tokens) || 0
        },
        raw: payload
    };
}

async function executeAnthropic(bundle, systemPrompt, messages) {
    const anthropicMessages = messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: String(message.content || '')
        }));

    const response = await fetch(`${bundle.providerConfig.base_url || 'https://api.anthropic.com'}/v1/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': bundle.providerConfig.api_key,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: bundle.model.model,
            system: systemPrompt || '',
            messages: anthropicMessages,
            temperature: Number(bundle.model.temperature_default) || 0.2,
            max_tokens: Number(bundle.model.max_tokens_default) || 4096
        })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.message || 'Falha no provedor Anthropic.');
    }

    return {
        text: normalizeTextResponse(payload?.content || ''),
        usage: {
            input_tokens: Number(payload?.usage?.input_tokens) || 0,
            output_tokens: Number(payload?.usage?.output_tokens) || 0,
            total_tokens: (Number(payload?.usage?.input_tokens) || 0) + (Number(payload?.usage?.output_tokens) || 0)
        },
        raw: payload
    };
}

async function executeGemini(bundle, systemPrompt, messages) {
    const contents = messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(message.content || '') }]
        }));

    const url = new URL(`${bundle.providerConfig.base_url || 'https://generativelanguage.googleapis.com'}/v1beta/models/${bundle.model.model}:generateContent`);
    url.searchParams.set('key', bundle.providerConfig.api_key);

    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
            contents,
            generationConfig: {
                temperature: Number(bundle.model.temperature_default) || 0.2,
                maxOutputTokens: Number(bundle.model.max_tokens_default) || 4096
            }
        })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.error?.message || 'Falha no provedor Gemini.');
    }

    const parts = payload?.candidates?.[0]?.content?.parts || [];
    return {
        text: normalizeTextResponse(parts),
        usage: {
            input_tokens: Number(payload?.usageMetadata?.promptTokenCount) || 0,
            output_tokens: Number(payload?.usageMetadata?.candidatesTokenCount) || 0,
            total_tokens: Number(payload?.usageMetadata?.totalTokenCount) || 0
        },
        raw: payload
    };
}

async function executeAgentModel(bundle, { systemPrompt, messages }) {
    const provider = String(bundle?.model?.provider || '').trim().toLowerCase();
    try {
        if (provider === 'openai') {
            return await executeOpenAI(bundle, messages);
        }
        if (provider === 'anthropic') {
            return await executeAnthropic(bundle, systemPrompt, messages);
        }
        if (provider === 'gemini') {
            return await executeGemini(bundle, systemPrompt, messages);
        }
    } catch (error) {
        throw new Error(mapProviderError(error, provider));
    }
    throw new Error(`Provider nao suportado nesta fase: ${provider || 'desconhecido'}.`);
}

function rankFallbackCandidates(models = [], currentBundle = null) {
    const currentProvider = String(currentBundle?.model?.provider || '').trim().toLowerCase();
    const currentModelId = Number(currentBundle?.model?.id) || 0;
    const currentApiConfigId = Number(currentBundle?.providerConfig?.id) || 0;

    return [...models].sort((a, b) => {
        const aSameProvider = String(a?.provider || '').trim().toLowerCase() === currentProvider ? 1 : 0;
        const bSameProvider = String(b?.provider || '').trim().toLowerCase() === currentProvider ? 1 : 0;
        if (aSameProvider !== bSameProvider) return bSameProvider - aSameProvider;

        const aDifferentCredential = Number(a?.api_config_id) !== currentApiConfigId ? 1 : 0;
        const bDifferentCredential = Number(b?.api_config_id) !== currentApiConfigId ? 1 : 0;
        if (aDifferentCredential !== bDifferentCredential) return bDifferentCredential - aDifferentCredential;

        const aDifferentModel = Number(a?.id) !== currentModelId ? 1 : 0;
        const bDifferentModel = Number(b?.id) !== currentModelId ? 1 : 0;
        if (aDifferentModel !== bDifferentModel) return bDifferentModel - aDifferentModel;

        return Number(a?.id || 0) - Number(b?.id || 0);
    });
}

async function loadFallbackAgentBundles(serviceClient, organizationId, agentSlug, currentBundle) {
    const [modelsRes, providersRes] = await Promise.all([
        serviceClient
            .from('ai_models')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('is_active', true)
            .eq('supports_chat', true),
        serviceClient
            .from('ai_provider_configs')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('is_enabled', true)
    ]);

    if (modelsRes.error) {
        throw new Error(modelsRes.error.message || 'Nao foi possivel carregar modelos alternativos de IA.');
    }
    if (providersRes.error) {
        throw new Error(providersRes.error.message || 'Nao foi possivel carregar credenciais alternativas de IA.');
    }

    const enabledProvidersById = new Map(
        (providersRes.data || [])
            .filter((item) => String(item?.api_key || '').trim())
            .map((item) => [Number(item.id), item])
    );

    const rankedModels = rankFallbackCandidates(
        (modelsRes.data || []).filter((model) => {
            if (Number(model?.id) === Number(currentBundle?.model?.id)) return false;
            if (!enabledProvidersById.has(Number(model?.api_config_id))) return false;
            return true;
        }),
        currentBundle
    );

    return rankedModels.map((model) => ({
        agent: {
            ...currentBundle.agent,
            slug: agentSlug
        },
        model,
        providerConfig: enabledProvidersById.get(Number(model.api_config_id)) || null
    }));
}

async function executeAgentModelWithFallback(serviceClient, organizationId, agentSlug, bundle, options) {
    try {
        const execution = await executeAgentModel(bundle, options);
        return { execution, bundle, fallbackApplied: false };
    } catch (error) {
        if (!isRetryableProviderError(error)) {
            throw error;
        }

        const fallbackBundles = await loadFallbackAgentBundles(serviceClient, organizationId, agentSlug, bundle);
        const fallbackErrors = [String(error?.message || '').trim()].filter(Boolean);

        for (const fallbackBundle of fallbackBundles) {
            try {
                const execution = await executeAgentModel(fallbackBundle, options);
                return {
                    execution,
                    bundle: fallbackBundle,
                    fallbackApplied: true,
                    fallbackMeta: {
                        original_model_name: bundle?.model?.name || bundle?.model?.model || '',
                        fallback_model_name: fallbackBundle?.model?.name || fallbackBundle?.model?.model || '',
                        original_provider: bundle?.model?.provider || '',
                        fallback_provider: fallbackBundle?.model?.provider || ''
                    }
                };
            } catch (fallbackError) {
                fallbackErrors.push(String(fallbackError?.message || '').trim());
                if (!isRetryableProviderError(fallbackError)) {
                    throw fallbackError;
                }
            }
        }

        throw new Error(fallbackErrors.filter(Boolean).join(' | ') || String(error?.message || 'Falha no provedor de IA.'));
    }
}

function estimateCost(bundle, usage) {
    const inputPrice = Number(bundle?.model?.cost_input_per_million) || 0;
    const outputPrice = Number(bundle?.model?.cost_output_per_million) || 0;
    const inputTokens = Number(usage?.input_tokens) || 0;
    const outputTokens = Number(usage?.output_tokens) || 0;
    return ((inputTokens / 1000000) * inputPrice) + ((outputTokens / 1000000) * outputPrice);
}

async function logUsage(serviceClient, organizationId, userId, bundle, feature, usage, status, requestMeta = {}) {
    await serviceClient
        .from('ai_usage_logs')
        .insert({
            organization_id: organizationId,
            user_id: userId || null,
            agent_slug: bundle.agent.slug,
            ai_model_id: bundle.model?.id || null,
            provider: bundle.model?.provider || '',
            model: bundle.model?.model || '',
            model_label: bundle.model?.name || bundle.model?.model || '',
            feature,
            input_tokens: Number(usage?.input_tokens) || 0,
            output_tokens: Number(usage?.output_tokens) || 0,
            total_tokens: Number(usage?.total_tokens) || 0,
            estimated_cost: estimateCost(bundle, usage),
            currency: String(bundle?.model?.currency || 'BRL').trim().toUpperCase(),
            request_status: status,
            request_meta: requestMeta
        });
}

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function tokenizePrompt(prompt) {
    return [...new Set(
        normalizeSearchText(prompt)
            .split(/[^a-z0-9]+/i)
            .map((token) => token.trim())
            .filter((token) => token.length >= 3)
    )];
}

function scoreRecord(tokens, fields = []) {
    const haystack = normalizeSearchText(fields.filter(Boolean).join(' '));
    if (!haystack) return 0;
    return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

async function loadOrganizationContext(serviceClient, organizationId, prompt) {
    const tokens = tokenizePrompt(prompt);
    if (tokens.length === 0) {
        return { matchedClients: [], matchedProcesses: [] };
    }

    const [trashRes, clientsRes, processesRes] = await Promise.all([
        serviceClient.from('trash').select('item_id,item_type').eq('organization_id', organizationId),
        serviceClient.from('clients').select('*').eq('organization_id', organizationId).limit(200),
        serviceClient.from('processes').select('*').eq('organization_id', organizationId).limit(300)
    ]);

    const trashed = new Set((trashRes.data || []).map((item) => `${item.item_type}:${item.item_id}`));
    const clients = (clientsRes.data || [])
        .filter((item) => !trashed.has(`titular:${item.id}`))
        .map((item) => ({
            ...item,
            score: scoreRecord(tokens, [item.nome, item.nome_fantasia, item.nome_empresarial, item.cpf, item.cnpj, item.email, item.cidade])
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    const processes = (processesRes.data || [])
        .filter((item) => !trashed.has(`processo:${item.id}`))
        .map((item) => ({
            ...item,
            score: scoreRecord(tokens, [item.numero_processo, item.numero_titulo, item.tipo, item.tipologia, item.municipio, item.project_name, item.orgao_sigla, item.orgao_nome_completo])
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

    return {
        matchedClients: clients,
        matchedProcesses: processes
    };
}

async function loadKnowledgeMatches(serviceClient, organizationId, prompt, scopes = []) {
    const tokens = tokenizePrompt(prompt);
    if (tokens.length === 0) {
        return [];
    }

    const query = serviceClient
        .from('ai_knowledge_chunks')
        .select('*')
        .eq('organization_id', organizationId)
        .limit(300);

    if (Array.isArray(scopes) && scopes.length > 0) {
        query.in('source_scope', scopes);
    }

    const { data, error } = await query;
    if (error) {
        return [];
    }

    return (data || [])
        .map((item) => ({
            ...item,
            score: scoreRecord(tokens, [item.title, item.search_text, item.content])
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
}

function summarizeKnowledgeMatches(matches = []) {
    return matches.map((item, index) => {
        return `Chunk ${index + 1} | ${item.title}\n${item.content}`;
    }).join('\n\n');
}

function summarizeOrganizationContext(context) {
    const clientLines = (context.matchedClients || []).map((client) => {
        const displayName = client.type === 'PF'
            ? (client.nome || 'Titular')
            : (client.nome_fantasia || client.nome_empresarial || 'Empresa');
        return `- Titular ${displayName} (id: ${client.id}${client.cpf ? `, cpf: ${client.cpf}` : ''}${client.cnpj ? `, cnpj: ${client.cnpj}` : ''}${client.cidade ? `, cidade: ${client.cidade}` : ''})`;
    });

    const processLines = (context.matchedProcesses || []).map((process) => {
        return `- Processo ${process.numero_processo || `#${process.id}`} (titular_id: ${process.client_id || '-'}, tipo: ${process.tipo || '-'}, tipologia: ${process.tipologia || '-'}, projeto: ${process.project_name || 'sem projeto'}, orgao: ${process.orgao_sigla || process.orgao_nome_completo || '-'})`;
    });

    return [
        clientLines.length > 0 ? `Titulares relacionados ao pedido:\n${clientLines.join('\n')}` : '',
        processLines.length > 0 ? `Processos relacionados ao pedido:\n${processLines.join('\n')}` : ''
    ].filter(Boolean).join('\n\n');
}

function summarizeProcessKnowledge(context) {
    const processBlocks = (context.matchedProcesses || []).slice(0, 3).map((process) => {
        const deadlines = Array.isArray(process.deadlines) ? process.deadlines : [];
        const events = Array.isArray(process.events) ? process.events : [];
        const rootDoc = process.doc_name ? [`- Documento principal: ${process.doc_name}`] : [];
        const deadlineLines = deadlines.slice(0, 8).map((item) => {
            return `- Prazo: ${item.desc || item.reference || 'sem descricao'} | data=${item.date || 'sem data'} | status=${item.status || 'pending'}`;
        });
        const eventLines = events.slice(0, 10).map((event) => {
            const docs = (Array.isArray(event.documents) ? event.documents : [])
                .map((doc) => doc?.name)
                .filter(Boolean);
            return `- Evento: ${event.description || 'sem descricao'} | tipo=${event.type || 'movimentacao'} | data=${event.date || 'sem data'}${docs.length ? ` | docs=${docs.join(', ')}` : ''}`;
        });

        return [
            `Processo aprofundado ${process.numero_processo || `#${process.id}`}:`,
            `- tipo=${process.tipo || '-'} | tipologia=${process.tipologia || '-'} | fase=${process.fase || '-'} | projeto=${process.project_name || 'sem projeto'} | municipio=${process.municipio || '-'} | orgao=${process.orgao_sigla || process.orgao_nome_completo || '-'}`,
            `- titulo=${process.numero_titulo || '-'} | protocolo=${process.data_protocolo || '-'} | validade=${process.data_validade || '-'} | outorga=${process.data_outorga || '-'}`,
            rootDoc.join('\n'),
            deadlineLines.length ? `Prazos:\n${deadlineLines.join('\n')}` : '',
            eventLines.length ? `Extrato / eventos:\n${eventLines.join('\n')}` : ''
        ].filter(Boolean).join('\n');
    });

    const clientBlocks = (context.matchedClients || []).slice(0, 3).map((client) => {
        const docs = Array.isArray(client.documents) ? client.documents : [];
        const displayName = client.type === 'PF'
            ? (client.nome || 'Titular')
            : (client.nome_fantasia || client.nome_empresarial || 'Empresa');
        return [
            `Titular aprofundado ${displayName}:`,
            `- documento=${client.cpf || client.cnpj || '-'} | email=${client.email || '-'} | telefone=${client.telefone || '-'} | cidade=${client.cidade || '-'} | uf=${client.uf || '-'}`,
            docs.length ? `- documentos cadastro: ${docs.map((doc) => doc?.name || doc).filter(Boolean).join(', ')}` : ''
        ].filter(Boolean).join('\n');
    });

    return [...clientBlocks, ...processBlocks].filter(Boolean).join('\n\n');
}

module.exports = {
    parseJsonBody,
    authenticateAiRequester,
    loadAgentBundle,
    getMonthUsage,
    assertAgentCanRun,
    executeAgentModel,
    executeAgentModelWithFallback,
    logUsage,
    isRetryableProviderError,
    mapProviderError,
    loadOrganizationContext,
    summarizeOrganizationContext,
    summarizeProcessKnowledge,
    loadKnowledgeMatches,
    summarizeKnowledgeMatches,
    rankFallbackCandidates
};

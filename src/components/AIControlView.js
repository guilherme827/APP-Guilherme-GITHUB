import { escapeHtml } from '../utils/sanitize.js';
import { aiControlService } from '../utils/AIControlService.js';

function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
}

function formatCurrency(value, currency = 'BRL') {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: currency || 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
    }).format(Number(value || 0));
}

function slugify(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function maskSecret(value) {
    const text = String(value || '').trim();
    if (!text) return 'Nao configurada';
    if (text.length <= 8) return 'Configurada';
    return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function getModelUsageMap(usageSummary = {}) {
    const byModel = Array.isArray(usageSummary?.by_model) ? usageSummary.by_model : [];
    const map = new Map();
    byModel.forEach((entry) => {
        const keys = [
            String(entry?.model_label || ''),
            String(entry?.model || ''),
            String(entry?.provider || '')
        ].filter(Boolean);
        keys.forEach((key) => {
            if (!map.has(key)) map.set(key, entry);
        });
    });
    return map;
}

function getQuotaIssueMap(usageSummary = {}) {
    const recentLogs = Array.isArray(usageSummary?.recent_logs) ? usageSummary.recent_logs : [];
    const map = new Map();

    recentLogs.forEach((log) => {
        if (String(log?.request_status || '').toLowerCase() !== 'error') return;
        const errorMessage = String(log?.request_meta?.error_message || '').trim();
        const lower = errorMessage.toLowerCase();
        const isQuotaIssue = lower.includes('quota') || lower.includes('rate limit') || lower.includes('sem cota');
        if (!isQuotaIssue) return;

        const keys = [
            String(log?.model_label || ''),
            String(log?.model || '')
        ].filter(Boolean);

        keys.forEach((key) => {
            if (!map.has(key)) {
                map.set(key, errorMessage);
            }
        });
    });

    return map;
}

function resolveModelStatus(model, providerConfigs, quotaIssueMap = new Map()) {
    const providerConfig = providerConfigs.find((item) => Number(item.id) === Number(model.api_config_id));
    const quotaMessage = quotaIssueMap.get(String(model?.name || '')) || quotaIssueMap.get(String(model?.model || ''));

    if (quotaMessage) {
        return { label: 'Sem cota', tone: 'warning', detail: quotaMessage };
    }

    if (!providerConfig) {
        return { label: 'Sem credencial', tone: 'warning', detail: '' };
    }

    if (!providerConfig.is_enabled || !String(providerConfig.api_key || '').trim()) {
        return { label: 'Credencial inativa', tone: 'warning', detail: '' };
    }

    return { label: 'Pronta', tone: 'success', detail: '' };
}

function resolveAgentStatus(agent, models, providerConfigs, quotaIssueMap = new Map()) {
    if (!agent?.is_enabled) {
        return { label: 'Desativado', tone: 'muted' };
    }

    const model = models.find((item) => Number(item.id) === Number(agent.ai_model_id));
    if (!model) {
        return { label: 'Sem IA', tone: 'warning' };
    }

    return resolveModelStatus(model, providerConfigs, quotaIssueMap);
}

function statusStyles(tone) {
    if (tone === 'success') {
        return 'background: rgba(34,197,94,0.14); color: #65d38a; border: 1px solid rgba(34,197,94,0.28);';
    }
    if (tone === 'warning') {
        return 'background: rgba(245,158,11,0.14); color: #f3c56b; border: 1px solid rgba(245,158,11,0.28);';
    }
    return 'background: rgba(148,163,184,0.14); color: #94a3b8; border: 1px solid rgba(148,163,184,0.24);';
}

function aiPanelSurfaceStyle(level = 'base') {
    if (level === 'raised') {
        return 'background: color-mix(in srgb, var(--card-bg) 92%, var(--bg-main) 8%); border:1px solid var(--input-border); box-shadow: var(--shadow-sm);';
    }
    if (level === 'soft') {
        return 'background: color-mix(in srgb, var(--input-bg) 72%, transparent); border:1px solid var(--input-border);';
    }
    return 'background: color-mix(in srgb, var(--card-bg) 96%, var(--bg-main) 4%); border:1px solid var(--input-border);';
}

function aiPanelInputStyle(height = 44) {
    return `height:${height}px; border-radius:14px; border:1px solid var(--input-border); background:var(--input-bg); color:var(--slate-900); padding:0 0.9rem;`;
}

function aiPanelMutedButtonStyle() {
    return 'background: color-mix(in srgb, var(--input-bg) 82%, transparent); color: var(--slate-700); border:1px solid var(--input-border);';
}

function aiPanelPrimaryButtonStyle() {
    return 'background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary); border:1px solid color-mix(in srgb, var(--primary) 26%, transparent);';
}

async function showError(title, message) {
    try {
        const { showNoticeModal } = await import('./NoticeModal.js');
        showNoticeModal(title, message);
    } catch {
        window.alert(`${title}\n\n${message}`);
    }
}

export function renderAIControlView(container) {
    const state = {
        loading: true,
        saving: false,
        error: '',
        data: null,
        credentialsOpen: false,
        modelEditorOpen: false,
        editingModelId: null
    };

    const getProviderConfigs = () => Array.isArray(state.data?.provider_configs) ? state.data.provider_configs : [];
    const getModels = () => Array.isArray(state.data?.ai_models) ? state.data.ai_models : [];
    const getAgents = () => Array.isArray(state.data?.ai_agents) ? state.data.ai_agents : [];
    const getUsageSummary = () => state.data?.usage_summary || {};

    const getModelDraft = () => {
        const current = getModels().find((item) => Number(item.id) === Number(state.editingModelId));
        if (current) {
            return {
                id: current.id,
                name: current.name || '',
                slug: current.slug || '',
                provider: current.provider || 'gemini',
                model: current.model || '',
                api_config_id: current.api_config_id || '',
                is_active: current.is_active !== false,
                supports_chat: current.supports_chat !== false,
                supports_rag: current.supports_rag === true,
                supports_tools: current.supports_tools === true,
                temperature_default: current.temperature_default ?? 0.2,
                max_tokens_default: current.max_tokens_default ?? 4096,
                cost_input_per_million: current.cost_input_per_million ?? 0,
                cost_output_per_million: current.cost_output_per_million ?? 0,
                currency: current.currency || 'BRL',
                notes: current.notes || ''
            };
        }

        return {
            name: '',
            slug: '',
            provider: 'gemini',
            model: '',
            api_config_id: '',
            is_active: true,
            supports_chat: true,
            supports_rag: true,
            supports_tools: false,
            temperature_default: 0.2,
            max_tokens_default: 4096,
            cost_input_per_million: 0,
            cost_output_per_million: 0,
            currency: 'BRL',
            notes: ''
        };
    };

    const load = async () => {
        state.loading = true;
        state.error = '';
        render();
        try {
            state.data = await aiControlService.load();
        } catch (error) {
            state.error = error?.message || 'Nao foi possivel carregar o Controle da IA.';
        } finally {
            state.loading = false;
            render();
        }
    };

    const renderAgentsSection = () => {
        const agents = getAgents();
        const models = getModels();
        const providerConfigs = getProviderConfigs();
        const quotaIssueMap = getQuotaIssueMap(getUsageSummary());

        return `
            <section class="client-detail-card" style="padding: 1.5rem;">
                <div style="display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; margin-bottom:1rem;">
                    <div>
                        <p class="label-tech">AGENTES</p>
                        <h3 class="client-detail-title" style="font-size:1.05rem;">Quem usa qual IA</h3>
                        <p class="client-detail-subtitle" style="max-width:680px;">Aqui fica so o essencial: nome do agente e a IA que ele vai usar.</p>
                    </div>
                </div>
                <div style="display:grid; gap:0.85rem;">
                    ${agents.map((agent) => {
                        const agentStatus = resolveAgentStatus(agent, models, providerConfigs, quotaIssueMap);
                        return `
                            <form data-agent-form="${agent.id}" style="display:grid; grid-template-columns:minmax(180px, 1.2fr) minmax(220px, 1.6fr) auto auto; gap:0.75rem; align-items:center; padding:1rem; border-radius:18px; ${aiPanelSurfaceStyle('soft')}">
                                <div style="min-width:0;">
                                    <div style="display:flex; align-items:center; gap:0.55rem; flex-wrap:wrap;">
                                        <strong style="font-size:0.98rem; color:var(--slate-900);">${escapeHtml(agent.name || agent.slug || 'Agente')}</strong>
                                        <span style="padding:0.18rem 0.55rem; border-radius:999px; font-size:0.72rem; font-weight:700; ${statusStyles(agentStatus.tone)}">${escapeHtml(agentStatus.label)}</span>
                                    </div>
                                    <p style="margin:0.35rem 0 0; font-size:0.82rem; color:var(--slate-400);">${escapeHtml(agent.description || 'Sem descricao.')}</p>
                                    ${agentStatus.detail ? `<p style="margin:0.25rem 0 0; font-size:0.76rem; color:#f3c56b;">${escapeHtml(agentStatus.detail)}</p>` : ''}
                                </div>
                                <label style="display:flex; flex-direction:column; gap:0.35rem;">
                                    <span style="font-size:0.72rem; letter-spacing:0.08em; color:var(--slate-400);">IA vinculada</span>
                                    <select name="ai_model_id" style="${aiPanelInputStyle(44)}">
                                        <option value="">Selecionar IA</option>
                                        ${models.map((model) => `<option value="${model.id}" ${Number(model.id) === Number(agent.ai_model_id) ? 'selected' : ''}>${escapeHtml(model.name)}${model.is_active === false ? ' (inativa)' : ''}</option>`).join('')}
                                    </select>
                                </label>
                                <label style="display:flex; align-items:center; gap:0.5rem; white-space:nowrap; color:var(--slate-700); font-size:0.88rem;">
                                    <input type="checkbox" name="is_enabled" ${agent.is_enabled ? 'checked' : ''}>
                                    Ativo
                                </label>
                                <button type="submit" class="btn-pill btn-action-trigger" style="min-width:104px;">Salvar</button>
                            </form>
                        `;
                    }).join('')}
                </div>
            </section>
        `;
    };

    const renderCredentialsSection = () => {
        const configs = getProviderConfigs();

        return `
            <div style="margin-top:1rem; padding:1rem; border-radius:18px; ${aiPanelSurfaceStyle('soft')}">
                <div style="display:flex; justify-content:space-between; gap:1rem; align-items:center; margin-bottom:${state.credentialsOpen ? '0.85rem' : '0'};">
                    <div>
                        <strong style="color:var(--slate-900); font-size:0.92rem;">Credenciais</strong>
                        <p style="margin:0.25rem 0 0; color:var(--slate-400); font-size:0.8rem;">Area compacta so para conectar as APIs.</p>
                    </div>
                    <button type="button" data-toggle-credentials class="btn-pill" style="${aiPanelPrimaryButtonStyle()}">
                        ${state.credentialsOpen ? 'Ocultar' : 'Mostrar'}
                    </button>
                </div>
                ${state.credentialsOpen ? `
                    <div style="display:grid; gap:0.75rem;">
                        ${configs.map((config) => `
                            <form data-provider-form="${config.id}" style="display:grid; grid-template-columns:minmax(140px, 0.8fr) minmax(180px, 1fr) minmax(220px, 1.5fr) auto auto; gap:0.65rem; align-items:center;">
                                <input name="label" value="${escapeHtml(config.label || '')}" placeholder="Nome" style="${aiPanelInputStyle(42)} padding:0 0.8rem;">
                                <select name="provider" style="${aiPanelInputStyle(42)} padding:0 0.8rem;">
                                    <option value="gemini" ${config.provider === 'gemini' ? 'selected' : ''}>Gemini</option>
                                    <option value="openai" ${config.provider === 'openai' ? 'selected' : ''}>OpenAI</option>
                                    <option value="anthropic" ${config.provider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
                                </select>
                                <input name="api_key" value="${escapeHtml(config.api_key || '')}" placeholder="API key" style="${aiPanelInputStyle(42)} padding:0 0.8rem;">
                                <label style="display:flex; align-items:center; gap:0.45rem; color:var(--slate-700); font-size:0.82rem;">
                                    <input type="checkbox" name="is_enabled" ${config.is_enabled ? 'checked' : ''}>
                                    Ativa
                                </label>
                                <div style="display:flex; gap:0.45rem;">
                                    <button type="submit" class="btn-pill btn-action-trigger">Salvar</button>
                                    <button type="button" data-delete-provider="${config.id}" class="btn-pill" style="background:rgba(239,68,68,0.12); color:#b91c1c; border:1px solid rgba(239,68,68,0.24);">Excluir</button>
                                </div>
                            </form>
                        `).join('')}
                        <form data-provider-form="new" style="display:grid; grid-template-columns:minmax(140px, 0.8fr) minmax(180px, 1fr) minmax(220px, 1.5fr) auto auto; gap:0.65rem; align-items:center;">
                            <input name="label" placeholder="Nova credencial" style="${aiPanelInputStyle(42)} padding:0 0.8rem;">
                            <select name="provider" style="${aiPanelInputStyle(42)} padding:0 0.8rem;">
                                <option value="gemini">Gemini</option>
                                <option value="openai">OpenAI</option>
                                <option value="anthropic">Anthropic</option>
                            </select>
                            <input name="api_key" placeholder="API key" style="${aiPanelInputStyle(42)} padding:0 0.8rem;">
                            <label style="display:flex; align-items:center; gap:0.45rem; color:var(--slate-700); font-size:0.82rem;">
                                <input type="checkbox" name="is_enabled" checked>
                                Ativa
                            </label>
                            <button type="submit" class="btn-pill btn-action-trigger">Adicionar</button>
                        </form>
                    </div>
                ` : ''}
            </div>
        `;
    };

    const renderModelEditor = () => {
        if (!state.modelEditorOpen) return '';

        const draft = getModelDraft();
        const providerConfigs = getProviderConfigs();

        return `
            <div style="margin-top:1rem; padding:1rem; border-radius:20px; ${aiPanelSurfaceStyle('raised')}">
                <div style="display:flex; justify-content:space-between; gap:1rem; align-items:center; margin-bottom:1rem;">
                    <div>
                        <strong style="color:var(--slate-900); font-size:0.95rem;">${state.editingModelId ? 'Editar IA' : 'Adicionar IA'}</strong>
                        <p style="margin:0.25rem 0 0; color:var(--slate-400); font-size:0.8rem;">So os campos principais para cadastrar e vincular rapidamente.</p>
                    </div>
                    <button type="button" data-cancel-model class="btn-pill" style="${aiPanelMutedButtonStyle()}">Cancelar</button>
                </div>
                <form data-model-form style="display:grid; grid-template-columns:repeat(2, minmax(220px, 1fr)); gap:0.8rem;">
                    <label style="display:flex; flex-direction:column; gap:0.35rem;">
                        <span style="font-size:0.72rem; color:var(--slate-400); letter-spacing:0.08em;">Nome</span>
                        <input name="name" value="${escapeHtml(draft.name)}" required style="${aiPanelInputStyle(44)}">
                    </label>
                    <label style="display:flex; flex-direction:column; gap:0.35rem;">
                        <span style="font-size:0.72rem; color:var(--slate-400); letter-spacing:0.08em;">Slug</span>
                        <input name="slug" value="${escapeHtml(draft.slug)}" placeholder="gerado automaticamente" style="${aiPanelInputStyle(44)}">
                    </label>
                    <label style="display:flex; flex-direction:column; gap:0.35rem;">
                        <span style="font-size:0.72rem; color:var(--slate-400); letter-spacing:0.08em;">Provider</span>
                        <select name="provider" style="${aiPanelInputStyle(44)}">
                            <option value="gemini" ${draft.provider === 'gemini' ? 'selected' : ''}>Gemini</option>
                            <option value="openai" ${draft.provider === 'openai' ? 'selected' : ''}>OpenAI</option>
                            <option value="anthropic" ${draft.provider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
                        </select>
                    </label>
                    <label style="display:flex; flex-direction:column; gap:0.35rem;">
                        <span style="font-size:0.72rem; color:var(--slate-400); letter-spacing:0.08em;">Modelo</span>
                        <input name="model" value="${escapeHtml(draft.model)}" required style="${aiPanelInputStyle(44)}">
                    </label>
                    <label style="display:flex; flex-direction:column; gap:0.35rem;">
                        <span style="font-size:0.72rem; color:var(--slate-400); letter-spacing:0.08em;">Credencial</span>
                        <select name="api_config_id" style="${aiPanelInputStyle(44)}">
                            <option value="">Selecionar credencial</option>
                            ${providerConfigs.map((config) => `<option value="${config.id}" ${Number(config.id) === Number(draft.api_config_id) ? 'selected' : ''}>${escapeHtml(config.label || config.provider)} • ${escapeHtml(config.provider)}</option>`).join('')}
                        </select>
                    </label>
                    <label style="display:flex; align-items:center; gap:0.55rem; padding-top:1.65rem; color:var(--slate-700);">
                        <input type="checkbox" name="is_active" ${draft.is_active ? 'checked' : ''}>
                        IA ativa
                    </label>
                    <div style="grid-column:1 / -1; display:flex; justify-content:flex-end;">
                        <button type="submit" class="btn-pill btn-action-trigger">${state.editingModelId ? 'Salvar IA' : 'Adicionar IA'}</button>
                    </div>
                </form>
            </div>
        `;
    };

    const renderModelsSection = () => {
        const models = getModels();
        const usageMap = getModelUsageMap(getUsageSummary());
        const providerConfigs = getProviderConfigs();
        const quotaIssueMap = getQuotaIssueMap(getUsageSummary());

        return `
            <section class="client-detail-card" style="padding: 1.5rem;">
                <div style="display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; margin-bottom:1rem;">
                    <div>
                        <p class="label-tech">IAS CADASTRADAS</p>
                        <h3 class="client-detail-title" style="font-size:1.05rem;">Banco de IAs</h3>
                        <p class="client-detail-subtitle">Lista unica das IAs do sistema. Uso e custo ficam concentrados aqui.</p>
                    </div>
                    <button type="button" data-open-model-editor class="btn-pill btn-action-trigger">Adicionar IA</button>
                </div>
                <div style="display:grid; gap:0.8rem;">
                    ${models.map((model) => {
                        const usage = usageMap.get(String(model.name || '')) || usageMap.get(String(model.model || '')) || {};
                        const readiness = resolveModelStatus(model, providerConfigs, quotaIssueMap);
                        const providerConfig = providerConfigs.find((item) => Number(item.id) === Number(model.api_config_id));
                        return `
                            <div style="display:grid; grid-template-columns:minmax(240px, 1.2fr) repeat(3, minmax(120px, 0.7fr)) auto; gap:0.8rem; align-items:center; padding:1rem; border-radius:18px; ${aiPanelSurfaceStyle('soft')}">
                                <div style="min-width:0;">
                                    <div style="display:flex; align-items:center; gap:0.55rem; flex-wrap:wrap;">
                                        <strong style="font-size:0.96rem; color:var(--slate-900);">${escapeHtml(model.name)}</strong>
                                        <span style="padding:0.18rem 0.55rem; border-radius:999px; font-size:0.72rem; font-weight:700; ${statusStyles(model.is_active ? 'success' : 'muted')}">${model.is_active ? 'Ativa' : 'Inativa'}</span>
                                        <span style="padding:0.18rem 0.55rem; border-radius:999px; font-size:0.72rem; font-weight:700; ${statusStyles(readiness.tone)}">${escapeHtml(readiness.label)}</span>
                                    </div>
                                    <p style="margin:0.35rem 0 0; font-size:0.82rem; color:var(--slate-400);">${escapeHtml(model.provider)} • ${escapeHtml(model.model)}</p>
                                    <p style="margin:0.2rem 0 0; font-size:0.78rem; color:var(--slate-500);">Credencial: ${escapeHtml(providerConfig?.label || maskSecret(providerConfig?.api_key || ''))}</p>
                                    ${readiness.detail ? `<p style="margin:0.22rem 0 0; font-size:0.76rem; color:#f3c56b;">${escapeHtml(readiness.detail)}</p>` : ''}
                                </div>
                                <div>
                                    <p style="margin:0; font-size:0.72rem; color:var(--slate-400); letter-spacing:0.08em;">TOKENS</p>
                                    <strong style="color:var(--slate-900); font-size:0.96rem;">${formatNumber(usage?.total_tokens)}</strong>
                                </div>
                                <div>
                                    <p style="margin:0; font-size:0.72rem; color:var(--slate-400); letter-spacing:0.08em;">CUSTO</p>
                                    <strong style="color:var(--slate-900); font-size:0.96rem;">${formatCurrency(usage?.estimated_cost, usage?.currency || model.currency || 'BRL')}</strong>
                                </div>
                                <div>
                                    <p style="margin:0; font-size:0.72rem; color:var(--slate-400); letter-spacing:0.08em;">REQUISICOES</p>
                                    <strong style="color:var(--slate-900); font-size:0.96rem;">${formatNumber(usage?.request_count)}</strong>
                                </div>
                                <div style="display:flex; gap:0.45rem; justify-content:flex-end;">
                                    <button type="button" data-toggle-model-active="${model.id}" class="btn-pill" style="${model.is_active ? 'background:rgba(34,197,94,0.12); color:#15803d; border:1px solid rgba(34,197,94,0.24);' : aiPanelMutedButtonStyle()}">
                                        ${model.is_active ? 'Desativar' : 'Ativar'}
                                    </button>
                                    <button type="button" data-edit-model="${model.id}" class="btn-pill" style="${aiPanelPrimaryButtonStyle()}">Editar</button>
                                    <button type="button" data-delete-model="${model.id}" class="btn-pill" style="background:rgba(239,68,68,0.12); color:#b91c1c; border:1px solid rgba(239,68,68,0.24);">Excluir</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${renderModelEditor()}
                ${renderCredentialsSection()}
            </section>
        `;
    };

    const render = () => {
        if (state.loading) {
            container.innerHTML = `
                <div class="client-detail-shell">
                    <div class="client-detail-card" style="padding:2rem;">
                        <p class="label-tech">CONTROLE DA IA</p>
                        <h2 class="client-detail-title">Carregando configuracoes...</h2>
                    </div>
                </div>
            `;
            return;
        }

        if (state.error) {
            container.innerHTML = `
                <div class="client-detail-shell">
                    <div class="client-detail-card" style="padding:2rem;">
                        <p class="label-tech">CONTROLE DA IA</p>
                        <h2 class="client-detail-title">Nao foi possivel carregar</h2>
                        <p class="client-detail-subtitle">${escapeHtml(state.error)}</p>
                        <button type="button" data-reload-ai-control class="btn-pill btn-action-trigger" style="margin-top:1rem;">Tentar novamente</button>
                    </div>
                </div>
            `;
            bindEvents();
            return;
        }

        container.innerHTML = `
            <div class="client-detail-shell" style="display:grid; gap:1rem;">
                <div class="client-detail-card" style="padding:1.5rem;">
                    <p class="label-tech">CONTROLE DA IA</p>
                    <h2 class="client-detail-title">Painel simplificado</h2>
                    <p class="client-detail-subtitle">Um painel mais pratico: agentes de um lado, banco de IAs do outro. O detalhamento de uso fica concentrado na propria lista de IAs.</p>
                </div>
                ${renderAgentsSection()}
                ${renderModelsSection()}
            </div>
        `;

        bindEvents();
    };

    const bindEvents = () => {
        container.querySelector('[data-reload-ai-control]')?.addEventListener('click', load);

        container.querySelectorAll('[data-agent-form]').forEach((form) => {
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const agentId = Number(form.getAttribute('data-agent-form'));
                const current = getAgents().find((item) => Number(item.id) === agentId);
                if (!current) return;

                const formData = new FormData(form);
                const payload = {
                    ...current,
                    is_enabled: formData.get('is_enabled') === 'on',
                    ai_model_id: formData.get('ai_model_id') ? Number(formData.get('ai_model_id')) : null
                };

                try {
                    await aiControlService.saveAiAgent(payload);
                    await load();
                } catch (error) {
                    await showError('Nao foi possivel salvar o agente', error?.message || 'Falha ao atualizar o agente.');
                }
            });
        });

        container.querySelector('[data-toggle-credentials]')?.addEventListener('click', () => {
            state.credentialsOpen = !state.credentialsOpen;
            render();
        });

        container.querySelector('[data-open-model-editor]')?.addEventListener('click', () => {
            state.modelEditorOpen = true;
            state.editingModelId = null;
            render();
        });

        container.querySelector('[data-cancel-model]')?.addEventListener('click', () => {
            state.modelEditorOpen = false;
            state.editingModelId = null;
            render();
        });

        container.querySelector('[data-model-form]')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const current = getModels().find((item) => Number(item.id) === Number(state.editingModelId));
            const name = String(formData.get('name') || '').trim();
            const modelName = String(formData.get('model') || '').trim();
            const payload = {
                ...(current || {}),
                name,
                slug: String(formData.get('slug') || '').trim() || slugify(name || modelName),
                provider: String(formData.get('provider') || 'gemini').trim().toLowerCase(),
                model: modelName,
                api_config_id: formData.get('api_config_id') ? Number(formData.get('api_config_id')) : null,
                is_active: formData.get('is_active') === 'on',
                supports_chat: current?.supports_chat !== false,
                supports_rag: current?.supports_rag !== false,
                supports_tools: current?.supports_tools === true,
                temperature_default: current?.temperature_default ?? 0.2,
                max_tokens_default: current?.max_tokens_default ?? 4096,
                cost_input_per_million: current?.cost_input_per_million ?? 0,
                cost_output_per_million: current?.cost_output_per_million ?? 0,
                currency: current?.currency || 'BRL',
                notes: current?.notes || ''
            };

            try {
                await aiControlService.saveAiModel(payload);
                state.modelEditorOpen = false;
                state.editingModelId = null;
                await load();
            } catch (error) {
                await showError('Nao foi possivel salvar a IA', error?.message || 'Falha ao atualizar a IA.');
            }
        });

        container.querySelectorAll('[data-edit-model]').forEach((button) => {
            button.addEventListener('click', () => {
                state.editingModelId = Number(button.getAttribute('data-edit-model'));
                state.modelEditorOpen = true;
                render();
            });
        });

        container.querySelectorAll('[data-toggle-model-active]').forEach((button) => {
            button.addEventListener('click', async () => {
                const id = Number(button.getAttribute('data-toggle-model-active'));
                const current = getModels().find((item) => Number(item.id) === id);
                if (!current) return;
                try {
                    await aiControlService.saveAiModel({
                        ...current,
                        is_active: !current.is_active
                    });
                    await load();
                } catch (error) {
                    await showError('Nao foi possivel alterar o status da IA', error?.message || 'Falha ao atualizar o status.');
                }
            });
        });

        container.querySelectorAll('[data-delete-model]').forEach((button) => {
            button.addEventListener('click', async () => {
                const id = Number(button.getAttribute('data-delete-model'));
                if (!window.confirm('Excluir esta IA cadastrada?')) return;
                try {
                    await aiControlService.deleteAiModel(id);
                    await load();
                } catch (error) {
                    await showError('Nao foi possivel excluir a IA', error?.message || 'Falha ao excluir a IA.');
                }
            });
        });

        container.querySelectorAll('[data-provider-form]').forEach((form) => {
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const providerId = form.getAttribute('data-provider-form');
                const current = getProviderConfigs().find((item) => String(item.id) === String(providerId));
                const formData = new FormData(form);
                const payload = {
                    ...(current || {}),
                    label: String(formData.get('label') || '').trim(),
                    provider: String(formData.get('provider') || '').trim().toLowerCase(),
                    api_key: String(formData.get('api_key') || '').trim(),
                    base_url: current?.base_url || '',
                    is_enabled: formData.get('is_enabled') === 'on'
                };

                try {
                    await aiControlService.saveProviderConfig(payload);
                    await load();
                } catch (error) {
                    await showError('Nao foi possivel salvar a credencial', error?.message || 'Falha ao salvar a credencial.');
                }
            });
        });

        container.querySelectorAll('[data-delete-provider]').forEach((button) => {
            button.addEventListener('click', async () => {
                const id = Number(button.getAttribute('data-delete-provider'));
                if (!window.confirm('Excluir esta credencial?')) return;
                try {
                    await aiControlService.deleteProviderConfig(id);
                    await load();
                } catch (error) {
                    await showError('Nao foi possivel excluir a credencial', error?.message || 'Falha ao excluir a credencial.');
                }
            });
        });
    };

    load();
}

import { aiAgentService } from '../utils/AIAgentService.js';
import { aiControlService } from '../utils/AIControlService.js';
import { consumePendingAiChatRequest } from '../utils/AIChatNavigation.js';
import { getUserScopedStorageKey } from '../dashboard/userScopedStorage.js';
import { normalizeAgendaTask } from '../dashboard/viewHelpers.js';
import { saveUserPreference, USER_PREFERENCE_KEYS } from '../utils/UserPreferences.js';
import { escapeHtml } from '../utils/sanitize.js';
import { showNoticeModal } from './NoticeModal.js';

const DASHBOARD_WIDGETS_STORAGE_KEY = 'app-control-dashboard-widgets-v1';
const DASHBOARD_WIDGETS_SCHEMA_VERSION = 2;

function getStorageKey(userId) {
    return `app-control-ai-chat-v1:${userId || 'guest'}`;
}

function loadPersistedState(userId) {
    try {
        const raw = window.localStorage.getItem(getStorageKey(userId));
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function persistState(userId, state) {
    try {
        window.localStorage.setItem(getStorageKey(userId), JSON.stringify(state));
    } catch {
        // noop
    }
}

function createMessageId() {
    return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createTaskId() {
    return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toIsoDate(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function buildSuggestedSchedule(text, index = 0) {
    const normalized = String(text || '').toLowerCase();
    const today = new Date();
    const explicitDate = normalized.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (explicitDate?.[1]) {
        return { priorityType: 'date', dueDate: explicitDate[1] };
    }

    if (/\b(hoje|agora|imediat|urgente|prioridade maxima|prioridade máxima)\b/.test(normalized)) {
        return { priorityType: 'today', dueDate: '' };
    }

    if (/\b(amanha|amanhã|esta semana|nessa semana|proximos dias|próximos dias)\b/.test(normalized)) {
        return { priorityType: 'week', dueDate: '' };
    }

    if (/\b(este mes|este mês|proximo mes|próximo mês)\b/.test(normalized)) {
        return { priorityType: 'month', dueDate: '' };
    }

    const baseDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (index === 0) {
        return { priorityType: 'today', dueDate: '' };
    }
    if (index <= 2) {
        return { priorityType: 'date', dueDate: toIsoDate(new Date(baseDate.getTime() + (index * 86400000))) };
    }
    return { priorityType: 'week', dueDate: '' };
}

function extractPromptLinks(prompt) {
    const text = String(prompt || '').trim();
    const processNumbers = [...text.matchAll(/\b\d{5}\.\d{3}\/\d{4}\b/g)].map((item) => item[0]).slice(0, 3);
    const clientMatch = text.match(/\b(?:cliente|titular|empresa)\s*[:\-]?\s*([A-Za-zÀ-ÿ0-9 .&'-]{3,80})/i);
    return {
        processNumbers,
        clientLabel: String(clientMatch?.[1] || '').trim().replace(/[,.]$/, ''),
        promptExcerpt: text.slice(0, 180)
    };
}

function loadDashboardWidgets(userId) {
    const storageKey = getUserScopedStorageKey(DASHBOARD_WIDGETS_STORAGE_KEY, userId);
    try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.widgets)) {
            return { storageKey, payload: { schemaVersion: DASHBOARD_WIDGETS_SCHEMA_VERSION, updatedAt: Date.now(), widgets: [] } };
        }
        return {
            storageKey,
            payload: {
                schemaVersion: Number(parsed.schemaVersion) || DASHBOARD_WIDGETS_SCHEMA_VERSION,
                updatedAt: Number(parsed.updatedAt) || Date.now(),
                widgets: Array.isArray(parsed.widgets) ? parsed.widgets : []
            }
        };
    } catch {
        return { storageKey, payload: { schemaVersion: DASHBOARD_WIDGETS_SCHEMA_VERSION, updatedAt: Date.now(), widgets: [] } };
    }
}

function saveDashboardWidgets(storageKey, payload) {
    localStorage.setItem(storageKey, JSON.stringify({
        schemaVersion: DASHBOARD_WIDGETS_SCHEMA_VERSION,
        updatedAt: Date.now(),
        widgets: Array.isArray(payload?.widgets) ? payload.widgets : []
    }));
}

function ensureAiTaskWidget(widgets) {
    const existing = widgets.find((widget) => widget?.type === 'pauta');
    if (existing) return existing;

    const nextSlot = widgets.reduce((max, widget) => Math.max(max, Number(widget?.slot) || 0), 0) + 1;
    const widget = {
        id: `widget-ai-tasks-${Date.now()}`,
        type: 'pauta',
        slot: nextSlot,
        options: {
            title: 'Tarefas da IA',
            items: []
        }
    };
    widgets.push(widget);
    return widget;
}

async function addExecutionTasksToDashboard(userId, payload, source = {}, options = {}) {
    const execution = Array.isArray(payload?.execucao) ? payload.execucao : [];
    if (execution.length === 0) {
        return { addedCount: 0 };
    }

    const dashboardState = typeof options.loadDashboardState === 'function'
        ? await options.loadDashboardState()
        : loadDashboardWidgets(userId).payload;
    const storageKey = getUserScopedStorageKey(DASHBOARD_WIDGETS_STORAGE_KEY, userId);
    const widgets = Array.isArray(dashboardState.widgets) ? dashboardState.widgets : [];
    const widget = ensureAiTaskWidget(widgets);
    const items = Array.isArray(widget?.options?.items) ? widget.options.items : [];
    const existingTexts = new Set(items.map((item) => String(item?.text || '').trim().toLowerCase()).filter(Boolean));
    const promptLinks = extractPromptLinks(source.prompt || '');

    const newTasks = execution
        .map((text, index) => {
            const schedule = buildSuggestedSchedule(text, index);
            return normalizeAgendaTask({
                id: createTaskId(),
                text,
                priorityType: schedule.priorityType,
                dueDate: schedule.dueDate,
                status: 'open',
                meta: {
                    source: 'ai-chat',
                    processNumbers: promptLinks.processNumbers,
                    clientLabel: promptLinks.clientLabel,
                    promptExcerpt: promptLinks.promptExcerpt,
                    createdFromMessageId: String(source.messageId || '').trim()
                },
                createdAt: Date.now(),
                updatedAt: Date.now()
            }, index);
        })
        .filter((item) => item && !existingTexts.has(String(item.text || '').trim().toLowerCase()));

    widget.options = {
        ...(widget.options || {}),
        title: String(widget?.options?.title || 'Tarefas da IA').trim() || 'Tarefas da IA',
        items: [...items, ...newTasks]
    };

    const nextPayload = {
        schemaVersion: DASHBOARD_WIDGETS_SCHEMA_VERSION,
        updatedAt: Date.now(),
        widgets
    };

    if (typeof options.saveDashboardState === 'function') {
        await options.saveDashboardState(nextPayload);
    } else {
        saveDashboardWidgets(storageKey, nextPayload);
    }

    return { addedCount: newTasks.length };
}

function renderStructuredList(items = [], ordered = false) {
    if (!Array.isArray(items) || items.length === 0) return '';
    const tag = ordered ? 'ol' : 'ul';
    const listStyle = ordered
        ? 'margin:0; padding-left:1.1rem; display:flex; flex-direction:column; gap:0.35rem;'
        : 'margin:0; padding-left:1rem; display:flex; flex-direction:column; gap:0.35rem;';
    return `
        <${tag} style="${listStyle}">
            ${items.map((item) => `<li>${escapeHtml(String(item || ''))}</li>`).join('')}
        </${tag}>
    `;
}

function renderAssistantPayload(payload, specialistPayloads = []) {
    const resumo = String(payload?.resumo || '').trim();
    const acao = String(payload?.acao_recomendada || '').trim();
    const execucao = Array.isArray(payload?.execucao) ? payload.execucao : [];
    const atencao = Array.isArray(payload?.atencao) ? payload.atencao : [];

    if (!resumo || !acao) {
        return '';
    }

    const consultedSummary = Array.isArray(specialistPayloads) && specialistPayloads.length > 0
        ? `
            <div style="display:flex; flex-wrap:wrap; gap:0.45rem; margin-bottom:0.9rem;">
                ${specialistPayloads.map((item) => `
                    <span style="padding:0.28rem 0.6rem; border-radius:999px; background:rgba(15,23,42,0.06); border:1px solid rgba(148,163,184,0.22); font-size:0.75rem; color:var(--slate-500);">
                        ${escapeHtml(String(item?.name || item?.slug || 'Especialista'))}
                    </span>
                `).join('')}
            </div>
        `
        : '';

    return `
        <div style="display:flex; flex-direction:column; gap:0.75rem;">
            ${consultedSummary}
            <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
                <button type="button" data-ai-action="copy-summary" class="btn-pill" style="background:rgba(15,23,42,0.04); color:var(--slate-700); border:1px solid rgba(148,163,184,0.18);">Copiar resumo</button>
                <button type="button" data-ai-action="copy-execution" class="btn-pill" style="background:rgba(15,23,42,0.04); color:var(--slate-700); border:1px solid rgba(148,163,184,0.18);">Copiar execucao</button>
                <button type="button" data-ai-action="copy-full" class="btn-pill" style="background:rgba(15,23,42,0.04); color:var(--slate-700); border:1px solid rgba(148,163,184,0.18);">Copiar resposta</button>
                <button type="button" data-ai-action="reuse-execution" class="btn-pill" style="background:rgba(37,99,235,0.1); color:#1d4ed8; border:1px solid rgba(37,99,235,0.2);">Usar execucao no campo</button>
                <button type="button" data-ai-action="send-to-dashboard" class="btn-pill" style="background:rgba(16,185,129,0.1); color:#047857; border:1px solid rgba(16,185,129,0.22);">Enviar ao painel</button>
            </div>
            <section style="padding:0.85rem 0.9rem; border-radius:16px; background:rgba(37,99,235,0.07); border:1px solid rgba(37,99,235,0.16);">
                <p class="label-tech" style="margin-bottom:0.38rem; color:#2563eb;">RESUMO</p>
                <div style="line-height:1.65;">${escapeHtml(resumo)}</div>
            </section>
            <section style="padding:0.85rem 0.9rem; border-radius:16px; background:rgba(15,23,42,0.04); border:1px solid rgba(148,163,184,0.18);">
                <p class="label-tech" style="margin-bottom:0.38rem;">ACAO RECOMENDADA</p>
                <div style="line-height:1.65; font-weight:600;">${escapeHtml(acao)}</div>
            </section>
            <section style="padding:0.85rem 0.9rem; border-radius:16px; background:rgba(15,23,42,0.04); border:1px solid rgba(148,163,184,0.18);">
                <p class="label-tech" style="margin-bottom:0.45rem;">EXECUCAO</p>
                ${renderStructuredList(execucao, true) || '<p style="margin:0; color:var(--slate-500);">Sem execucao detalhada.</p>'}
            </section>
            <section style="padding:0.85rem 0.9rem; border-radius:16px; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.18);">
                <p class="label-tech" style="margin-bottom:0.45rem; color:#b45309;">ATENCAO</p>
                ${renderStructuredList(atencao, false) || '<p style="margin:0; color:var(--slate-500);">Nenhum alerta adicional no momento.</p>'}
            </section>
        </div>
    `;
}

export function renderAIChatView(container, options = {}) {
    const state = {
        loading: true,
        sending: false,
        agents: [],
        input: '',
        messages: []
    };

    const userId = options.userId || 'guest';
    const organizationId = options.organizationId || null;
    const persisted = loadPersistedState(userId);
    if (persisted) {
        state.messages = Array.isArray(persisted.messages)
            ? persisted.messages.map((message) => ({
                ...message,
                id: message?.id || createMessageId()
            }))
            : [];
    }

    const sendMessage = async (prompt, requestOptions = {}) => {
        if (!prompt) return;

        const conversationHistory = state.messages.map((message) => ({
            role: message.role,
            content: message.content
        }));

        state.messages.push({ id: createMessageId(), role: 'user', label: 'Você', content: prompt });
        state.input = '';
        state.sending = true;
        saveLocal();
        render();

        try {
            const result = await aiAgentService.run({
                agentSlug: 'estagiario',
                prompt,
                feature: requestOptions.feature || 'global_chat',
                history: conversationHistory,
                context: Array.isArray(requestOptions.context) ? requestOptions.context : []
            });

            state.messages.push({
                id: createMessageId(),
                role: 'assistant',
                label: 'Estagiario',
                meta: [
                    Array.isArray(result?.consulted_agents) && result.consulted_agents.length > 0
                        ? `Consultou ${result.consulted_agents.map((item) => item?.name).filter(Boolean).join(', ')}`
                        : result?.consulted_agent?.name
                            ? `Consultou ${result.consulted_agent.name}`
                            : '',
                    result?.routing?.confidence
                        ? `Roteamento ${result.routing.confidence}`
                        : '',
                    result?.fallback?.estagiario_fallback?.fallback_model_name
                        ? `Fallback do Estagiario para ${result.fallback.estagiario_fallback.fallback_model_name}`
                        : Array.isArray(result?.fallback?.specialist_fallbacks) && result.fallback.specialist_fallbacks[0]?.fallback?.fallback_model_name
                            ? `Fallback do especialista para ${result.fallback.specialist_fallbacks[0].fallback.fallback_model_name}`
                        : ''
                ].filter(Boolean).join(' • '),
                content: result?.text || '',
                responsePayload: result?.response_payload || null,
                specialistPayloads: Array.isArray(result?.specialist_payloads) ? result.specialist_payloads : [],
                sourcePrompt: prompt
            });
            saveLocal();
            render();
        } catch (error) {
            state.messages.pop();
            render();
            showNoticeModal('Chat Global', error?.message || 'Nao foi possivel executar o agente.');
        } finally {
            state.sending = false;
            render();
        }
    };

    const saveLocal = () => {
        persistState(userId, {
            messages: state.messages.slice(-30)
        });
    };

    const formatPayloadForClipboard = (payload) => {
        if (!payload) return '';
        const resumo = String(payload?.resumo || '').trim();
        const acao = String(payload?.acao_recomendada || '').trim();
        const execucao = Array.isArray(payload?.execucao) ? payload.execucao : [];
        const atencao = Array.isArray(payload?.atencao) ? payload.atencao : [];
        return [
            resumo ? `RESUMO:\n${resumo}` : '',
            acao ? `ACAO RECOMENDADA:\n${acao}` : '',
            execucao.length ? `EXECUCAO:\n${execucao.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : '',
            atencao.length ? `ATENCAO:\n${atencao.map((item) => `- ${item}`).join('\n')}` : ''
        ].filter(Boolean).join('\n\n');
    };

    const copyToClipboard = async (text, successMessage) => {
        const value = String(text || '').trim();
        if (!value) {
            showNoticeModal('Chat Global', 'Nao ha conteudo disponivel para esta acao.');
            return;
        }
        try {
            await navigator.clipboard.writeText(value);
            showNoticeModal('Chat Global', successMessage);
        } catch {
            showNoticeModal('Chat Global', 'Nao foi possivel copiar para a area de transferencia.');
        }
    };

    const renderMessages = () => {
        if (state.messages.length === 0) {
            return `
                <div style="display:flex; align-items:center; justify-content:center; min-height:260px; color:var(--slate-500); text-align:center;">
                    <div>
                        <p class="label-tech" style="margin-bottom:0.75rem;">CHAT GLOBAL</p>
                        <p>Converse com o Estagiário ou teste qualquer agente configurado no Painel ADM.</p>
                    </div>
                </div>
            `;
        }

        return `
            <div style="display:flex; flex-direction:column; gap:0.9rem;">
                ${state.messages.map((message) => `
                    <div style="display:flex; justify-content:${message.role === 'user' ? 'flex-end' : 'flex-start'};">
                        <div data-message-id="${escapeHtml(message.id || '')}" style="max-width:78%; padding:1rem 1.1rem; border-radius:20px; ${message.role === 'user'
                            ? 'background:linear-gradient(135deg, #2563eb, #60a5fa); color:white;'
                            : 'background:var(--bg-main); border:1px solid var(--slate-200); color:var(--slate-900);'}">
                            <p class="label-tech" style="margin-bottom:0.45rem; color:${message.role === 'user' ? 'rgba(255,255,255,0.72)' : 'var(--slate-500)'};">${escapeHtml(message.label || (message.role === 'user' ? 'Você' : 'Agente'))}</p>
                            ${message.meta ? `<p style="margin:0 0 0.45rem; font-size:0.78rem; color:var(--slate-400);">${escapeHtml(message.meta)}</p>` : ''}
                            ${message.role === 'assistant' && message.responsePayload
                                ? renderAssistantPayload(message.responsePayload, message.specialistPayloads)
                                : `<div style="white-space:pre-wrap; line-height:1.65;">${escapeHtml(message.content || '')}</div>`}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    };

    const render = () => {
        if (state.loading) {
            container.innerHTML = `
                <div class="client-detail-shell">
                    <div class="client-detail-card">
                        <p class="label-tech">CARREGANDO CHAT GLOBAL...</p>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="client-detail-shell">
                <div class="client-detail-card">
                    <header class="client-detail-header">
                        <div>
                            <p class="label-tech">Ecossistema de IA</p>
                            <h2 class="client-detail-title">Chat Global</h2>
                            <p class="client-detail-subtitle">Fale apenas com o Estagiario. Ele orquestra os demais agentes em segundo plano e devolve a resposta no mesmo chat.</p>
                        </div>
                    </header>
                    <div style="display:grid; grid-template-columns: 1fr; gap:1rem; margin-top:1.5rem;">
                        <div class="glass-card" style="padding:1rem; display:flex; align-items:center; justify-content:space-between; gap:1rem;">
                            <div>
                                <p class="label-tech" style="margin-bottom:0.45rem;">ORQUESTRADOR ATIVO</p>
                                <strong style="color:var(--slate-900); font-size:1rem;">Estagiario</strong>
                                <p style="margin:0.35rem 0 0; color:var(--slate-500); font-size:0.9rem;">Especialistas como Tecnico, Secretaria, Compliance e Auditor atuam internamente quando necessario.</p>
                            </div>
                            <button type="button" data-clear-ai-chat class="btn-pill" style="background:transparent; color:var(--slate-500); border:1px solid var(--slate-200); justify-content:center;">Limpar conversa</button>
                        </div>
                        <div class="glass-card" style="padding:1rem; display:flex; flex-direction:column; min-height:620px;">
                            <div style="flex:1; overflow:auto; padding-right:0.25rem;">${renderMessages()}</div>
                            <form data-ai-chat-form style="margin-top:1rem; display:flex; flex-direction:column; gap:0.75rem;">
                                <textarea name="prompt" rows="5" style="width:100%; border:1px solid var(--input-border); background:var(--input-bg); color:var(--slate-900); border-radius:18px; padding:1rem;" placeholder="Ex: Liste os proximos passos para protocolar um processo novo.">${escapeHtml(state.input)}</textarea>
                                <div style="display:flex; justify-content:flex-end;">
                                    <button type="submit" class="btn-pill btn-black" ${state.sending ? 'disabled' : ''}>${state.sending ? 'ENVIANDO...' : 'ENVIAR'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.querySelector('[data-clear-ai-chat]')?.addEventListener('click', () => {
            state.messages = [];
            saveLocal();
            render();
        });

        container.querySelectorAll('[data-ai-action]').forEach((button) => {
            button.addEventListener('click', async () => {
                const messageNode = button.closest('[data-message-id]');
                const messageId = String(messageNode?.dataset.messageId || '').trim();
                const message = state.messages.find((item) => item.id === messageId);
                const payload = message?.responsePayload || null;

                if (button.dataset.aiAction === 'copy-summary') {
                    await copyToClipboard(payload?.resumo || '', 'Resumo copiado.');
                    return;
                }
                if (button.dataset.aiAction === 'copy-execution') {
                    await copyToClipboard(
                        Array.isArray(payload?.execucao) ? payload.execucao.map((item, index) => `${index + 1}. ${item}`).join('\n') : '',
                        'Execucao copiada.'
                    );
                    return;
                }
                if (button.dataset.aiAction === 'copy-full') {
                    await copyToClipboard(formatPayloadForClipboard(payload) || message?.content || '', 'Resposta copiada.');
                    return;
                }
                if (button.dataset.aiAction === 'reuse-execution') {
                    const executionText = Array.isArray(payload?.execucao) ? payload.execucao.join('\n') : '';
                    if (!executionText) {
                        showNoticeModal('Chat Global', 'Nao ha execucao estruturada para reaproveitar.');
                        return;
                    }
                    state.input = executionText;
                    render();
                    return;
                }
                if (button.dataset.aiAction === 'send-to-dashboard') {
                    const result = await addExecutionTasksToDashboard(userId, payload, {
                        prompt: message?.sourcePrompt || '',
                        messageId
                    }, {
                        loadDashboardState: options.loadDashboardState,
                        saveDashboardState: options.saveDashboardState || (async (nextPayload) => {
                            await saveUserPreference({
                                userId,
                                organizationId: null,
                                preferenceKey: USER_PREFERENCE_KEYS.DASHBOARD_LAYOUT,
                                localStorageKey: getUserScopedStorageKey(DASHBOARD_WIDGETS_STORAGE_KEY, userId),
                                value: nextPayload,
                                storageKind: 'json'
                            });
                        })
                    });
                    if (result.addedCount > 0) {
                        showNoticeModal('Chat Global', `${result.addedCount} tarefa(s) enviada(s) para o painel.`);
                    } else {
                        showNoticeModal('Chat Global', 'Nenhuma tarefa nova foi enviada. A execucao ja estava no painel ou veio vazia.');
                    }
                }
            });
        });

        container.querySelector('[data-ai-chat-form]')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (state.sending) return;

            const formData = new FormData(event.currentTarget);
            const prompt = String(formData.get('prompt') || '').trim();
            if (!prompt) {
                showNoticeModal('Chat Global', 'Digite uma mensagem para continuar.');
                return;
            }
            await sendMessage(prompt, { feature: 'global_chat' });
        });
    };

    const init = async () => {
        state.loading = true;
        render();
        const pendingRequest = consumePendingAiChatRequest();
        try {
            const data = await aiControlService.load();
            state.agents = (data?.ai_agents || []).filter((agent) => agent.is_enabled === true);
        } catch (error) {
            showNoticeModal('Chat Global', error?.message || 'Nao foi possivel carregar os agentes de IA.');
        } finally {
            state.loading = false;
            render();
            if (pendingRequest?.prompt) {
                state.input = pendingRequest.prompt;
                render();
                await sendMessage(pendingRequest.prompt, {
                    feature: pendingRequest.feature || 'contextual_chat',
                    context: pendingRequest.context || []
                });
            }
        }
    };

    init();
}

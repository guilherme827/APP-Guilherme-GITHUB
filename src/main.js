import './styles/main.css';
import { renderHeader, initHeaderMenu } from './components/Header.js';
import { renderDock, initDock } from './components/Dock.js';
import { processStore } from './utils/ProcessStore.js';
import { clientStore } from './utils/ClientStore.js';
import { authService } from './utils/AuthService.js';
import { profileService } from './utils/ProfileService.js';
import { renderLoginScreen } from './components/LoginScreen.js';
import { renderClientList } from './components/ClientList.js';
import { renderClientForm } from './components/ClientForm.js';
import { renderProcessList } from './components/ProcessList.js';
import { renderProcessForm } from './components/ProcessForm.js';
import { renderProcessDetails } from './components/ProcessDetails.js';
import { renderDeadlineDashboard } from './components/DeadlineDashboard.js';
import { renderSettings } from './components/Settings.js';
import { renderTeamSettings } from './components/TeamSettings.js';
import { showNoticeModal } from './components/NoticeModal.js';
import {
    getDashboardWidgetSpan,
    getDashboardPlacementForSlot,
    buildDashboardGridState,
    canPlaceDashboardWidgetAtSlot
} from './dashboard/gridEngine.js';
import {
    getUserScopedStorageKey,
    loadUserScopedJsonStorage,
    saveUserScopedJsonStorage
} from './dashboard/userScopedStorage.js';
import { reportDashboardError } from './dashboard/logger.js';
import {
    canDeleteContent,
    canEditContent,
    canViewSection,
    hasAdminAccess
} from './utils/accessControl.js';

const THEME_STORAGE_KEY = 'app-control-theme';
const AVAILABLE_THEMES = ['niobio', 'diamante', 'topazio', 'ouro', 'esmeralda'];
const ALERT_STORAGE_KEY = 'app-control-alert-days';
const DASHBOARD_WIDGETS_STORAGE_KEY = 'app-control-dashboard-widgets-v1';
const DASHBOARD_WIDGETS_SCHEMA_VERSION = 2;
const FINANCE_STORAGE_KEY = 'app-control-finance-v1';
const DASHBOARD_EDITOR_MODE_NONE = 'none';
const DASHBOARD_EDITOR_MODE_FULL = 'full';
const DASHBOARD_EDITOR_MODE_AGENDA_ITEM = 'agenda-item';
const LOGIN_ROUTE = '/';
const APP_ROUTE = '/app';
const AUTH_DEBUG = false;

function authLog(...args) {
    if (!AUTH_DEBUG) return;
    console.log('[auth-debug]', ...args);
}

function getStoredTheme() {
    const theme = String(localStorage.getItem(THEME_STORAGE_KEY) || 'niobio');
    return AVAILABLE_THEMES.includes(theme) ? theme : 'niobio';
}

function applyTheme(themeId) {
    const safeTheme = AVAILABLE_THEMES.includes(themeId) ? themeId : 'niobio';
    document.body.setAttribute('data-theme', safeTheme);
    localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
    return safeTheme;
}

function getStoredAlertDays() {
    const value = Number(localStorage.getItem(ALERT_STORAGE_KEY) || 15);
    return Number.isFinite(value) && value > 0 ? value : 15;
}

function saveAlertDays(days) {
    const safeDays = Number.isFinite(Number(days)) ? Number(days) : 15;
    localStorage.setItem(ALERT_STORAGE_KEY, String(safeDays));
    return safeDays;
}

function getProfileDisplayName(profile, fallbackEmail = '') {
    return String(profile?.full_name || fallbackEmail || 'Usuário').trim();
}

function getHeaderGreeting(profile, fallbackEmail = '') {
    const firstName = getProfileDisplayName(profile, fallbackEmail).split(/\s+/)[0] || 'Usuário';
    if (profile?.gender === 'feminino') return `Olá, ${firstName}!`;
    if (profile?.gender === 'masculino') return `Olá, ${firstName}!`;
    return `Olá, ${firstName}!`;
}

function buildEmergencyProfile(session) {
    return {
        id: session?.user?.id || '',
        email: session?.user?.email || '',
        full_name: '',
        role: 'user',
        gender: 'neutro',
        permissions: { view: true, edit: false, delete: false },
        folder_access: ['painel', 'clientes', 'processos', 'prazos', 'configuracoes']
    };
}

function navigateTo(path, replace = false) {
    if (window.location.pathname === path) return;
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', path);
}

document.addEventListener('DOMContentLoaded', async () => {
    const app = document.getElementById('app');
    let currentTheme = applyTheme(getStoredTheme());
    let currentSession = null;
    let currentProfile = null;
    let teamProfiles = [];
    let teamCreateLoading = false;
    let currentSection = 'painel';
    let hasRenderedProtectedApp = false;
    let isBootstrappingSession = true;
    let renderSequence = 0;
    let alertLeadDays = getStoredAlertDays();
    let disposeHeaderMenu = null;

    const renderRoute = async () => {
        const renderId = ++renderSequence;
        const isAuthenticated = !!currentSession;
        const pathname = window.location.pathname;
        authLog('renderRoute:start', {
            renderId,
            pathname,
            isAuthenticated,
            currentSection,
            sessionUserId: currentSession?.user?.id || null
        });

        if (!isAuthenticated && pathname !== LOGIN_ROUTE) {
            authLog('redirecting to login because no session is present');
            navigateTo(LOGIN_ROUTE, true);
        }

        if (isAuthenticated && pathname === LOGIN_ROUTE) {
            authLog('redirecting to /app because session exists');
            navigateTo(APP_ROUTE, true);
        }

        if (!currentSession) {
            document.body.classList.remove('dashboard-active');
            authLog('rendering login screen');
            renderLoginScreen(app, async (email, password) => {
                authLog('signInWithPassword:start', { email });
                await authService.signInWithPassword(email, password);
            });
            return;
        }
        document.body.classList.add('dashboard-active');

        try {
            currentProfile = await profileService.getProfile(currentSession.user.id);
        } catch (error) {
            authLog('renderRoute:profile-fallback', error?.message || error);
            currentProfile = buildEmergencyProfile(currentSession);
        }

        const [clientLoadResult, processLoadResult] = await Promise.allSettled([
            clientStore.load(!hasRenderedProtectedApp),
            processStore.load(!hasRenderedProtectedApp)
        ]);

        if (clientLoadResult.status === 'rejected') {
            authLog('renderRoute:client-load-failed', clientLoadResult.reason?.message || clientLoadResult.reason);
            clientStore.reset();
        }

        if (processLoadResult.status === 'rejected') {
            authLog('renderRoute:process-load-failed', processLoadResult.reason?.message || processLoadResult.reason);
            processStore.reset();
        }

        if (hasAdminAccess(currentProfile)) {
            try {
                teamProfiles = await profileService.listProfiles();
            } catch (error) {
                authLog('renderRoute:team-load-failed', error?.message || error);
                teamProfiles = [];
            }
        } else {
            teamProfiles = [];
        }

        authLog('profile sync complete', {
            renderId,
            role: currentProfile?.role,
            hasRenderedProtectedApp
        });

        if (renderId !== renderSequence) {
            authLog('renderRoute:stale-render-skipped', { renderId, activeRenderId: renderSequence });
            return;
        }

        renderAuthenticatedApp(currentSession);
    };

    const renderAuthenticatedApp = (session) => {
        authLog('renderAuthenticatedApp', {
            currentSection,
            sessionUserId: session?.user?.id || null
        });
        disposeHeaderMenu?.();
        const isAdmin = hasAdminAccess(currentProfile);
        const visibleSections = ['painel', 'clientes', 'processos', 'prazos', 'financeiro', 'configuracoes']
            .filter((sectionId) => canViewSection(currentProfile, sectionId));
        const displayName = getProfileDisplayName(currentProfile, session?.user?.email || '');
        const headerGreeting = getHeaderGreeting(currentProfile, session?.user?.email || '');

        app.innerHTML = `
            <div class="dashboard-shell">
                <div class="dashboard-glow dashboard-glow-a"></div>
                <div class="dashboard-glow dashboard-glow-b"></div>
                ${renderHeader({
                    email: session?.user?.email || '',
                    fullName: displayName,
                    greeting: headerGreeting,
                    role: currentProfile?.role || 'user',
                    alertDays: alertLeadDays
                })}
                <main id="main-content">
                    <div id="view-header" class="view-header">
                        <div id="view-actions-left"></div>
                        <div id="view-actions"></div>
                    </div>
                    <section id="content-area"></section>
                </main>
                ${renderDock({ isAdmin, visibleIds: visibleSections, fullName: displayName, email: session?.user?.email || '' })}
            </div>
        `;

        disposeHeaderMenu = initHeaderMenu({
            profile: currentProfile,
            onProfileSave: async (payload) => {
                try {
                    currentProfile = await profileService.updateOwnProfile(payload);
                    showNoticeModal('Dados atualizados', 'Seu perfil foi atualizado com sucesso.');
                    renderAuthenticatedApp(currentSession);
                } catch (error) {
                    showNoticeModal('Erro ao atualizar', error?.message || 'Não foi possível atualizar seus dados.');
                }
            },
            onAlertSave: async (days) => {
                alertLeadDays = saveAlertDays(days);
                showNoticeModal('Alertas atualizados', `Os avisos de vencimento agora usarão ${alertLeadDays} dias de antecedência.`);
                renderAuthenticatedApp(currentSession);
            },
            onPasswordSave: async ({ password, confirmPassword }) => {
                if (!password || password.length < 6) {
                    showNoticeModal('Senha inválida', 'A nova senha precisa ter pelo menos 6 caracteres.');
                    return;
                }
                if (password !== confirmPassword) {
                    showNoticeModal('Confirmação inválida', 'A confirmação da senha não confere.');
                    return;
                }
                try {
                    await authService.updatePassword(password);
                    showNoticeModal('Senha atualizada', 'Sua nova senha foi salva com sucesso.');
                } catch (error) {
                    showNoticeModal('Erro de segurança', error?.message || 'Não foi possível atualizar a senha.');
                }
            },
            onSignOut: async () => {
                try {
                    await authService.signOut();
                } catch (error) {
                    showNoticeModal('Erro ao sair', error?.message || 'Não foi possível encerrar a sessão.');
                }
            }
        });

        const contentArea = document.getElementById('content-area');
        const viewActionsLeft = document.getElementById('view-actions-left');
        const viewActions = document.getElementById('view-actions');
        const viewHeader = document.getElementById('view-header');

        const navigate = (id) => {
            authLog('navigate:requested', { id, currentSection });
            contentArea.innerHTML = '';
            if (viewActionsLeft) viewActionsLeft.innerHTML = '';
            viewActions.innerHTML = '';
            viewActions.style.display = '';

            if (id !== 'equipe' && !canViewSection(currentProfile, id)) {
                authLog('navigate:blocked by permission', { id, role: currentProfile?.role });
                showNoticeModal('Acesso restrito', 'Seu perfil não possui acesso a esta área.');
                navigate('painel');
                return;
            }

            currentSection = id;
            document.body.classList.toggle('workspace-lock-scroll', id === 'clientes' || id === 'processos');
            document.querySelectorAll('.dock-item').forEach((item) => {
                item.classList.toggle('active', item.dataset.id === id);
            });

            if (id === 'painel') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'space-between';
                if (viewHeader) viewHeader.classList.add('view-header-floating-left');
                renderDashboard(
                    contentArea,
                    viewActionsLeft,
                    getUserScopedStorageKey(DASHBOARD_WIDGETS_STORAGE_KEY, currentSession?.user?.id),
                    alertLeadDays
                );
            } else if (id === 'clientes') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'flex-end';
                if (viewHeader) viewHeader.classList.remove('view-header-floating-left');
                renderClientesView(contentArea, viewActions);
            } else if (id === 'processos') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'flex-end';
                if (viewHeader) viewHeader.classList.remove('view-header-floating-left');
                renderProcessosView(contentArea, viewActions);
            } else if (id === 'prazos') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'flex-end';
                if (viewHeader) viewHeader.classList.remove('view-header-floating-left');
                renderDeadlineDashboard(contentArea, {
                    canEdit: canEditContent(currentProfile)
                });
            } else if (id === 'configuracoes') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'flex-end';
                if (viewHeader) viewHeader.classList.remove('view-header-floating-left');
                renderSettings(contentArea, {
                    profile: currentProfile,
                    email: session?.user?.email || '',
                    alertDays: alertLeadDays,
                    currentTheme,
                    isAdmin,
                    onThemeChange: (themeId) => {
                        currentTheme = applyTheme(themeId);
                    },
                    onProfileSave: async (payload) => {
                        try {
                            currentProfile = await profileService.updateOwnProfile(payload);
                            showNoticeModal('Dados atualizados', 'Seu perfil foi atualizado com sucesso.');
                            renderAuthenticatedApp(currentSession);
                        } catch (error) {
                            showNoticeModal('Erro ao atualizar', error?.message || 'Não foi possível atualizar seus dados.');
                        }
                    },
                    onAlertSave: async (days) => {
                        alertLeadDays = saveAlertDays(days);
                        showNoticeModal('Alertas atualizados', `Os avisos de vencimento agora usarão ${alertLeadDays} dias de antecedência.`);
                        renderAuthenticatedApp(currentSession);
                    },
                    onPasswordSave: async ({ password, confirmPassword }) => {
                        if (!password || password.length < 6) {
                            showNoticeModal('Senha inválida', 'A nova senha precisa ter pelo menos 6 caracteres.');
                            return;
                        }
                        if (password !== confirmPassword) {
                            showNoticeModal('Confirmação inválida', 'A confirmação da senha não confere.');
                            return;
                        }
                        try {
                            await authService.updatePassword(password);
                            showNoticeModal('Senha atualizada', 'Sua nova senha foi salva com sucesso.');
                        } catch (error) {
                            showNoticeModal('Erro de segurança', error?.message || 'Não foi possível atualizar a senha.');
                        }
                    },
                    onSignOut: async () => {
                        try {
                            await authService.signOut();
                        } catch (error) {
                            showNoticeModal('Erro ao sair', error?.message || 'Não foi possível encerrar a sessão.');
                        }
                    },
                    onOpenTeam: () => navigate('equipe')
                });
            } else if (id === 'financeiro') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'flex-end';
                if (viewHeader) viewHeader.classList.remove('view-header-floating-left');
                renderFinanceiroView(
                    contentArea,
                    getUserScopedStorageKey(FINANCE_STORAGE_KEY, currentSession?.user?.id)
                );
            } else if (id === 'equipe') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'flex-end';
                if (viewHeader) viewHeader.classList.remove('view-header-floating-left');
                if (!isAdmin) {
                    navigate('painel');
                    return;
                }
                renderTeamSettings(contentArea, {
                    currentProfile,
                    profiles: teamProfiles,
                    loading: false,
                    createLoading: teamCreateLoading,
                    onRefresh: async () => {
                        try {
                            teamProfiles = await profileService.listProfiles();
                            navigate('equipe');
                        } catch (error) {
                            showNoticeModal('Erro ao atualizar', error?.message || 'Não foi possível atualizar a lista da equipe.');
                        }
                    },
                    onCreateMember: async (payload) => {
                        try {
                            teamCreateLoading = true;
                            await profileService.createMember(payload);
                            teamProfiles = await profileService.listProfiles();
                            showNoticeModal('Novo membro criado', 'O novo usuário foi criado com sucesso e já possui acesso inicial.');
                            navigate('equipe');
                        } catch (error) {
                            showNoticeModal('Erro ao criar', error?.message || 'Não foi possível criar o novo membro.');
                        } finally {
                            teamCreateLoading = false;
                        }
                    },
                    onUpdateMember: async (payload) => {
                        try {
                            await profileService.updateMember(payload);
                            teamProfiles = await profileService.listProfiles();
                            if (String(payload.id) === String(currentProfile?.id)) {
                                currentProfile = teamProfiles.find((profile) => String(profile.id) === String(payload.id)) || currentProfile;
                            }
                            showNoticeModal('Permissões atualizadas', 'As permissões do usuário foram atualizadas com sucesso.');
                            navigate('equipe');
                        } catch (error) {
                            showNoticeModal('Erro ao salvar', error?.message || 'Não foi possível atualizar o membro da equipe.');
                        }
                    }
                });
            } else {
                renderEmptyState(contentArea, id);
            }
        };

        function renderProcessosView(container, actionsContainer) {
            const renderList = (restoreClientId = null, restoreProjectId = null) => {
                renderProcessList(container, actionsContainer,
                    (clientId) => showAddProcess(container, actionsContainer, renderList, clientId),
                    (processId, clientId, projectId, action) => {
                        if (action === 'edit') {
                            showEditProcess(
                                container,
                                actionsContainer,
                                processId,
                                () => showProcessDetails(container, actionsContainer, processId, clientId, projectId, renderList)
                            );
                        } else {
                            showProcessDetails(container, actionsContainer, processId, clientId, projectId, renderList);
                        }
                    },
                    restoreClientId,
                    restoreProjectId,
                    {
                        canEdit: canEditContent(currentProfile),
                        canDelete: canDeleteContent(currentProfile)
                    }
                );
            };
            renderList();
        }

        function showProcessDetails(container, actionsContainer, processId, clientId, projectId, renderList) {
            container.innerHTML = '';
            actionsContainer.innerHTML = '';

            const onNavigate = {
                toProcessList: () => renderList(null, null),
                toClient: () => renderList(clientId, null),
                toProject: projectId ? () => renderList(clientId, projectId) : null,
                toEdit: (pid) => showEditProcess(container, actionsContainer, pid, () => showProcessDetails(container, actionsContainer, pid, clientId, projectId, renderList))
            };

            renderProcessDetails(container, actionsContainer, processId, onNavigate);
        }

        function showEditProcess(container, actionsContainer, processId, onComplete) {
            const process = processStore.processes.find((item) => String(item.id) === String(processId));
            if (!process) return;

            container.innerHTML = '';
            actionsContainer.innerHTML = '';

            renderProcessForm(container, (updatedData) => {
                processStore.updateProcess(processId, updatedData)
                    .then((wasUpdated) => {
                        if (!wasUpdated) {
                            showNoticeModal('Erro ao salvar', 'Não foi possível atualizar este processo.');
                            return;
                        }
                        showNoticeModal('Processo atualizado', 'As alterações foram salvas com sucesso.');
                        onComplete();
                    })
                    .catch((error) => {
                        showNoticeModal('Erro ao salvar', error?.message || 'Não foi possível atualizar este processo.');
                    });
            }, onComplete, process);
        }

        function showAddProcess(container, actionsContainer, onComplete, clientId = null) {
            container.innerHTML = '';
            actionsContainer.innerHTML = '';
            renderProcessForm(container, async (data) => {
                try {
                    await processStore.addProcess(data);
                    onComplete();
                } catch (error) {
                    showNoticeModal('Erro ao salvar', error?.message || 'Não foi possível salvar o processo.');
                }
            }, onComplete, null, clientId);
        }

        function renderClientesView(container, actionsContainer) {
            const renderList = () => {
                actionsContainer.innerHTML = '';
                renderClientList(container, actionsContainer,
                    (client) => showEditClient(container, actionsContainer, client, renderList),
                    () => showAddClient(container, actionsContainer, renderList),
                    {
                        canEdit: canEditContent(currentProfile),
                        canDelete: canDeleteContent(currentProfile)
                    }
                );
            };
            renderList();
        }

        function showAddClient(container, actionsContainer, onComplete) {
            container.innerHTML = '';
            actionsContainer.innerHTML = '';
            renderClientForm(container,
                async (data) => {
                    try {
                        await clientStore.addClient(data);
                        onComplete();
                    } catch (error) {
                        showNoticeModal('Não foi possível salvar', error?.message || 'Falha ao criar o titular.');
                    }
                },
                onComplete
            );
        }

        function showEditClient(container, actionsContainer, client, onComplete) {
            container.innerHTML = '';
            actionsContainer.innerHTML = '';
            renderClientForm(container,
                async (data) => {
                    try {
                        await clientStore.updateClient(client.id, data);
                        onComplete();
                    } catch (error) {
                        showNoticeModal('Não foi possível salvar', error?.message || 'Falha ao atualizar o titular.');
                    }
                },
                onComplete,
                client
            );
        }

        initDock(navigate);
        const defaultSection = ['painel', 'clientes', 'processos', 'prazos', 'configuracoes']
            .find((sectionId) => canViewSection(currentProfile, sectionId)) || 'painel';
        const targetSection = canViewSection(currentProfile, currentSection) ? currentSection : defaultSection;
        authLog('renderAuthenticatedApp:initial-section', { currentSection, defaultSection, targetSection });
        navigate(targetSection);
        hasRenderedProtectedApp = true;
    };

    const handleAuthStateChange = async (event, session) => {
        authLog('onAuthStateChange', {
            event,
            currentUserId: currentSession?.user?.id || null,
            nextUserId: session?.user?.id || null,
            isBootstrappingSession
        });

        if (isBootstrappingSession && event === 'INITIAL_SESSION') {
            authLog('ignoring INITIAL_SESSION during bootstrap');
            return;
        }

        if (event === 'SIGNED_IN' && currentSession?.user?.id === session?.user?.id && hasRenderedProtectedApp) {
            currentSession = session;
            authLog('ignoring redundant SIGNED_IN for same user');
            return;
        }

        if (event === 'TOKEN_REFRESHED' && currentSession?.user?.id === session?.user?.id && hasRenderedProtectedApp) {
            currentSession = session;
            authLog('ignoring TOKEN_REFRESHED rerender for same user');
            return;
        }

        currentSession = session;
        if (!session) {
            currentProfile = null;
            teamProfiles = [];
            clientStore.reset();
            processStore.reset();
            hasRenderedProtectedApp = false;
            currentSection = 'painel';
            navigateTo(LOGIN_ROUTE, true);
        } else {
            navigateTo(APP_ROUTE, true);
        }
        await renderRoute();
    };

    const { data: authSubscription } = authService.onAuthStateChange((event, session) => {
        window.setTimeout(() => {
            handleAuthStateChange(event, session).catch((error) => {
                authLog('handleAuthStateChange:error', error);
            });
        }, 0);
    });

    window.addEventListener('popstate', () => {
        renderRoute().catch((error) => {
            app.innerHTML = `<main id="main-content" style="padding: 3rem 2rem;"><div class="glass-card"><p>${error?.message || 'Erro inesperado de rota.'}</p></div></main>`;
        });
    });

    try {
        currentSession = await authService.getSession();
        authLog('bootstrap:getSession', {
            sessionUserId: currentSession?.user?.id || null,
            pathname: window.location.pathname
        });
        if (currentSession && window.location.pathname === LOGIN_ROUTE) {
            navigateTo(APP_ROUTE, true);
        }
        if (!currentSession && window.location.pathname !== LOGIN_ROUTE) {
            navigateTo(LOGIN_ROUTE, true);
        }
        await renderRoute();
    } catch (error) {
        authLog('bootstrap:error', error);
        app.innerHTML = `
            <main id="main-content" style="padding: 3rem 2rem;">
                <div class="glass-card" style="max-width: 760px; margin: 0 auto; padding: 2rem;">
                    <p class="label-tech" style="color: var(--rose-500);">ERRO DE AUTENTICAÇÃO</p>
                    <h1 class="font-black" style="font-size: 2rem; margin-top: 0.5rem;">Não foi possível iniciar o aplicativo.</h1>
                    <p style="color: var(--slate-500); margin-top: 1rem; line-height: 1.6;">${error?.message || 'Falha ao consultar a sessão do Supabase.'}</p>
                </div>
            </main>
        `;
    } finally {
        isBootstrappingSession = false;
        authLog('bootstrap:done');
    }

    window.addEventListener('beforeunload', () => {
        authSubscription?.subscription?.unsubscribe?.();
    });
});

function renderDashboard(container, actionHost, storageKey = DASHBOARD_WIDGETS_STORAGE_KEY, deadlineAlertDays = 15) {
    let clockTicker = null;
    let currentGridColumns = 6;
    let currentGridState = null;
    let addWidgetMenuOpen = false;
    let openWidgetMenuId = null;
    let openEditorWidgetId = null;
    let openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
    let openTaskMenuKey = null;
    let pendingWidgetType = null;
    let pendingDragWidgetId = null;
    let pendingDragPointerId = null;
    let pendingDragTimer = null;
    let draggingWidgetId = null;
    let dropTargetSlotIndex = null;
    let activePointerId = null;
    let dragOriginX = 0;
    let dragOriginY = 0;
    const agendaDrafts = new Map();

    const getDashboardColumns = () => {
        if (window.innerWidth >= 1320) return 6;
        if (window.innerWidth >= 900) return 4;
        return 2;
    };

    const normalizeAgendaTask = (task, index) => {
        const text = String(task?.text || task?.label || '').trim();
        if (!text) return null;
        const priorityType = ['today', 'week', 'month', 'date'].includes(task?.priorityType)
            ? task.priorityType
            : 'week';
        const dueDate = String(task?.dueDate || '').trim();
        const status = ['open', 'done', 'skipped'].includes(task?.status) ? task.status : 'open';
        return {
            id: String(task?.id || `task-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`),
            text,
            priorityType,
            dueDate,
            status,
            createdAt: Number.isFinite(Number(task?.createdAt)) ? Number(task.createdAt) : Date.now(),
            updatedAt: Number.isFinite(Number(task?.updatedAt)) ? Number(task.updatedAt) : Date.now()
        };
    };

    const normalizeListItem = (item, index) => {
        const text = String(item?.text || item?.label || '').trim();
        if (!text) return null;
        return {
            id: String(item?.id || `list-item-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`),
            text,
            createdAt: Number.isFinite(Number(item?.createdAt)) ? Number(item.createdAt) : Date.now(),
            updatedAt: Number.isFinite(Number(item?.updatedAt)) ? Number(item.updatedAt) : Date.now()
        };
    };

    const normalizeLoadedWidgets = (items) => {
        const usedIds = new Set();
        return items
            .map((item, index) => {
                const rawId = String(item?.id || '').trim() || `widget-${Date.now()}-${index}`;
                const id = usedIds.has(rawId) ? `${rawId}-${index}` : rawId;
                usedIds.add(id);

                const type = ['resumo', 'relogio', 'calendario', 'meta_mes', 'pauta', 'lista'].includes(item?.type) ? item.type : '';
                const rawSlot = Number(item?.slot);
                const slot = Number.isFinite(rawSlot) && rawSlot >= 1 ? Math.floor(rawSlot) : index + 1;
                const defaultClockMode = String(item?.options?.clockMode || 'digital');

                if (type === 'relogio') {
                    return {
                        id,
                        type,
                        slot,
                        options: {
                            clockMode: ['digital', 'ponteiros', 'compacto', 'faixa'].includes(defaultClockMode)
                                ? defaultClockMode
                                : 'digital'
                        }
                    };
                }

                if (type === 'calendario') {
                    return {
                        id,
                        type,
                        slot,
                        options: {}
                    };
                }

                if (type === 'meta_mes') {
                    return {
                        id,
                        type,
                        slot,
                        options: {}
                    };
                }

                if (type === 'pauta') {
                    const tasks = Array.isArray(item?.options?.items)
                        ? item.options.items.map(normalizeAgendaTask).filter(Boolean)
                        : [];
                    return {
                        id,
                        type,
                        slot,
                        options: {
                            title: String(item?.options?.title || 'Tarefas').trim() || 'Tarefas',
                            items: tasks
                        }
                    };
                }

                if (type === 'lista') {
                    const items = Array.isArray(item?.options?.items)
                        ? item.options.items.map(normalizeListItem).filter(Boolean)
                        : [];
                    return {
                        id,
                        type,
                        slot,
                        options: {
                            title: String(item?.options?.title || 'Lista').trim() || 'Lista',
                            items
                        }
                    };
                }

                return {
                    id,
                    type,
                    slot,
                    options: {
                        totalTitulares: Boolean(item?.options?.totalTitulares),
                        titularesComProcesso: Boolean(item?.options?.titularesComProcesso),
                        totalProcessos: Boolean(item?.options?.totalProcessos || item?.options?.totalProjetos),
                        resumoPrazos: Boolean(item?.options?.resumoPrazos)
                    }
                };
            })
            .filter((item) => item.id && item.type);
    };

    const loadWidgets = () => {
        try {
            const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
            if (Array.isArray(parsed)) {
                const migratedWidgets = normalizeLoadedWidgets(parsed);
                localStorage.setItem(storageKey, JSON.stringify({
                    schemaVersion: DASHBOARD_WIDGETS_SCHEMA_VERSION,
                    updatedAt: Date.now(),
                    widgets: migratedWidgets
                }));
                return migratedWidgets;
            }
            if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.widgets)) return [];
            return normalizeLoadedWidgets(parsed.widgets);
        } catch (error) {
            reportDashboardError('dashboard-load-widgets', error, { storageKey });
            return [];
        }
    };

    const widgets = loadWidgets();
    const widgetTypes = [
        { id: 'resumo', label: 'Resumo', copy: 'Indicadores centrais do painel' },
        { id: 'relogio', label: 'Relogio', copy: 'Hora em formatos dinamicos' },
        { id: 'calendario', label: 'Calendario', copy: 'Mes atual com todos os dias visiveis' },
        { id: 'meta_mes', label: 'Meta do mes', copy: 'Titulos outorgados no mes atual' },
        { id: 'pauta', label: 'Tarefas', copy: 'Lista priorizada de tarefas e retornos' },
        { id: 'lista', label: 'Lista', copy: 'Itens livres para ideias, notas e registros' }
    ];

    const getWidgetById = (widgetId) => widgets.find((widget) => widget.id === widgetId);

    const getNextFreeSlot = (type = 'resumo', ignoreWidgetId = null, columns = currentGridColumns) => {
        const span = getDashboardWidgetSpan({ id: '__temp__', type, options: { items: [] } }, columns);
        let slot = 1;
        while (slot < 500) {
            if (canPlaceDashboardWidgetAtSlot(widgets, slot, span.cols, span.rows, ignoreWidgetId, columns)) {
                return getDashboardPlacementForSlot(slot, span.cols, columns).slot;
            }
            slot += 1;
        }
        return 1;
    };

    const persistWidgets = () => {
        const serialized = widgets.map((widget) => {
            if (widget.type === 'relogio') {
                return {
                    id: widget.id,
                    type: widget.type,
                    slot: widget.slot,
                    options: {
                        clockMode: widget.options?.clockMode || 'digital'
                    }
                };
            }

            if (widget.type === 'calendario') {
                return {
                    id: widget.id,
                    type: widget.type,
                    slot: widget.slot,
                    options: {}
                };
            }

            if (widget.type === 'meta_mes') {
                return {
                    id: widget.id,
                    type: widget.type,
                    slot: widget.slot,
                    options: {}
                };
            }

            if (widget.type === 'pauta') {
                return {
                    id: widget.id,
                    type: widget.type,
                    slot: widget.slot,
                    options: {
                        title: String(widget.options?.title || 'Tarefas').trim() || 'Tarefas',
                        items: Array.isArray(widget.options?.items)
                            ? widget.options.items.map((task, index) => normalizeAgendaTask(task, index)).filter(Boolean)
                            : []
                    }
                };
            }

            if (widget.type === 'lista') {
                return {
                    id: widget.id,
                    type: widget.type,
                    slot: widget.slot,
                    options: {
                        title: String(widget.options?.title || 'Lista').trim() || 'Lista',
                        items: Array.isArray(widget.options?.items)
                            ? widget.options.items.map((item, index) => normalizeListItem(item, index)).filter(Boolean)
                            : []
                    }
                };
            }

            return {
                id: widget.id,
                type: widget.type,
                slot: widget.slot,
                options: {
                    totalTitulares: Boolean(widget.options?.totalTitulares),
                    titularesComProcesso: Boolean(widget.options?.titularesComProcesso),
                    totalProcessos: Boolean(widget.options?.totalProcessos),
                    resumoPrazos: Boolean(widget.options?.resumoPrazos)
                }
            };
        });
        try {
            localStorage.setItem(storageKey, JSON.stringify({
                schemaVersion: DASHBOARD_WIDGETS_SCHEMA_VERSION,
                updatedAt: Date.now(),
                widgets: serialized
            }));
        } catch (error) {
            reportDashboardError('dashboard-persist-widgets', error, { storageKey, widgetsCount: serialized.length });
        }
    };

    const createWidget = (type, options = {}) => {
        const columns = getDashboardColumns();
        const pautaTitle = String(options.title || '').trim();
        widgets.push({
            id: `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            type,
            slot: getNextFreeSlot(type, null, columns),
            options: type === 'relogio'
                ? { clockMode: 'digital' }
                : type === 'calendario'
                    ? {}
                : type === 'meta_mes'
                    ? {}
                : type === 'pauta'
                    ? { title: pautaTitle || 'Tarefas', items: [] }
                    : type === 'lista'
                        ? { title: pautaTitle || 'Lista', items: [] }
                    : {
                        totalTitulares: false,
                        titularesComProcesso: false,
                        totalProcessos: false,
                        resumoPrazos: false
                    }
        });
        persistWidgets();
        addWidgetMenuOpen = false;
        pendingWidgetType = null;
        openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
        render();
    };

    const deleteWidget = (widgetId) => {
        const index = widgets.findIndex((widget) => widget.id === widgetId);
        if (index < 0) return;
        widgets.splice(index, 1);
        agendaDrafts.delete(widgetId);
        persistWidgets();
        openWidgetMenuId = null;
        openEditorWidgetId = null;
        openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
        openTaskMenuKey = null;
        render();
    };

    const updateResumoOption = (widgetId, optionKey, checked) => {
        const widget = widgets.find((item) => item.id === widgetId && item.type === 'resumo');
        if (!widget) return;
        widget.options[optionKey] = Boolean(checked);
        persistWidgets();
        render();
    };

    const updateClockMode = (widgetId, clockMode) => {
        const widget = widgets.find((item) => item.id === widgetId && item.type === 'relogio');
        if (!widget) return;
        widget.options.clockMode = ['digital', 'ponteiros', 'compacto', 'faixa'].includes(clockMode) ? clockMode : 'digital';
        persistWidgets();
        render();
    };

    const updateAgendaTitle = (widgetId, title) => {
        const widget = widgets.find((item) => item.id === widgetId && ['pauta', 'lista'].includes(item.type));
        if (!widget) return;
        widget.options.title = String(title || '').trim() || (widget.type === 'lista' ? 'Lista' : 'Tarefas');
        persistWidgets();
        render();
    };

    const getDateOnly = (value) => {
        if (!value) return null;
        const date = new Date(`${value}T00:00:00`);
        if (Number.isNaN(date.getTime())) return null;
        return date;
    };

    const getTodayDate = () => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    };

    const getTaskPriorityRank = (task) => {
        if (task.status !== 'open') return task.status === 'done' ? 1000 : 1100;
        const today = getTodayDate();
        if (task.priorityType === 'today') return 0;
        if (task.priorityType === 'week') return 7;
        if (task.priorityType === 'month') return 30;
        const dueDate = getDateOnly(task.dueDate);
        if (!dueDate) return 45;
        const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
        return diffDays <= 0 ? diffDays : diffDays + 14;
    };

    const sortAgendaTasks = (items) => [...items].sort((a, b) => {
        const priorityDiff = getTaskPriorityRank(a) - getTaskPriorityRank(b);
        if (priorityDiff !== 0) return priorityDiff;
        return (a.createdAt || 0) - (b.createdAt || 0);
    });

    const getTaskDeadlineBadge = (task) => {
        if (task.status === 'done') return { label: 'Feito', tone: 'done' };
        if (task.status === 'skipped') return { label: 'Nao sera', tone: 'muted' };
        if (task.priorityType === 'today') return { label: 'Hoje', tone: 'today' };
        if (task.priorityType === 'week' || task.priorityType === 'month') return { label: 'No prazo', tone: 'ok' };
        const dueDate = getDateOnly(task.dueDate);
        if (!dueDate) return { label: 'No prazo', tone: 'ok' };
        const today = getTodayDate();
        if (dueDate.getTime() < today.getTime()) return { label: 'Vencido', tone: 'late' };
        if (dueDate.getTime() === today.getTime()) return { label: 'Hoje', tone: 'today' };
        return { label: 'No prazo', tone: 'ok' };
    };

    const moveWidgetToSlot = (widgetId, targetSlotIndex) => {
        if (!widgetId || !Number.isFinite(targetSlotIndex) || targetSlotIndex < 1) return false;

        const dragged = getWidgetById(widgetId);
        if (!dragged) return false;
        const columns = currentGridColumns;
        const draggedSpan = getDashboardWidgetSpan(dragged, columns);
        const normalizedTargetSlot = getDashboardPlacementForSlot(targetSlotIndex, draggedSpan.cols, columns).slot;
        if (dragged.slot === normalizedTargetSlot) return false;

        if (canPlaceDashboardWidgetAtSlot(widgets, normalizedTargetSlot, draggedSpan.cols, draggedSpan.rows, widgetId, columns)) {
            dragged.slot = normalizedTargetSlot;
            persistWidgets();
            return true;
        }

        const targetWidget = widgets.find((widget) => {
            if (widget.id === widgetId) return false;
            const placement = currentGridState?.placements.get(widget.id);
            if (!placement) return false;
            for (let rowOffset = 0; rowOffset < placement.rows; rowOffset += 1) {
                for (let colOffset = 0; colOffset < placement.cols; colOffset += 1) {
                    const occupiedSlot = ((placement.row - 1 + rowOffset) * columns) + placement.col + colOffset;
                    if (occupiedSlot === normalizedTargetSlot) return true;
                }
            }
            return false;
        });

        if (!targetWidget) return false;

        const targetSpan = getDashboardWidgetSpan(targetWidget, columns);
        const normalizedOriginSlot = getDashboardPlacementForSlot(dragged.slot, targetSpan.cols, columns).slot;
        if (!canPlaceDashboardWidgetAtSlot(widgets, normalizedTargetSlot, draggedSpan.cols, draggedSpan.rows, [widgetId, targetWidget.id], columns)) {
            return false;
        }
        if (!canPlaceDashboardWidgetAtSlot(widgets, normalizedOriginSlot, targetSpan.cols, targetSpan.rows, [targetWidget.id, widgetId], columns)) {
            return false;
        }

        targetWidget.slot = normalizedOriginSlot;
        dragged.slot = normalizedTargetSlot;
        persistWidgets();
        return true;
    };

    const resolveDropSlotIndex = (clientX, clientY) => {
        const grid = container.querySelector('#dashboard-bento-grid');
        if (!grid) return null;
        const styles = window.getComputedStyle(grid);
        const rect = grid.getBoundingClientRect();
        const paddingLeft = parseFloat(styles.paddingLeft) || 0;
        const paddingRight = parseFloat(styles.paddingRight) || 0;
        const paddingTop = parseFloat(styles.paddingTop) || 0;
        const gap = parseFloat(styles.columnGap || styles.gap) || 16;
        const columns = currentGridColumns;
        const contentWidth = rect.width - paddingLeft - paddingRight;
        const cellSize = (contentWidth - gap * (columns - 1)) / columns;
        if (!(cellSize > 0)) return null;

        const localX = clientX - rect.left - paddingLeft;
        const localY = clientY - rect.top - paddingTop;
        const column = Math.min(
            columns,
            Math.max(1, Math.round((localX - cellSize / 2) / (cellSize + gap)) + 1)
        );
        const row = Math.max(1, Math.round((localY - cellSize / 2) / (cellSize + gap)) + 1);
        return ((row - 1) * columns) + column;
    };

    const clearDropTargets = () => {
        container.querySelectorAll('.is-drop-target').forEach((item) => item.classList.remove('is-drop-target'));
    };

    const clearPendingDrag = () => {
        if (pendingDragTimer) {
            clearTimeout(pendingDragTimer);
            pendingDragTimer = null;
        }
        pendingDragWidgetId = null;
        pendingDragPointerId = null;
    };

    const activateDrag = (card, pointerId, clientX, clientY) => {
        const grid = container.querySelector('#dashboard-bento-grid');
        draggingWidgetId = card.dataset.widgetId;
        activePointerId = pointerId;
        dragOriginX = clientX;
        dragOriginY = clientY;
        dropTargetSlotIndex = null;
        addWidgetMenuOpen = false;
        pendingWidgetType = null;
        openWidgetMenuId = null;
        openEditorWidgetId = null;
        openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
        openTaskMenuKey = null;

        grid?.classList.add('is-dragging');
        card.classList.add('is-dragging');
        card.style.pointerEvents = 'none';
        card.setPointerCapture?.(pointerId);
        clearPendingDrag();
    };

    const finishDrag = (clientX, clientY) => {
        clearPendingDrag();
        if (!draggingWidgetId) return;
        const draggedCard = container.querySelector(`[data-widget-id="${draggingWidgetId}"]`);
        if (draggedCard) {
            draggedCard.classList.remove('is-dragging');
            draggedCard.style.transform = '';
            draggedCard.style.pointerEvents = '';
            draggedCard.releasePointerCapture?.(activePointerId);
        }
        const grid = container.querySelector('#dashboard-bento-grid');
        grid?.classList.remove('is-dragging');

        const resolvedSlot = (
            Number.isFinite(clientX) && Number.isFinite(clientY)
                ? resolveDropSlotIndex(clientX, clientY)
                : null
        ) || dropTargetSlotIndex;

        clearDropTargets();
        if (Number.isFinite(resolvedSlot) && resolvedSlot >= 1) {
            moveWidgetToSlot(draggingWidgetId, resolvedSlot);
        }

        draggingWidgetId = null;
        dropTargetSlotIndex = null;
        activePointerId = null;
        dragOriginX = 0;
        dragOriginY = 0;
        render();
    };

    const formatClockParts = (date = new Date()) => {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const weekdayFull = date.toLocaleDateString('pt-BR', { weekday: 'long' });
        const monthFull = date.toLocaleDateString('pt-BR', { month: 'long' }).toUpperCase();
        const day = String(date.getDate()).padStart(2, '0');
        const year = String(date.getFullYear());
        const weekday = weekdayFull.replace('-feira', ' Feira').replace(/^./, (char) => char.toUpperCase());
        const fullDate = `${day} de ${monthFull} de ${year}`;
        const dayMonth = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
        return { hours, minutes, seconds, weekday, fullDate, dayMonth };
    };

    const renderClockFace = (clockMode) => {
        if (clockMode === 'ponteiros') {
            return `
                <div class="clock-face clock-face--analog" data-clock-face="ponteiros">
                    <div class="clock-analog-shell">
                        <div class="clock-analog-markers">
                            <span></span><span></span><span></span><span></span>
                        </div>
                        <i class="clock-hand hour" data-clock-hand="hour"></i>
                        <i class="clock-hand minute" data-clock-hand="minute"></i>
                        <i class="clock-hand second" data-clock-hand="second"></i>
                        <i class="clock-hand-center"></i>
                    </div>
                </div>
            `;
        }

        if (clockMode === 'compacto') {
            return `
                <div class="clock-face clock-face--compact" data-clock-face="compacto">
                    <p class="clock-mini-kicker" data-clock-day></p>
                    <p class="clock-compact-time"><span data-clock-hours></span><b>:</b><span data-clock-minutes></span></p>
                    <p class="clock-mini-copy" data-clock-date></p>
                </div>
            `;
        }

        if (clockMode === 'faixa') {
            return `
                <div class="clock-face clock-face--strip" data-clock-face="faixa">
                    <div class="clock-strip-main">
                        <span data-clock-hours></span>
                        <b>:</b>
                        <span data-clock-minutes></span>
                    </div>
                    <div class="clock-strip-meta">
                        <span data-clock-seconds></span>
                        <span data-clock-date></span>
                    </div>
                </div>
            `;
        }

        return `
            <div class="clock-face clock-face--digital" data-clock-face="digital">
                <p class="clock-digital-time"><span data-clock-hours></span><b>:</b><span data-clock-minutes></span></p>
                <p class="clock-digital-date" data-clock-full-date></p>
                <p class="clock-digital-weekday" data-clock-weekday></p>
            </div>
        `;
    };

    const renderWidgetOverlayActions = (widget) => `
        <div class="bento-widget-actions bento-widget-actions--overlay">
            <button
                type="button"
                class="bento-widget-menu-trigger bento-widget-menu-trigger--plain"
                data-action="toggle-widget-menu"
                data-widget-id="${widget.id}"
                aria-label="Ações do widget"
            >
                ${iconMoreDots()}
            </button>
            ${openWidgetMenuId === widget.id ? `
                <div class="bento-widget-menu" role="menu">
                    ${['calendario', 'meta_mes'].includes(widget.type) ? '' : `<button type="button" data-action="edit-widget" data-widget-id="${widget.id}" role="menuitem">Editar</button>`}
                    <button type="button" data-action="delete-widget" data-widget-id="${widget.id}" role="menuitem">Excluir</button>
                </div>
            ` : ''}
        </div>
    `;

    const renderClockWidget = (widget) => {
        const clockMode = widget.options.clockMode || 'digital';
        return `
            <article class="bento-widget bento-widget--summary bento-widget--clock" data-widget-id="${widget.id}" data-clock-widget-id="${widget.id}" data-clock-mode="${clockMode}">
                ${renderWidgetOverlayActions(widget)}
                <div class="bento-clock-content">
                    ${renderClockFace(clockMode)}
                </div>
                ${openEditorWidgetId === widget.id ? `
                    <div class="bento-widget-editor" data-editor-widget-id="${widget.id}">
                        <label><input type="radio" name="clock-mode-${widget.id}" data-action="change-clock-mode" data-widget-id="${widget.id}" value="digital" ${clockMode === 'digital' ? 'checked' : ''} />Relogio digital</label>
                        <label><input type="radio" name="clock-mode-${widget.id}" data-action="change-clock-mode" data-widget-id="${widget.id}" value="ponteiros" ${clockMode === 'ponteiros' ? 'checked' : ''} />Relogio de ponteiros</label>
                        <label><input type="radio" name="clock-mode-${widget.id}" data-action="change-clock-mode" data-widget-id="${widget.id}" value="compacto" ${clockMode === 'compacto' ? 'checked' : ''} />Relogio compacto</label>
                        <label><input type="radio" name="clock-mode-${widget.id}" data-action="change-clock-mode" data-widget-id="${widget.id}" value="faixa" ${clockMode === 'faixa' ? 'checked' : ''} />Relogio em faixa</label>
                    </div>
                ` : ''}
            </article>
        `;
    };

    const renderCalendarWidget = (widget) => {
        const now = new Date();
        const monthLabel = now
            .toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
            .replace('.', '')
            .replace(/^./, (char) => char.toUpperCase());
        const today = now.getDate();
        const year = now.getFullYear();
        const month = now.getMonth();
        const monthForLabel = now.toLocaleDateString('pt-BR', { month: 'long' });
        const firstDay = new Date(year, month, 1);
        const firstWeekday = (firstDay.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const weekdayLabels = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
        const cells = [];

        for (let index = 0; index < firstWeekday; index += 1) {
            cells.push('<span class="calendar-day is-empty" aria-hidden="true"></span>');
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
            const dayLabel = `${day} de ${monthForLabel} de ${year}`;
            cells.push(`<span class="calendar-day${day === today ? ' is-today' : ''}" role="gridcell" aria-label="${dayLabel}">${day}</span>`);
        }

        while (cells.length < 42) {
            cells.push('<span class="calendar-day is-empty" aria-hidden="true"></span>');
        }

        return `
            <article class="bento-widget bento-widget--summary bento-widget--calendar-panel" data-widget-id="${widget.id}">
                ${renderWidgetOverlayActions(widget)}
                <div class="calendar-panel">
                    <div class="calendar-panel-head">
                        <h3 class="calendar-panel-title">${monthLabel}</h3>
                    </div>
                    <div class="calendar-weekdays">
                        ${weekdayLabels.map((label) => `<span>${label}</span>`).join('')}
                    </div>
                    <div class="calendar-grid">
                        ${cells.join('')}
                    </div>
                </div>
            </article>
        `;
    };

    const renderMonthlyGoalWidget = (widget) => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const monthLabel = now
            .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
            .replace(/^./, (char) => char.toUpperCase());

        const safeProcesses = Array.isArray(processStore.processes) ? processStore.processes : [];
        const outorgadosNoMes = safeProcesses.filter((process) => {
            const rawDate = String(process?.dataOutorga || '').trim();
            if (!rawDate) return false;
            const parsedDate = new Date(`${rawDate}T00:00:00`);
            if (Number.isNaN(parsedDate.getTime())) return false;
            return parsedDate.getMonth() === currentMonth && parsedDate.getFullYear() === currentYear;
        });

        return `
            <article class="bento-widget bento-widget--summary bento-widget--monthly-goal" data-widget-id="${widget.id}">
                ${renderWidgetOverlayActions(widget)}
                <div class="monthly-goal-panel">
                    <p class="monthly-goal-kicker">Meta do mes</p>
                    <h3 class="monthly-goal-title">Titulos outorgados</h3>
                    <p class="monthly-goal-value">${outorgadosNoMes.length}</p>
                    <p class="monthly-goal-period">${monthLabel}</p>
                </div>
            </article>
        `;
    };

    const updateClockWidgets = () => {
        const now = new Date();
        const { hours, minutes, seconds, weekday, fullDate, dayMonth } = formatClockParts(now);
        container.querySelectorAll('[data-clock-widget-id]').forEach((widgetNode) => {
            widgetNode.querySelectorAll('[data-clock-hours]').forEach((node) => { node.textContent = hours; });
            widgetNode.querySelectorAll('[data-clock-minutes]').forEach((node) => { node.textContent = minutes; });
            widgetNode.querySelectorAll('[data-clock-seconds]').forEach((node) => { node.textContent = seconds; });
            widgetNode.querySelectorAll('[data-clock-date]').forEach((node) => { node.textContent = dayMonth; });
            widgetNode.querySelectorAll('[data-clock-day]').forEach((node) => { node.textContent = weekday; });
            widgetNode.querySelectorAll('[data-clock-full-date]').forEach((node) => { node.textContent = fullDate; });
            widgetNode.querySelectorAll('[data-clock-weekday]').forEach((node) => { node.textContent = weekday; });

            if (widgetNode.dataset.clockMode !== 'ponteiros') return;
            const hoursNum = now.getHours() % 12;
            const minutesNum = now.getMinutes();
            const secondsNum = now.getSeconds();
            const hourDeg = (hoursNum + minutesNum / 60) * 30;
            const minuteDeg = (minutesNum + secondsNum / 60) * 6;
            const secondDeg = secondsNum * 6;
            const hourHand = widgetNode.querySelector('[data-clock-hand="hour"]');
            const minuteHand = widgetNode.querySelector('[data-clock-hand="minute"]');
            const secondHand = widgetNode.querySelector('[data-clock-hand="second"]');
            if (hourHand) hourHand.style.transform = `translateX(-50%) rotate(${hourDeg}deg)`;
            if (minuteHand) minuteHand.style.transform = `translateX(-50%) rotate(${minuteDeg}deg)`;
            if (secondHand) secondHand.style.transform = `translateX(-50%) rotate(${secondDeg}deg)`;
        });
    };

    const startClockTicker = () => {
        if (clockTicker) clearInterval(clockTicker);
        if (!widgets.some((widget) => widget.type === 'relogio')) return;
        updateClockWidgets();
        clockTicker = window.setInterval(updateClockWidgets, 1000);
    };

    const renderResumoWidget = (widget) => {
        const safeProcesses = Array.isArray(processStore.processes) ? processStore.processes : [];
        const totalTitulares = clientStore.getClients().length;
        const totalProcessos = safeProcesses.length;
        const titularesComProcesso = new Set(
            safeProcesses.map((process) => String(process?.clientId || '').trim()).filter(Boolean)
        ).size;
        const titularesSemProcesso = Math.max(totalTitulares - titularesComProcesso, 0);
        const titularesComProcessoPercent = totalTitulares ? Math.round((titularesComProcesso / totalTitulares) * 100) : 0;
        const showTitulares = widget.options.totalTitulares;
        const showTitularesComProcesso = widget.options.titularesComProcesso;
        const showProcessos = widget.options.totalProcessos;
        const showPrazos = widget.options.resumoPrazos;
        const processTypeCounts = safeProcesses.reduce((acc, process) => {
            const label = String(process.tipoSigla || process.tipo || 'OUT').trim().toUpperCase();
            const safeLabel = label.length > 10 ? label.slice(0, 10) : label;
            acc.set(safeLabel, (acc.get(safeLabel) || 0) + 1);
            return acc;
        }, new Map());
        const today = getTodayDate();
        const prazoItems = safeProcesses.reduce((acc, process) => {
            const deadlines = Array.isArray(process?.deadlines) ? process.deadlines : [];
            deadlines.forEach((deadline, index) => {
                const date = getDateOnly(deadline?.date);
                if (!date) return;
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
        const maxDeadlineBucket = Math.max(overdueDeadlines.length, todayDeadlines.length, weekDeadlines.length, monthDeadlines.length, laterDeadlines.length, 1);
        const prazoDistribution = [
            { label: 'Atrasados', value: overdueDeadlines.length, tone: 'late' },
            { label: 'Hoje', value: todayDeadlines.length, tone: 'today' },
            { label: 'Prox. semana', value: weekDeadlines.length, tone: 'soon' },
            { label: 'Prox. 30 dias', value: monthDeadlines.length, tone: 'month' },
            { label: 'Mais de 30 dias', value: laterDeadlines.length, tone: 'future' }
        ];
        const topProcessTypes = [...processTypeCounts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 3)
            .map(([label, value]) => ({ label, value }));
        const showTitularesSection = showTitulares || showTitularesComProcesso;
        const hasAnySection = showTitularesSection || showProcessos || showPrazos;

        return `
            <article class="bento-widget bento-widget--summary" data-widget-id="${widget.id}">
                ${renderWidgetOverlayActions(widget)}
                <div class="bento-summary-content${hasAnySection ? '' : ' is-empty'}">
                    ${hasAnySection ? `
                        <div class="bento-summary-panels">
                            ${showTitularesSection ? `
                                <section class="bento-summary-panel tone-primary">
                                    <div class="bento-summary-panel-head">
                                        <p class="bento-summary-panel-label">Titulares</p>
                                        ${showTitulares ? `<p class="bento-summary-panel-total">${totalTitulares}</p>` : ''}
                                    </div>
                                    <div class="bento-summary-titulares">
                                        ${showTitularesComProcesso ? `
                                            <div class="bento-summary-emphasis">
                                                <strong class="bento-summary-emphasis-value">${titularesComProcesso}</strong>
                                                <span class="bento-summary-emphasis-copy">com processo vinculado</span>
                                            </div>
                                            ${showTitulares ? `
                                                <div class="bento-summary-progress-track" aria-hidden="true"><span style="width:${titularesComProcessoPercent}%;"></span></div>
                                                <div class="bento-summary-split">
                                                    <span>${titularesComProcessoPercent}% da base</span>
                                                    <strong>${titularesSemProcesso} sem processo</strong>
                                                </div>
                                            ` : ''}
                                        ` : ''}
                                        ${showTitulares && !showTitularesComProcesso ? `
                                            <div class="bento-summary-emphasis">
                                                <strong class="bento-summary-emphasis-value">${totalTitulares}</strong>
                                                <span class="bento-summary-emphasis-copy">titulares cadastrados</span>
                                            </div>
                                        ` : ''}
                                        ${showTitulares ? `
                                            <div class="bento-summary-footnote">
                                                <span>Total da carteira</span>
                                                <strong>${totalTitulares}</strong>
                                            </div>
                                        ` : ''}
                                    </div>
                                </section>
                            ` : ''}
                            ${showProcessos ? `
                                <section class="bento-summary-panel tone-secondary">
                                    <div class="bento-summary-panel-head">
                                        <p class="bento-summary-panel-label">Processos</p>
                                        <p class="bento-summary-panel-total">${totalProcessos}</p>
                                    </div>
                                    <div class="bento-summary-breakdown">
                                        ${topProcessTypes.length ? topProcessTypes.map((item) => `
                                            <div class="bento-summary-chip">
                                                <span>${item.value}</span>
                                                <strong>${item.label}</strong>
                                            </div>
                                        `).join('') : '<div class="bento-summary-chip is-empty"><strong>Sem tipos</strong></div>'}
                                    </div>
                                </section>
                            ` : ''}
                            ${showPrazos ? `
                                <section class="bento-summary-panel tone-alert${overdueDeadlines.length ? ' has-critical' : ''}">
                                    <div class="bento-summary-panel-head">
                                        <p class="bento-summary-panel-label">Prazos a Cumprir</p>
                                        <p class="bento-summary-panel-total">${totalPrazos}</p>
                                    </div>
                                    ${totalPrazos ? `
                                        <div class="bento-summary-deadlines">
                                            <div class="bento-summary-deadline-bars">
                                                ${prazoDistribution.map((item) => `
                                                    <div class="bento-summary-deadline-row tone-${item.tone}">
                                                        <span>${item.label}</span>
                                                        <div class="bento-summary-deadline-bar"><i style="width:${Math.max((item.value / maxDeadlineBucket) * 100, item.value ? 12 : 0)}%;"></i></div>
                                                        <strong>${item.value}</strong>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    ` : `
                                        <div class="bento-summary-deadlines-empty">
                                            <strong>Sem prazos ativos</strong>
                                            <span>Nenhum vencimento registrado nos processos.</span>
                                        </div>
                                    `}
                                </section>
                            ` : ''}
                        </div>
                    ` : `
                        <div class="bento-summary-empty-state">
                            <span class="bento-summary-empty-kicker">Resumo</span>
                            <p>Escolha os indicadores em Editar para montar este widget.</p>
                        </div>
                    `}
                </div>
                ${openEditorWidgetId === widget.id ? `
                    <div class="bento-widget-editor" data-editor-widget-id="${widget.id}">
                        <label><input type="checkbox" data-action="toggle-summary-option" data-widget-id="${widget.id}" data-option-key="totalTitulares" ${showTitulares ? 'checked' : ''} />O numero total de Titulares</label>
                        <label><input type="checkbox" data-action="toggle-summary-option" data-widget-id="${widget.id}" data-option-key="titularesComProcesso" ${showTitularesComProcesso ? 'checked' : ''} />O numero de Titulares com processos</label>
                        <label><input type="checkbox" data-action="toggle-summary-option" data-widget-id="${widget.id}" data-option-key="totalProcessos" ${showProcessos ? 'checked' : ''} />O numero total de Processos</label>
                        <label><input type="checkbox" data-action="toggle-summary-option" data-widget-id="${widget.id}" data-option-key="resumoPrazos" ${showPrazos ? 'checked' : ''} />Resumo de Prazos</label>
                    </div>
                ` : ''}
            </article>
        `;
    };

    const getAgendaDraft = (widget) => {
        const stored = agendaDrafts.get(widget.id) || {};
        return {
            title: stored.title ?? widget.options.title ?? (widget.type === 'lista' ? 'Lista' : 'Tarefas'),
            text: stored.text ?? '',
            priorityType: stored.priorityType ?? 'week',
            dueDate: stored.dueDate ?? '',
            editingTaskId: stored.editingTaskId ?? ''
        };
    };

    const setAgendaDraft = (widgetId, nextDraft) => {
        const widget = getWidgetById(widgetId);
        if (!widget || !['pauta', 'lista'].includes(widget.type)) return;
        agendaDrafts.set(widgetId, { ...getAgendaDraft(widget), ...nextDraft });
    };

    const clearAgendaDraft = (widgetId) => {
        agendaDrafts.delete(widgetId);
    };

    const addOrUpdateAgendaTask = (widgetId) => {
        const widget = getWidgetById(widgetId);
        if (!widget || !['pauta', 'lista'].includes(widget.type)) return;
        const editor = container.querySelector(`[data-editor-widget-id="${widgetId}"]`);
        if (!editor) return;
        const text = String(editor.querySelector('[data-field="agenda-text"]')?.value || '').trim();
        const priorityType = String(editor.querySelector('[data-field="agenda-priority"]')?.value || 'week');
        const dueDate = String(editor.querySelector('[data-field="agenda-date"]')?.value || '').trim();
        const editingTaskId = String(editor.querySelector('[data-field="agenda-editing-task-id"]')?.value || '').trim();
        if (!text) return;

        if (editingTaskId) {
            const task = widget.options.items.find((item) => item.id === editingTaskId);
            if (task) {
                task.text = text;
                if (widget.type === 'pauta') {
                    task.priorityType = ['today', 'week', 'month', 'date'].includes(priorityType) ? priorityType : 'week';
                    task.dueDate = dueDate;
                }
                task.updatedAt = Date.now();
            }
        } else {
            widget.options.items.push({
                id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                text,
                ...(widget.type === 'pauta' ? {
                    priorityType: ['today', 'week', 'month', 'date'].includes(priorityType) ? priorityType : 'week',
                    dueDate,
                    status: 'open'
                } : {}),
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        clearAgendaDraft(widgetId);
        openEditorMode = DASHBOARD_EDITOR_MODE_AGENDA_ITEM;
        persistWidgets();
        render();
    };

    const updateAgendaTaskStatus = (widgetId, taskId, status) => {
        const widget = getWidgetById(widgetId);
        if (!widget || widget.type !== 'pauta') return;
        const task = widget.options.items.find((item) => item.id === taskId);
        if (!task) return;
        task.status = status;
        task.updatedAt = Date.now();
        openTaskMenuKey = null;
        persistWidgets();
        render();
    };

    const deleteAgendaTask = (widgetId, taskId) => {
        const widget = getWidgetById(widgetId);
        if (!widget || !['pauta', 'lista'].includes(widget.type)) return;
        widget.options.items = widget.options.items.filter((item) => item.id !== taskId);
        openTaskMenuKey = null;
        persistWidgets();
        render();
    };

    const beginAgendaTaskEdit = (widgetId, taskId) => {
        const widget = getWidgetById(widgetId);
        if (!widget || !['pauta', 'lista'].includes(widget.type)) return;
        const task = widget.options.items.find((item) => item.id === taskId);
        if (!task) return;
        setAgendaDraft(widgetId, {
            title: widget.options.title,
            text: task.text,
            priorityType: task.priorityType || 'week',
            dueDate: task.dueDate || '',
            editingTaskId: task.id
        });
        openTaskMenuKey = null;
        openEditorWidgetId = widgetId;
        openEditorMode = DASHBOARD_EDITOR_MODE_AGENDA_ITEM;
        render();
    };

    const renderAgendaWidget = (widget) => {
        const isSimpleList = widget.type === 'lista';
        const tasks = isSimpleList ? [...(widget.options.items || [])] : sortAgendaTasks(widget.options.items || []);
        const openCount = isSimpleList ? tasks.length : tasks.filter((task) => task.status === 'open').length;
        const doneCount = isSimpleList ? 0 : tasks.filter((task) => task.status === 'done').length;
        const draft = getAgendaDraft(widget);
        const showTitleField = openEditorMode === DASHBOARD_EDITOR_MODE_FULL;

        return `
            <article class="bento-widget bento-widget--agenda" data-widget-id="${widget.id}">
                ${renderWidgetOverlayActions(widget)}
                <div class="bento-agenda-head">
                    <div class="bento-agenda-head-main">
                        <h3 class="bento-agenda-title">${widget.options.title}</h3>
                        <div class="bento-agenda-meta">
                            <span>${openCount} ${isSimpleList ? 'itens' : 'em aberto'}</span>
                            <strong>${isSimpleList ? 'livres' : `${doneCount} concluidos`}</strong>
                        </div>
                    </div>
                    <button type="button" class="bento-agenda-add-button" data-action="open-agenda-add-item" data-widget-id="${widget.id}">Adicionar item</button>
                </div>
                <div class="bento-agenda-list${tasks.length > 5 ? ' has-scroll' : ''}">
                    ${tasks.length ? tasks.map((task) => {
                        const badge = isSimpleList ? null : getTaskDeadlineBadge(task);
                        const taskMenuKey = `${widget.id}:${task.id}`;
                        return `
                            <div class="bento-agenda-item${isSimpleList ? '' : ` is-${task.status}`}">
                                <div class="bento-agenda-bullet" aria-hidden="true"></div>
                                <div class="bento-agenda-copy">
                                    <p>${task.text}</p>
                                </div>
                                <div class="bento-agenda-side">
                                    ${badge ? `<span class="bento-agenda-deadline tone-${badge.tone}">${badge.label}</span>` : ''}
                                    <div class="bento-agenda-item-actions">
                                        <button type="button" class="bento-widget-menu-trigger bento-widget-menu-trigger--plain" data-action="toggle-task-menu" data-widget-id="${widget.id}" data-task-id="${task.id}" aria-label="Ações da tarefa">
                                            ${iconMoreDots()}
                                        </button>
                                        ${openTaskMenuKey === taskMenuKey ? `
                                            <div class="bento-widget-menu" role="menu">
                                                ${isSimpleList ? '' : `
                                                    <button type="button" data-action="mark-task-done" data-widget-id="${widget.id}" data-task-id="${task.id}" role="menuitem">Marcar como Feito</button>
                                                    <button type="button" data-action="skip-task" data-widget-id="${widget.id}" data-task-id="${task.id}" role="menuitem">Nao sera feito</button>
                                                `}
                                                <button type="button" data-action="edit-task" data-widget-id="${widget.id}" data-task-id="${task.id}" role="menuitem">Editar</button>
                                                <button type="button" data-action="delete-task" data-widget-id="${widget.id}" data-task-id="${task.id}" role="menuitem">Excluir</button>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('') : `
                        <div class="bento-agenda-empty">
                            <strong>Sem itens ainda</strong>
                            <span>Use Adicionar item para montar esta ${isSimpleList ? 'lista' : 'lista de tarefas'}.</span>
                        </div>
                    `}
                </div>
                ${openEditorWidgetId === widget.id ? `
                    <div class="bento-widget-editor bento-widget-editor--agenda" data-editor-widget-id="${widget.id}">
                        ${showTitleField ? `
                            <label class="bento-editor-block">
                                <span>Titulo</span>
                                <input type="text" data-action="change-agenda-title" data-widget-id="${widget.id}" value="${draft.title}" />
                            </label>
                        ` : ''}
                        <div class="bento-agenda-editor-grid">
                            <label class="bento-editor-block bento-editor-block--full">
                                <span>Item</span>
                                <input type="text" data-field="agenda-text" value="${draft.text}" placeholder="${isSimpleList ? 'Ex.: ideia, anotacao ou referencia' : 'Ex.: responder cliente ou avisar sobre o RAL'}" />
                            </label>
                            ${isSimpleList ? '' : `
                                <label class="bento-editor-block">
                                    <span>Urgencia</span>
                                    <select data-field="agenda-priority">
                                        <option value="today" ${draft.priorityType === 'today' ? 'selected' : ''}>Hoje</option>
                                        <option value="week" ${draft.priorityType === 'week' ? 'selected' : ''}>Esta semana</option>
                                        <option value="month" ${draft.priorityType === 'month' ? 'selected' : ''}>Este mes</option>
                                        <option value="date" ${draft.priorityType === 'date' ? 'selected' : ''}>Por data</option>
                                    </select>
                                </label>
                                <label class="bento-editor-block">
                                    <span>Data</span>
                                    <input type="date" data-field="agenda-date" value="${draft.dueDate}" ${draft.priorityType === 'date' ? '' : 'disabled'} />
                                </label>
                            `}
                            <div class="bento-editor-inline-submit">
                                <span>&nbsp;</span>
                                <button type="button" class="bento-agenda-add-button bento-agenda-add-button--inline" data-action="save-agenda-task" data-widget-id="${widget.id}">Salvar</button>
                            </div>
                        </div>
                        <input type="hidden" data-field="agenda-editing-task-id" value="${draft.editingTaskId}" />
                        ${draft.editingTaskId ? `
                            <div class="bento-agenda-editor-actions">
                                <button type="button" class="btn btn-ghost" data-action="cancel-agenda-task" data-widget-id="${widget.id}">Cancelar</button>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </article>
        `;
    };

    const renderWidgets = () => {
        currentGridColumns = getDashboardColumns();
        currentGridState = buildDashboardGridState(widgets, currentGridColumns);
        const placementEntries = [...currentGridState.placements.entries()];
        const maxOccupiedSlot = placementEntries.reduce((max, [widgetId, placement]) => {
            const highest = ((placement.row + placement.rows - 2) * currentGridColumns) + placement.col + placement.cols - 1;
            return Math.max(max, highest);
        }, 0);
        const slotCount = Math.max(currentGridColumns * 3, maxOccupiedSlot + currentGridColumns * 2);
        const anchorSlots = new Map(placementEntries.map(([widgetId, placement]) => [placement.slot, { widget: getWidgetById(widgetId), placement }]));

        if (actionHost) {
            actionHost.innerHTML = `
                <div class="bento-panel-actions">
                    <div class="bento-add-wrap">
                        <button type="button" class="bento-add-fab" data-action="toggle-add-widget-menu" aria-label="Adicionar widget" aria-haspopup="menu" aria-expanded="${addWidgetMenuOpen ? 'true' : 'false'}" aria-controls="dashboard-widget-type-menu">
                            ${iconPlusWidget()}
                            <span class="bento-add-tooltip">Adicionar Widget</span>
                        </button>
                        ${addWidgetMenuOpen ? `
                            <div class="bento-add-menu" id="dashboard-widget-type-menu" role="menu" aria-label="Tipos de widget">
                                ${widgetTypes.map((type) => `
                                    <button type="button" class="bento-add-menu-item" data-action="create-widget" data-widget-type="${type.id}" role="menuitem">
                                        <span class="bento-add-menu-item-title">${type.label}</span>
                                        <span class="bento-add-menu-item-preview" aria-hidden="true">${renderWidgetTypePreview(type.id)}</span>
                                        <span class="bento-add-menu-item-copy">${type.copy}</span>
                                    </button>
                                `).join('')}
                                ${pendingWidgetType === 'pauta' || pendingWidgetType === 'lista' ? `
                                    <div class="bento-add-inline-creator">
                                        <label class="bento-add-inline-field">
                                            <span>${pendingWidgetType === 'lista' ? 'Nome da lista' : 'Nome das tarefas'}</span>
                                            <input type="text" data-field="new-pauta-title" placeholder="${pendingWidgetType === 'lista' ? 'Ex.: Ideias APP' : 'Ex.: Retornos urgentes'}" />
                                        </label>
                                        <div class="bento-add-inline-actions">
                                            <button type="button" class="btn btn-primary" data-action="confirm-create-pauta">Criar ${pendingWidgetType === 'lista' ? 'lista' : 'tarefas'}</button>
                                            <button type="button" class="btn btn-ghost" data-action="cancel-create-pauta">Cancelar</button>
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        const cells = Array.from({ length: slotCount }, (_, index) => {
            const slotIndex = index + 1;
            const row = Math.floor(index / currentGridColumns) + 1;
            const col = (index % currentGridColumns) + 1;
            const widgetEntry = anchorSlots.get(slotIndex);
            const widgetOccupiesSlot = currentGridState.occupied.has(slotIndex);

            if (widgetEntry) {
                const { widget, placement } = widgetEntry;
                const widgetHtml = widget.type === 'relogio'
                    ? renderClockWidget(widget)
                    : widget.type === 'calendario'
                        ? renderCalendarWidget(widget)
                    : widget.type === 'meta_mes'
                        ? renderMonthlyGoalWidget(widget)
                    : (widget.type === 'pauta' || widget.type === 'lista')
                        ? renderAgendaWidget(widget)
                        : renderResumoWidget(widget);
                return `
                    <div
                        class="bento-grid-slot bento-grid-slot--widget"
                        data-slot-index="${placement.slot}"
                        data-widget-kind="${widget.type}"
                        style="grid-column:${placement.col} / span ${placement.cols}; grid-row:${placement.row} / span ${placement.rows};"
                    >
                        ${widgetHtml}
                    </div>
                `;
            }

            if (widgetOccupiesSlot) return '';

            return `
                <div
                    class="bento-grid-slot bento-grid-slot--empty"
                    data-slot-index="${slotIndex}"
                    style="grid-column:${col}; grid-row:${row};"
                >
                    <div class="bento-drop-slot" aria-hidden="true"></div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <section class="bento-grid bento-grid--dashboard animate-fade-in" id="dashboard-bento-grid">
                ${cells}
            </section>
        `;
    };

    const bindActions = () => {
        const handleActionClick = (event) => {
            const target = event.target;
            const actionElement = target.closest('[data-action]');
            const action = actionElement?.dataset.action;

            if (action === 'toggle-add-widget-menu') {
                event.stopPropagation();
                addWidgetMenuOpen = !addWidgetMenuOpen;
                pendingWidgetType = null;
                openWidgetMenuId = null;
                openEditorWidgetId = null;
                openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
                openTaskMenuKey = null;
                render();
                return;
            }

            if (action === 'create-widget') {
                event.stopPropagation();
                const widgetType = actionElement.dataset.widgetType;
                if (widgetType === 'pauta' || widgetType === 'lista') {
                    pendingWidgetType = pendingWidgetType === widgetType ? null : widgetType;
                    render();
                    const nextInput = actionHost?.querySelector('[data-field="new-pauta-title"]');
                    nextInput?.focus();
                    return;
                }
                createWidget(widgetType);
                return;
            }

            if (action === 'confirm-create-pauta') {
                event.stopPropagation();
                const title = String(actionHost?.querySelector('[data-field="new-pauta-title"]')?.value || '').trim();
                if (!title) return;
                createWidget(pendingWidgetType || 'pauta', { title });
                return;
            }

            if (action === 'cancel-create-pauta') {
                event.stopPropagation();
                pendingWidgetType = null;
                openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
                render();
                return;
            }

            if (action === 'open-agenda-add-item') {
                event.stopPropagation();
                const widgetId = actionElement.dataset.widgetId;
                openWidgetMenuId = null;
                openTaskMenuKey = null;
                openEditorWidgetId = widgetId;
                openEditorMode = DASHBOARD_EDITOR_MODE_AGENDA_ITEM;
                clearAgendaDraft(widgetId);
                render();
                return;
            }

            if (action === 'toggle-widget-menu') {
                event.stopPropagation();
                const widgetId = actionElement.dataset.widgetId;
                openWidgetMenuId = openWidgetMenuId === widgetId ? null : widgetId;
                openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
                openTaskMenuKey = null;
                render();
                return;
            }

            if (action === 'edit-widget') {
                event.stopPropagation();
                const widgetId = actionElement.dataset.widgetId;
                const widget = getWidgetById(widgetId);
                if (!widget || ['calendario', 'meta_mes'].includes(widget.type)) {
                    openWidgetMenuId = null;
                    render();
                    return;
                }
                openWidgetMenuId = null;
                openEditorWidgetId = openEditorWidgetId === widgetId ? null : widgetId;
                openEditorMode = ['pauta', 'lista'].includes(widget?.type) && openEditorWidgetId !== widgetId
                    ? DASHBOARD_EDITOR_MODE_FULL
                    : DASHBOARD_EDITOR_MODE_NONE;
                openTaskMenuKey = null;
                render();
                return;
            }

            if (action === 'delete-widget') {
                event.stopPropagation();
                deleteWidget(actionElement.dataset.widgetId);
                return;
            }

            if (action === 'toggle-task-menu') {
                event.stopPropagation();
                const key = `${actionElement.dataset.widgetId}:${actionElement.dataset.taskId}`;
                openTaskMenuKey = openTaskMenuKey === key ? null : key;
                render();
                return;
            }

            if (action === 'mark-task-done') {
                event.stopPropagation();
                updateAgendaTaskStatus(actionElement.dataset.widgetId, actionElement.dataset.taskId, 'done');
                return;
            }

            if (action === 'skip-task') {
                event.stopPropagation();
                updateAgendaTaskStatus(actionElement.dataset.widgetId, actionElement.dataset.taskId, 'skipped');
                return;
            }

            if (action === 'edit-task') {
                event.stopPropagation();
                beginAgendaTaskEdit(actionElement.dataset.widgetId, actionElement.dataset.taskId);
                return;
            }

            if (action === 'delete-task') {
                event.stopPropagation();
                deleteAgendaTask(actionElement.dataset.widgetId, actionElement.dataset.taskId);
                return;
            }

            if (action === 'save-agenda-task') {
                event.stopPropagation();
                addOrUpdateAgendaTask(actionElement.dataset.widgetId);
                return;
            }

            if (action === 'cancel-agenda-task') {
                event.stopPropagation();
                clearAgendaDraft(actionElement.dataset.widgetId);
                openEditorMode = DASHBOARD_EDITOR_MODE_AGENDA_ITEM;
                render();
                return;
            }

            if (
                target.closest('.bento-add-wrap')
                || target.closest('.bento-widget-actions')
                || target.closest('.bento-widget-editor')
                || target.closest('.bento-agenda-item-actions')
            ) {
                return;
            }
            if (!addWidgetMenuOpen && !openWidgetMenuId && !openEditorWidgetId && !openTaskMenuKey) return;
            addWidgetMenuOpen = false;
            pendingWidgetType = null;
            openWidgetMenuId = null;
            openEditorWidgetId = null;
            openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
            openTaskMenuKey = null;
            render();
        };

        container.onclick = handleActionClick;
        if (actionHost) actionHost.onclick = handleActionClick;

        container.onchange = (event) => {
            const checkbox = event.target.closest('[data-action="toggle-summary-option"]');
            if (checkbox) {
                updateResumoOption(checkbox.dataset.widgetId, checkbox.dataset.optionKey, checkbox.checked);
                return;
            }

            const radio = event.target.closest('[data-action="change-clock-mode"]');
            if (radio) {
                updateClockMode(radio.dataset.widgetId, radio.value);
                return;
            }

            const titleInput = event.target.closest('[data-action="change-agenda-title"]');
            if (titleInput) {
                openEditorMode = DASHBOARD_EDITOR_MODE_FULL;
                updateAgendaTitle(titleInput.dataset.widgetId, titleInput.value);
                return;
            }

            const priorityInput = event.target.closest('[data-field="agenda-priority"]');
            if (!priorityInput) return;
            const editor = priorityInput.closest('[data-editor-widget-id]');
            const dateInput = editor?.querySelector('[data-field="agenda-date"]');
            if (dateInput) dateInput.disabled = priorityInput.value !== 'date';
        };

        const handleActionKeyDown = (event) => {
            const target = event.target;

            if (event.key === 'Escape') {
                if (target.closest('[data-field="new-pauta-title"]')) {
                    event.preventDefault();
                    pendingWidgetType = null;
                    render();
                    return;
                }

                const editor = target.closest('[data-editor-widget-id]');
                if (editor) {
                    event.preventDefault();
                    const widgetId = editor.dataset.editorWidgetId;
                    clearAgendaDraft(widgetId);
                    openEditorWidgetId = null;
                    openEditorMode = DASHBOARD_EDITOR_MODE_NONE;
                    render();
                }
                return;
            }

            if (event.key !== 'Enter' || event.shiftKey) return;

            if (target.closest('[data-field="new-pauta-title"]')) {
                const title = String(target.value || '').trim();
                if (!title) return;
                event.preventDefault();
                createWidget(pendingWidgetType || 'pauta', { title });
                return;
            }

            const editor = target.closest('[data-editor-widget-id]');
            if (!editor) return;
            if (target.matches('[data-action="change-agenda-title"]')) return;
            if (target.tagName === 'TEXTAREA') return;

            event.preventDefault();
            addOrUpdateAgendaTask(editor.dataset.editorWidgetId);
        };

        container.onpointerdown = (event) => {
            if (event.button !== 0) return;
            const card = event.target.closest('[data-widget-id]');
            if (!card) return;
            if (event.target.closest('[data-action]') || event.target.closest('.bento-widget-editor')) return;

            event.preventDefault();
            clearPendingDrag();
            pendingDragWidgetId = card.dataset.widgetId;
            pendingDragPointerId = event.pointerId;
            dragOriginX = event.clientX;
            dragOriginY = event.clientY;
            card.setPointerCapture?.(event.pointerId);
            pendingDragTimer = window.setTimeout(() => {
                const liveCard = container.querySelector(`[data-widget-id="${card.dataset.widgetId}"]`);
                if (!liveCard) {
                    clearPendingDrag();
                    return;
                }
                activateDrag(liveCard, event.pointerId, dragOriginX, dragOriginY);
            }, 700);
        };

        container.onpointermove = (event) => {
            if (!draggingWidgetId && pendingDragWidgetId === event.target.closest('[data-widget-id]')?.dataset.widgetId && pendingDragPointerId === event.pointerId) {
                const distance = Math.hypot(event.clientX - dragOriginX, event.clientY - dragOriginY);
                if (distance > 8) {
                    clearPendingDrag();
                }
                return;
            }
            if (!draggingWidgetId && pendingDragPointerId === event.pointerId) {
                const distance = Math.hypot(event.clientX - dragOriginX, event.clientY - dragOriginY);
                if (distance > 8) clearPendingDrag();
                return;
            }
            if (!draggingWidgetId || activePointerId !== event.pointerId) return;
            const draggedCard = container.querySelector(`[data-widget-id="${draggingWidgetId}"]`);
            const draggedWidget = getWidgetById(draggingWidgetId);
            if (!draggedCard || !draggedWidget) return;

            const translateX = event.clientX - dragOriginX;
            const translateY = event.clientY - dragOriginY;
            draggedCard.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(1.02)`;

            clearDropTargets();
            const slotIndex = resolveDropSlotIndex(event.clientX, event.clientY);
            const span = getDashboardWidgetSpan(draggedWidget, currentGridColumns);
            if (!Number.isFinite(slotIndex) || slotIndex < 1) {
                dropTargetSlotIndex = null;
                return;
            }
            const normalizedSlot = getDashboardPlacementForSlot(slotIndex, span.cols, currentGridColumns).slot;
            dropTargetSlotIndex = normalizedSlot;
            const targetSlot = container.querySelector(`[data-slot-index="${normalizedSlot}"]`);
            targetSlot?.classList.add('is-drop-target');
        };

        container.onpointerup = (event) => {
            if (!draggingWidgetId && pendingDragPointerId === event.pointerId) {
                clearPendingDrag();
                return;
            }
            if (!draggingWidgetId || activePointerId !== event.pointerId) return;
            finishDrag(event.clientX, event.clientY);
        };

        container.onpointercancel = (event) => {
            if (!draggingWidgetId && pendingDragPointerId === event.pointerId) {
                clearPendingDrag();
                return;
            }
            if (!draggingWidgetId || activePointerId !== event.pointerId) return;
            finishDrag(undefined, undefined);
        };

        container.onkeydown = handleActionKeyDown;
        if (actionHost) actionHost.onkeydown = handleActionKeyDown;
    };

    const render = () => {
        try {
            if (clockTicker) {
                clearInterval(clockTicker);
                clockTicker = null;
            }
            renderWidgets();
            bindActions();
            startClockTicker();
        } catch (error) {
            reportDashboardError('dashboard-render', error, { storageKey });
            container.innerHTML = `
                <div class="glass-card" style="padding: 1.2rem;">
                    <p class="label-tech" style="color: var(--rose-500);">ERRO NO PAINEL</p>
                    <p style="margin-top: 0.5rem; color: var(--slate-600);">Nao foi possivel renderizar os widgets.</p>
                </div>
            `;
        }
    };

    if (container.__dashboardResizeHandler) {
        window.removeEventListener('resize', container.__dashboardResizeHandler);
    }
    container.__dashboardResizeHandler = () => render();
    window.addEventListener('resize', container.__dashboardResizeHandler);

    render();
}

function renderFinanceiroView(container, storageKey = FINANCE_STORAGE_KEY) {
    const defaultFinanceState = {
        version: 1,
        userScoped: true,
        categories: [],
        entries: [],
        snapshots: [],
        updatedAt: null
    };
    const existingState = loadUserScopedJsonStorage(storageKey, null);
    const financeState = existingState && typeof existingState === 'object'
        ? {
            ...defaultFinanceState,
            ...existingState,
            userScoped: true
        }
        : defaultFinanceState;

    if (!existingState) {
        saveUserScopedJsonStorage(storageKey, financeState);
    }

    container.innerHTML = `
        <div class="animate-fade-in" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6rem 0;">
            <div style="width: 120px; height: 120px; background: #FFF1F2; border-radius: 32px; display: flex; align-items: center; justify-content: center; margin-bottom: 2rem;">
                <div style="width: 40px; height: 40px; border: 4px solid #F43F5E; border-radius: 999px;"></div>
            </div>
            <h2 class="font-black" style="font-size: 2rem; color: var(--slate-950);">Financeiro individual preparado.</h2>
            <p class="label-tech" style="margin-top: 1rem;">BASE PRIVADA POR USUARIO</p>
            <p style="margin-top: 0.9rem; max-width: 520px; text-align: center; color: var(--slate-600); line-height: 1.6;">
                Esta area ja nasce isolada por usuario. Nenhum dado financeiro sera compartilhado entre contas, mesmo quando o modulo for ativado no DOC do administrador.
            </p>
            <p style="margin-top: 0.8rem; font-size: 0.82rem; color: var(--slate-500);">
                Storage: <strong>${storageKey}</strong> • Versao: ${financeState.version}
            </p>
        </div>
    `;
}

function iconMoreDots() {
    return `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="6.5" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="17.5" r="1.5" fill="currentColor"/>
        </svg>
    `;
}

function iconPlusWidget() {
    return `
        <svg width="22" height="18" viewBox="0 0 28 24" fill="none" aria-hidden="true">
            <rect x="2.5" y="3" width="6.5" height="6.5" stroke="currentColor" stroke-width="2"/>
            <rect x="11.75" y="3" width="6.5" height="6.5" stroke="currentColor" stroke-width="2"/>
            <rect x="11.75" y="12.25" width="6.5" height="6.5" stroke="currentColor" stroke-width="2"/>
            <rect x="2.5" y="12.25" width="6.5" height="6.5" stroke="currentColor" stroke-width="2"/>
            <path d="M23 8.5v7" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
            <path d="M19.5 12h7" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
        </svg>
    `;
}

function renderWidgetTypePreview(type) {
    if (type === 'resumo') {
        return `
            <span class="widget-type-preview widget-type-preview--summary">
                <span class="widget-type-preview-kicker"></span>
                <span class="widget-type-preview-grid">
                    <span></span>
                    <span></span>
                    <span class="is-wide"></span>
                </span>
            </span>
        `;
    }

    if (type === 'relogio') {
        return `
            <span class="widget-type-preview widget-type-preview--clock">
                <span class="widget-type-preview-clock-face"></span>
                <span class="widget-type-preview-clock-hand is-hour"></span>
                <span class="widget-type-preview-clock-hand is-minute"></span>
            </span>
        `;
    }

    if (type === 'calendario') {
        return `
            <span class="widget-type-preview widget-type-preview--calendar">
                <span class="widget-type-preview-calendar-head"></span>
                <span class="widget-type-preview-calendar-grid">
                    <i></i><i></i><i></i><i></i><i></i><i></i><i></i>
                    <i></i><i></i><i></i><i></i><i></i><i></i><i class="is-today"></i>
                </span>
            </span>
        `;
    }

    if (type === 'meta_mes') {
        return `
            <span class="widget-type-preview widget-type-preview--goal">
                <span class="widget-type-preview-goal-kicker"></span>
                <span class="widget-type-preview-goal-value"></span>
                <span class="widget-type-preview-goal-copy"></span>
            </span>
        `;
    }

    if (type === 'pauta') {
        return `
            <span class="widget-type-preview widget-type-preview--tasks">
                <span class="widget-type-preview-row"><i></i><span></span><strong></strong></span>
                <span class="widget-type-preview-row"><i></i><span></span><strong></strong></span>
                <span class="widget-type-preview-row"><i></i><span></span><strong></strong></span>
            </span>
        `;
    }

    if (type === 'lista') {
        return `
            <span class="widget-type-preview widget-type-preview--list">
                <span class="widget-type-preview-row"><i></i><span></span></span>
                <span class="widget-type-preview-row"><i></i><span></span></span>
                <span class="widget-type-preview-row"><i></i><span></span></span>
            </span>
        `;
    }

    return '';
}

const RAL_STORAGE_KEY = 'app-control-ral-workspaces-v1';
const RAL_CHECK_FIELDS = ['avisado', 'dadosOk', 'pagamento', 'artPaga', 'ralEnviado'];
const CENTRAL_TITULARES_DB = [
    { id: 't1', nome: 'Ana Paula Silva', cpf: '111.222.333-44' },
    { id: 't2', nome: 'Bruno Moreira Lima', cpf: '222.333.444-55' },
    { id: 't3', nome: 'Camila Rocha Souza', cpf: '333.444.555-66' },
    { id: 't4', nome: 'Diego Fernandes Costa', cpf: '444.555.666-77' },
    { id: 't5', nome: 'Eduarda Teixeira Gomes', cpf: '555.666.777-88' },
    { id: 't6', nome: 'Felipe Martins Prado', cpf: '666.777.888-99' }
];

function createLocalId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `ral-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadRalWorkspaces() {
    try {
        const parsed = JSON.parse(localStorage.getItem(RAL_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
        return [];
    }
}

function saveRalWorkspaces(workspaces) {
    localStorage.setItem(RAL_STORAGE_KEY, JSON.stringify(workspaces));
}

function getRalProgress(titular) {
    const checkedCount = RAL_CHECK_FIELDS.filter((field) => Boolean(titular[field])).length;
    return checkedCount * 20;
}

function renderRalControlPanel(root) {
    let workspaces = loadRalWorkspaces();
    let selectedTagId = null;
    let showAddTitular = false;
    let titularSearchTerm = '';

    const persist = () => {
        saveRalWorkspaces(workspaces);
    };

    const deleteTag = (tagId) => {
        workspaces = workspaces.filter((tag) => tag.id !== tagId);
        if (selectedTagId === tagId) {
            selectedTagId = null;
            showAddTitular = false;
            titularSearchTerm = '';
        }
        persist();
        render();
    };

    const addTitularToTag = (tagId, titularBase) => {
        workspaces = workspaces.map((tag) => {
            if (tag.id !== tagId) return tag;
            if (tag.titulares.some((item) => item.cpf === titularBase.cpf)) return tag;

            return {
                ...tag,
                titulares: [
                    ...tag.titulares,
                    {
                        id: createLocalId(),
                        nome: titularBase.nome,
                        cpf: titularBase.cpf,
                        avisado: false,
                        dadosOk: false,
                        pagamento: false,
                        artPaga: false,
                        ralEnviado: false
                    }
                ]
            };
        });
        persist();
        titularSearchTerm = '';
        render();
    };

    const toggleCheck = (tagId, titularId, field) => {
        workspaces = workspaces.map((tag) => {
            if (tag.id !== tagId) return tag;
            return {
                ...tag,
                titulares: tag.titulares.map((titular) => (
                    titular.id === titularId ? { ...titular, [field]: !titular[field] } : titular
                ))
            };
        });
        persist();
        render();
    };

    const renderPreview = () => {
        const cardsHtml = workspaces.map((tag) => {
            const totalProgress = tag.titulares.reduce((sum, titular) => sum + getRalProgress(titular), 0);
            const avgProgress = tag.titulares.length ? Math.round(totalProgress / tag.titulares.length) : 0;
            return `
                <button class="glass-card ral-tag-preview" data-tag-open="${tag.id}" style="padding: 1rem; text-align: left; width: 100%; border: 1px solid var(--slate-200); cursor: pointer;">
                    <p class="label-tech" style="font-size: 8px;">TAG RAL</p>
                    <h4 class="font-black" style="font-size: 1.1rem; margin-top: 0.35rem;">${tag.title}</h4>
                    <p style="margin-top: 0.35rem; color: var(--slate-500); font-size: 0.9rem;">Titulares: ${tag.titulares.length} • Progresso médio: ${avgProgress}%</p>
                </button>
            `;
        }).join('');

        root.innerHTML = `
            <div class="glass-card animate-fade-in" style="padding: 1.25rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                    <div>
                        <p class="label-tech" style="font-size: 8px;">WORKSPACE RAL</p>
                        <h3 class="font-black" style="font-size: 1.35rem;">Controle de TAGs</h3>
                    </div>
                </div>

                ${workspaces.length ? `
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 0.9rem;">
                        ${cardsHtml}
                    </div>
                ` : `
                    <div style="border: 1px dashed var(--slate-300); border-radius: 14px; padding: 1.5rem; text-align: center; color: var(--slate-500);">
                        Nenhuma TAG criada ainda.
                    </div>
                `}
            </div>
        `;

        root.querySelectorAll('[data-tag-open]').forEach((btn) => {
            btn.addEventListener('click', () => {
                selectedTagId = btn.getAttribute('data-tag-open');
                showAddTitular = false;
                titularSearchTerm = '';
                render();
            });
        });
    };

    const renderExpandedTag = (tag) => {
        const filteredTitulares = CENTRAL_TITULARES_DB.filter((titular) => {
            const searchText = titularSearchTerm.trim().toLowerCase();
            if (!searchText) return true;
            return `${titular.nome} ${titular.cpf}`.toLowerCase().includes(searchText);
        });

        const titularesRows = tag.titulares.map((titular) => {
            const progress = getRalProgress(titular);
            const progressColor = progress === 100 ? '#16A34A' : 'var(--primary)';
            return `
                <tr style="border-top: 1px solid var(--slate-200);">
                    <td style="padding: 0.8rem; min-width: 220px;">
                        <p class="font-black" style="font-size: 0.95rem;">${titular.nome}</p>
                        <p class="label-tech" style="font-size: 8px;">${titular.cpf}</p>
                    </td>
                    ${RAL_CHECK_FIELDS.map((field) => `
                        <td style="padding: 0.6rem; text-align: center;">
                            <button data-toggle-check="${tag.id}|${titular.id}|${field}" style="width: 28px; height: 28px; border-radius: 8px; border: 1px solid ${titular[field] ? '#86EFAC' : 'var(--slate-300)'}; background: ${titular[field] ? '#DCFCE7' : 'var(--input-bg)'}; color: ${titular[field] ? '#15803D' : 'var(--slate-400)'}; cursor: pointer; font-weight: 800;">
                                ${titular[field] ? '✓' : '○'}
                            </button>
                        </td>
                    `).join('')}
                    <td style="padding: 0.8rem; min-width: 180px;">
                        <div style="height: 8px; border-radius: 999px; background: var(--slate-200); overflow: hidden;">
                            <div style="height: 100%; width: ${progress}%; background: ${progressColor};"></div>
                        </div>
                        <p class="label-tech" style="font-size: 8px; margin-top: 0.35rem;">${progress}%</p>
                    </td>
                </tr>
            `;
        }).join('');

        const resultOptions = filteredTitulares.map((titular) => `
            <button data-add-titular="${tag.id}|${titular.id}" style="width: 100%; text-align: left; border: none; border-bottom: 1px solid var(--slate-100); background: var(--card-bg); color: var(--slate-900); padding: 0.65rem 0.8rem; cursor: pointer;">
                <span style="font-weight: 700; font-size: 0.9rem;">${titular.nome}</span>
                <span style="float: right; color: var(--slate-500); font-size: 0.8rem;">${titular.cpf}</span>
            </button>
        `).join('');

        root.innerHTML = `
            <div class="glass-card animate-fade-in" style="padding: 1.25rem;">
                <button id="ral-back-preview" style="display: inline-flex; align-items: center; gap: 0.35rem; border: none; background: transparent; color: var(--primary); font-weight: 700; cursor: pointer; margin-bottom: 0.9rem;">
                    ← Voltar ao Painel
                </button>
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                    <div>
                        <p class="label-tech" style="font-size: 8px;">TAG EXPANDIDA</p>
                        <h3 class="font-black" style="font-size: 1.35rem;">${tag.title}</h3>
                    </div>
                    <button id="ral-delete-tag" style="border: 1px solid #FECACA; color: #B91C1C; background: #FFF1F2; border-radius: 10px; padding: 0.55rem 0.85rem; cursor: pointer; font-weight: 700;">
                        Excluir TAG
                    </button>
                </div>
                <div style="margin-bottom: 1rem;">
                    <button id="ral-toggle-add-titular" style="background: var(--primary); color: white; border: none; border-radius: 10px; padding: 0.55rem 0.85rem; cursor: pointer; font-weight: 700;">
                        + Adicionar Titular
                    </button>
                </div>

                ${showAddTitular ? `
                    <div style="margin-bottom: 1rem;">
                        <input id="ral-search-titular" type="text" placeholder="Buscar titular por nome ou CPF" value="${titularSearchTerm.replace(/"/g, '&quot;')}" style="height: 42px; width: 100%; border: 1px solid var(--slate-300); border-radius: 10px; padding: 0 0.7rem; background: var(--bg-main);" />
                        <div style="max-height: 190px; overflow-y: auto; border: 1px solid var(--slate-200); border-radius: 10px; margin-top: 0.55rem;">
                            ${resultOptions || '<p style="padding: 1rem; color: var(--slate-500);">Nenhum titular encontrado.</p>'}
                        </div>
                    </div>
                ` : ''}

                ${tag.titulares.length ? `
                    <div style="overflow-x: auto; border: 1px solid var(--slate-200); border-radius: 12px;">
                        <table style="width: 100%; min-width: 980px; border-collapse: collapse;">
                            <thead style="background: var(--bg-main);">
                                <tr>
                                    <th style="padding: 0.75rem; text-align: left;">Nome do Titular</th>
                                    <th style="padding: 0.75rem; text-align: center;">Avisado</th>
                                    <th style="padding: 0.75rem; text-align: center;">Dados OK</th>
                                    <th style="padding: 0.75rem; text-align: center;">Pagamento</th>
                                    <th style="padding: 0.75rem; text-align: center;">ART Paga</th>
                                    <th style="padding: 0.75rem; text-align: center;">RAL Enviado</th>
                                    <th style="padding: 0.75rem; text-align: left;">Status de Progresso</th>
                                </tr>
                            </thead>
                            <tbody>${titularesRows}</tbody>
                        </table>
                    </div>
                ` : `
                    <div style="border: 1px dashed var(--slate-300); border-radius: 14px; padding: 1.5rem; text-align: center; color: var(--slate-500);">
                        Esta TAG está vazia. Use "Adicionar Titular" para importar da base centralizada.
                    </div>
                `}
            </div>
        `;

        const backBtn = root.querySelector('#ral-back-preview');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                selectedTagId = null;
                showAddTitular = false;
                titularSearchTerm = '';
                render();
            });
        }

        const removeBtn = root.querySelector('#ral-delete-tag');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => deleteTag(tag.id));
        }

        const toggleAddTitularBtn = root.querySelector('#ral-toggle-add-titular');
        if (toggleAddTitularBtn) {
            toggleAddTitularBtn.addEventListener('click', () => {
                showAddTitular = !showAddTitular;
                render();
            });
        }

        const searchTitularInput = root.querySelector('#ral-search-titular');
        if (searchTitularInput) {
            searchTitularInput.addEventListener('input', (event) => {
                titularSearchTerm = event.target.value;
                render();
            });
        }

        root.querySelectorAll('[data-add-titular]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const [, titularBaseId] = btn.getAttribute('data-add-titular').split('|');
                const titularBase = CENTRAL_TITULARES_DB.find((item) => item.id === titularBaseId);
                if (!titularBase) return;
                addTitularToTag(tag.id, titularBase);
            });
        });

        root.querySelectorAll('[data-toggle-check]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const [, titularId, field] = btn.getAttribute('data-toggle-check').split('|');
                toggleCheck(tag.id, titularId, field);
            });
        });
    };

    const render = () => {
        const currentTag = workspaces.find((tag) => tag.id === selectedTagId);
        if (currentTag) {
            renderExpandedTag(currentTag);
            return;
        }
        renderPreview();
    };

    render();
}

function getSectionIcon(id) {
    const icons = {
        painel: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
        clientes: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
        processos: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>`,
        prazos: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><circle cx="16" cy="16" r="3"></circle><path d="M16 14v2l1 1"></path></svg>`,
        financeiro: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path><circle cx="12" cy="12" r="10" stroke-opacity="0.2"></circle></svg>`,
        configuracoes: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`
        ,
        equipe: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`
    };
    return icons[id] || '';
}

function renderEmptyState(container, id) {
    const colors = {
        financeiro: { bg: '#FFF1F2', text: '#F43F5E' },
        configuracoes: { bg: '#F1F5F9', text: '#475569' }
    };
    const style = colors[id] || { bg: '#F1F5F9', text: '#475569' };

    container.innerHTML = `
        <div class="animate-fade-in" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6rem 0;">
            <div style="width: 120px; height: 120px; background: ${style.bg}; border-radius: 32px; display: flex; align-items: center; justify-content: center; margin-bottom: 2rem;">
                <div style="width: 40px; height: 40px; border: 4px solid ${style.text}; border-radius: 8px;"></div>
            </div>
            <h2 class="font-black" style="font-size: 2rem; color: var(--slate-950);">Nada por aqui ainda.</h2>
            <p class="label-tech" style="margin-top: 1rem;">MÓDULO ${id.toUpperCase()} EM DESENVOLVIMENTO</p>
        </div>
    `;
}

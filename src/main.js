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
    canDeleteContent,
    canEditContent,
    canViewSection,
    hasAdminAccess
} from './utils/accessControl.js';

const THEME_STORAGE_KEY = 'app-control-theme';
const AVAILABLE_THEMES = ['niobio', 'diamante', 'topazio', 'ouro', 'prata', 'esmeralda'];
const ALERT_STORAGE_KEY = 'app-control-alert-days';
const LOGIN_ROUTE = '/';
const APP_ROUTE = '/app';
const AUTH_DEBUG = true;

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
            const [profile] = await Promise.all([
                profileService.getProfile(currentSession.user.id),
                clientStore.load(!hasRenderedProtectedApp),
                processStore.load(!hasRenderedProtectedApp)
            ]);
            currentProfile = profile;
            if (hasAdminAccess(currentProfile)) {
                teamProfiles = await profileService.listProfiles();
            } else {
                teamProfiles = [];
            }
            authLog('profile sync complete', {
                renderId,
                role: currentProfile?.role,
                hasRenderedProtectedApp
            });
        } catch (error) {
            if (renderId !== renderSequence) {
                authLog('renderRoute:stale-error-ignored', { renderId, activeRenderId: renderSequence });
                return;
            }
            authLog('renderRoute:error', error);
            app.innerHTML = `
                <main id="main-content" style="padding: 3rem 2rem;">
                    <div class="glass-card" style="max-width: 760px; margin: 0 auto; padding: 2rem;">
                        <p class="label-tech" style="color: var(--rose-500);">ERRO DE INTEGRAÇÃO</p>
                        <h1 class="font-black" style="font-size: 2rem; margin-top: 0.5rem;">Não foi possível carregar o painel protegido.</h1>
                        <p style="color: var(--slate-500); margin-top: 1rem; line-height: 1.6;">${error?.message || 'Verifique a autenticação e a estrutura do banco no Supabase.'}</p>
                    </div>
                </main>
            `;
            return;
        }

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
                    <div id="view-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2.5rem;">
                    <div id="view-title-group" style="display: flex; align-items: center; gap: 1rem;">
                        <div id="view-icon" class="view-icon-shell"></div>
                        <div>
                            <p class="label-tech">Workspace</p>
                            <h1 id="page-title" class="font-black" style="font-size: 2rem; text-transform: uppercase; margin-top: 0.35rem;">Painel Central</h1>
                        </div>
                    </div>
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
        const pageTitle = document.getElementById('page-title');
        const viewIcon = document.getElementById('view-icon');
        const viewActions = document.getElementById('view-actions');

        const navigate = (id) => {
            authLog('navigate:requested', { id, currentSection });
            contentArea.innerHTML = '';
            viewActions.innerHTML = '';
            viewActions.style.display = '';

            if (id !== 'equipe' && !canViewSection(currentProfile, id)) {
                authLog('navigate:blocked by permission', { id, role: currentProfile?.role });
                showNoticeModal('Acesso restrito', 'Seu perfil não possui acesso a esta área.');
                navigate('painel');
                return;
            }

            currentSection = id;
            document.querySelectorAll('.dock-item').forEach((item) => {
                item.classList.toggle('active', item.dataset.id === id);
            });

            const sectionMap = {
                painel: { title: 'Painel Central', icon: getSectionIcon('painel') },
                clientes: { title: 'Titulares', icon: getSectionIcon('clientes') },
                processos: { title: 'Processos', icon: getSectionIcon('processos') },
                prazos: { title: 'Prazos', icon: getSectionIcon('prazos') },
                financeiro: { title: 'Financeiro', icon: getSectionIcon('financeiro') },
                configuracoes: { title: 'Configurações', icon: getSectionIcon('configuracoes') },
                equipe: { title: 'Configurações de Equipe', icon: getSectionIcon('equipe') }
            };

            const section = sectionMap[id] || { title: id, icon: '' };
            pageTitle.textContent = section.title;
            viewIcon.innerHTML = section.icon;

            if (id === 'painel') {
                renderDashboard(contentArea);
            } else if (id === 'clientes') {
                renderClientesView(contentArea, viewActions);
            } else if (id === 'processos') {
                renderProcessosView(contentArea, viewActions);
            } else if (id === 'prazos') {
                renderDeadlineDashboard(contentArea, {
                    canEdit: canEditContent(currentProfile)
                });
            } else if (id === 'configuracoes') {
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
            } else if (id === 'equipe') {
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

function renderDashboard(container) {
    const totalPendingDeadlines = processStore.processes.reduce((count, process) => (
        count + (process.deadlines || []).filter((deadline) => deadline.status === 'pending').length
    ), 0);

    container.innerHTML = `
        <div class="stats-grid animate-fade-in" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; margin-bottom: 1.5rem;">
            <div class="glass-card stat-card" style="padding: 1.25rem;">
                <p class="label-tech" style="font-size: 9px;">TOTAL TITULARES</p>
                <h3 class="font-black" style="font-size: 1.75rem;">${clientStore.clients.length}</h3>
            </div>
            <div class="glass-card stat-card" style="padding: 1.25rem;">
                <p class="label-tech" style="font-size: 9px;">PROCESSOS ATIVOS</p>
                <h3 class="font-black" style="font-size: 1.75rem; color: var(--primary);">${processStore.processes.length}</h3>
            </div>
            <div class="glass-card stat-card" style="padding: 1.25rem;">
                <p class="label-tech" style="font-size: 9px;">PRAZOS CRÍTICOS</p>
                <h3 class="font-black" style="font-size: 1.75rem; color: var(--rose-500);">${totalPendingDeadlines}</h3>
            </div>
            <div class="glass-card stat-card" style="padding: 1.25rem;">
                <p class="label-tech" style="font-size: 9px;">FATURAMENTO MÊS</p>
                <h3 class="font-black" style="font-size: 1.75rem;">R$ 42k</h3>
            </div>
        </div>
        <div style="display: grid; grid-template-columns: 2.5fr 1fr; gap: 1.5rem;">
            <div class="glass-card animate-fade-in">
                <h3 class="font-black" style="font-size: 1.5rem; margin-bottom: 1rem;">Visão Geral da GEOCONSULT</h3>
                <p style="color: var(--slate-500); line-height: 1.6;">
                    Seu ecossistema de gestão está operando normalmente. Esta visualização protegida concentra titulares, processos e prazos com autenticação integrada ao Supabase.
                </p>
                <div style="margin-top: 2rem; height: 100px; border-radius: 16px; background: var(--bg-main); border: 1px dashed var(--slate-200); display: flex; align-items: center; justify-content: center;">
                    <p class="label-tech">GRÁFICO DE DESEMPENHO EM BREVE</p>
                </div>
            </div>
            <div class="glass-card animate-fade-in">
                <h3 class="font-black" style="font-size: 1.2rem; margin-bottom: 1rem;">Status do Ambiente</h3>
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div style="padding-bottom: 1rem; border-bottom: 1px solid var(--slate-200);">
                        <p class="font-black" style="font-size: 0.9rem;">Autenticação protegida</p>
                        <p class="label-tech" style="font-size: 8px;">SUPABASE AUTH ATIVO</p>
                    </div>
                    <div style="padding-bottom: 1rem; border-bottom: 1px solid var(--slate-200);">
                        <p class="font-black" style="font-size: 0.9rem;">Banco conectado</p>
                        <p class="label-tech" style="font-size: 8px;">CRUD ONLINE</p>
                    </div>
                </div>
            </div>
        </div>
    `;
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

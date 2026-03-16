import './styles/main.css';
import { renderHeader, initHeaderMenu } from './components/Header.js';
import { renderDock, initDock } from './components/Dock.js';
import { processStore } from './utils/ProcessStore.js';
import { clientStore } from './utils/ClientStore.js';
import { authService } from './utils/AuthService.js';
import { profileService } from './utils/ProfileService.js';
import { showNoticeModal } from './components/NoticeModal.js';
import { createAppRuntimeState } from './app/appRuntimeState.js';
import { resetActiveOrganizationId, setActiveOrganizationId } from './app/organizationContext.js';
import {
    getUserScopedStorageKey
} from './dashboard/userScopedStorage.js';
import {
    canDeleteContent,
    canEditContent,
    canViewSection,
    hasAdminAccess,
    hasOfficeAdminAccess,
    hasSuperAdminAccess
} from './utils/accessControl.js';
import {
    reportUiError,
    reportUiEvent,
    installGlobalUiErrorHandlers
} from './utils/uiTelemetry.js';

const THEME_STORAGE_KEY = 'app-control-theme';
const AVAILABLE_THEMES = ['niobio', 'diamante', 'topazio', 'ouro', 'esmeralda'];
const ALERT_STORAGE_KEY = 'app-control-alert-days';
const DASHBOARD_WIDGETS_STORAGE_KEY = 'app-control-dashboard-widgets-v1';
const FINANCE_STORAGE_KEY = 'app-control-finance-v1';
const LOGIN_ROUTE = '/';
const APP_ROUTE = '/app';
const AUTH_DEBUG = false;
const componentModuleCache = new Map();

function getE2EOverrides() {
    if (typeof window === 'undefined') return null;
    const overrides = window.__APP_CONTROL_E2E__;
    if (overrides && typeof overrides === 'object') return overrides;
    try {
        const serialized = window.localStorage.getItem('app-control-e2e-runtime');
        if (!serialized) return null;
        const parsed = JSON.parse(serialized);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function cloneE2EValue(value, fallback) {
    if (value == null) return fallback;
    return JSON.parse(JSON.stringify(value));
}

function hydrateStoresFromE2E(overrides) {
    const mockClients = Array.isArray(overrides?.clients) ? cloneE2EValue(overrides.clients, []) : [];
    const mockProcesses = Array.isArray(overrides?.processes) ? cloneE2EValue(overrides.processes, []) : [];

    clientStore.clients = mockClients;
    clientStore.isLoaded = true;
    clientStore.ready = Promise.resolve();

    processStore.processes = mockProcesses;
    processStore.rebuildProjects();
    processStore.sanitizeDeadlines();
    processStore.sanitizeExtractEvents();
    processStore.isLoaded = true;
    processStore.ready = Promise.resolve();
}

function installE2EStoreAdapters() {
    let clientSequence = clientStore.clients.length + 1;
    let processSequence = processStore.processes.length + 1;

    const normalizeClientId = (id) => String(id || `e2e-client-${clientSequence++}`);
    const normalizeProcessId = (id) => String(id || `e2e-process-${processSequence++}`);

    clientStore.addClient = async function addClientE2E(client) {
        this.checkUniqueness(client);
        const created = {
            ...client,
            id: normalizeClientId(client?.id),
            documents: Array.isArray(client?.documents) ? [...client.documents] : []
        };
        this.clients.push(created);
        return created;
    };

    clientStore.updateClient = async function updateClientE2E(id, updatedData) {
        this.checkUniqueness(updatedData, id);
        const currentIndex = this.clients.findIndex((client) => String(client.id) === String(id));
        if (currentIndex === -1) {
            throw new Error('Não foi possível atualizar o titular.');
        }
        const updated = {
            ...this.clients[currentIndex],
            ...updatedData,
            id: this.clients[currentIndex].id,
            documents: Array.isArray(updatedData?.documents)
                ? [...updatedData.documents]
                : [...(this.clients[currentIndex].documents || [])]
        };
        this.clients[currentIndex] = updated;
        return updated;
    };

    clientStore.deleteClient = async function deleteClientE2E(id) {
        const hasLinkedProcess = processStore.processes.some((process) => String(process.clientId) === String(id));
        if (hasLinkedProcess) {
            throw new Error('Não é possível excluir: titular possui processos ou extratos vinculados.');
        }
        const previousLength = this.clients.length;
        this.clients = this.clients.filter((client) => String(client.id) !== String(id));
        return this.clients.length !== previousLength;
    };

    processStore.addProcess = async function addProcessE2E(processData) {
        const project = this.resolveProject(processData);
        const created = {
            ...processData,
            id: normalizeProcessId(processData?.id),
            clientId: String(processData.clientId),
            projectId: project?.id || null,
            projectName: project?.name || '',
            deadlines: Array.isArray(processData?.deadlines)
                ? processData.deadlines.map((deadline, index) => ({
                    ...deadline,
                    id: deadline.id || `${Date.now()}-${index}`,
                    status: deadline.status || 'pending'
                }))
                : [],
            events: Array.isArray(processData?.events)
                ? processData.events.map((event, index) => ({
                    ...event,
                    id: event.id || `${Date.now()}-event-${index}`,
                    documents: Array.isArray(event.documents) ? [...event.documents] : []
                }))
                : []
        };
        created.events = this.syncInitialExtractEvent(created);
        this.processes = [...this.processes, created];
        this.rebuildProjects();
        this.sanitizeDeadlines();
        this.sanitizeExtractEvents();
        return created;
    };

    processStore.updateProcess = async function updateProcessE2E(id, updatedData) {
        const existingProcess = this.processes.find((process) => String(process.id) === String(id));
        if (!existingProcess) return false;

        const project = this.resolveProject({
            clientId: updatedData.clientId || existingProcess.clientId,
            projectId: updatedData.projectId,
            projectName: updatedData.projectName
        });

        const nextProcess = {
            ...existingProcess,
            ...updatedData,
            id: existingProcess.id,
            clientId: String(updatedData.clientId || existingProcess.clientId),
            projectId: project?.id || null,
            projectName: project?.name || '',
            deadlines: (updatedData.deadlines || existingProcess.deadlines || []).map((deadline, index) => ({
                ...deadline,
                id: deadline.id || `${Date.now()}-${index}`,
                status: deadline.status || 'pending'
            })),
            events: (updatedData.events || existingProcess.events || []).map((event, index) => ({
                ...event,
                id: event.id || `${Date.now()}-event-${index}`,
                documents: Array.isArray(event.documents) ? [...event.documents] : []
            }))
        };

        nextProcess.events = this.syncInitialExtractEvent(nextProcess);
        this.processes = this.processes.map((process) => (String(process.id) === String(id) ? nextProcess : process));
        this.rebuildProjects();
        this.sanitizeDeadlines();
        this.sanitizeExtractEvents();
        return true;
    };

    processStore.deleteProcess = async function deleteProcessE2E(id) {
        const previousLength = this.processes.length;
        this.processes = this.processes.filter((process) => String(process.id) !== String(id));
        this.rebuildProjects();
        return this.processes.length !== previousLength;
    };
}

function loadComponentModule(cacheKey, loader) {
    if (!componentModuleCache.has(cacheKey)) {
        componentModuleCache.set(cacheKey, loader());
    }
    return componentModuleCache.get(cacheKey);
}

function loadLoginScreenModule() {
    return loadComponentModule('login-screen', () => import('./components/LoginScreen.js'));
}

function loadClientListModule() {
    return loadComponentModule('client-list', () => import('./components/ClientList.js'));
}

function loadClientFormModule() {
    return loadComponentModule('client-form', () => import('./components/ClientForm.js'));
}

function loadProcessListModule() {
    return loadComponentModule('process-list', () => import('./components/ProcessList.js'));
}

function loadProcessFormModule() {
    return loadComponentModule('process-form', () => import('./components/ProcessForm.js'));
}

function loadProcessDetailsModule() {
    return loadComponentModule('process-details', () => import('./components/ProcessDetails.js'));
}

function loadDeadlineDashboardModule() {
    return loadComponentModule('deadline-dashboard', () => import('./components/DeadlineDashboard.js'));
}

function loadSettingsModule() {
    return loadComponentModule('settings', () => import('./components/Settings.js'));
}

function loadTeamSettingsModule() {
    return loadComponentModule('team-settings', () => import('./components/TeamSettings.js'));
}

function loadFinanceViewModule() {
    return loadComponentModule('finance-view', () => import('./components/FinanceView.js'));
}

function loadDashboardViewModule() {
    return loadComponentModule('dashboard-view', () => import('./components/DashboardView.js'));
}

function loadSettingsMenuViewModule() {
    return loadComponentModule('settings-menu-view', () => import('./components/SettingsMenuView.js'));
}

function loadOrganizationAdminViewModule() {
    return loadComponentModule('organization-admin-view', () => import('./components/OrganizationAdminView.js'));
}

function loadAdminPanelViewModule() {
    return loadComponentModule('admin-panel-view', () => import('./components/AdminPanelView.js'));
}

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
    return `Olá, ${firstName}!`;
}

function renderViewLoading(container, message = 'Carregando modulo...') {
    if (!container) return;
    container.innerHTML = `
        <div class="glass-card" style="padding: 1.25rem 1.5rem;">
            <p class="label-tech">${message}</p>
        </div>
    `;
}

function buildEmergencyProfile(session) {
    return {
        id: session?.user?.id || '',
        email: session?.user?.email || '',
        full_name: '',
        role: 'user',
        organization_id: null,
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
    installGlobalUiErrorHandlers();
    const app = document.getElementById('app');
    const e2eOverrides = getE2EOverrides();
    const state = createAppRuntimeState({
        currentTheme: applyTheme(getStoredTheme()),
        alertLeadDays: getStoredAlertDays()
    });
    let teamProfiles = [];
    let currentOrganizationId = null;

    const renderRoute = async () => {
        const renderId = ++state.renderSequence;
        const isAuthenticated = !!state.currentSession;
        const pathname = window.location.pathname;
        authLog('renderRoute:start', {
            renderId,
            pathname,
            isAuthenticated,
            currentSection: state.currentSection,
            sessionUserId: state.currentSession?.user?.id || null
        });

        if (!isAuthenticated && pathname !== LOGIN_ROUTE) {
            authLog('redirecting to login because no session is present');
            navigateTo(LOGIN_ROUTE, true);
        }

        if (isAuthenticated && pathname === LOGIN_ROUTE) {
            authLog('redirecting to /app because session exists');
            navigateTo(APP_ROUTE, true);
        }

        if (!state.currentSession) {
            document.body.classList.remove('dashboard-active');
            authLog('rendering login screen');
            const { renderLoginScreen } = await loadLoginScreenModule();
            renderLoginScreen(app, async (email, password) => {
                authLog('signInWithPassword:start', { email });
                await authService.signInWithPassword(email, password);
            });
            return;
        }
        document.body.classList.add('dashboard-active');

        if (e2eOverrides?.profile) {
            state.currentProfile = cloneE2EValue(e2eOverrides.profile, buildEmergencyProfile(state.currentSession));
        } else {
            try {
                state.currentProfile = await profileService.getProfile(state.currentSession.user.id);
            } catch (error) {
                authLog('renderRoute:profile-fallback', error?.message || error);
                state.currentProfile = buildEmergencyProfile(state.currentSession);
            }
        }

        setActiveOrganizationId(state.currentProfile?.organization_id || null);
        currentOrganizationId = state.currentProfile?.organization_id || null;

        if (hasSuperAdminAccess(state.currentProfile)) {
            state.currentOrganization = null;
            state.currentOrganizationLoaded = true;
        } else if (e2eOverrides?.organization) {
            state.currentOrganization = cloneE2EValue(e2eOverrides.organization, null);
            state.currentOrganizationLoaded = true;
        } else if (!currentOrganizationId) {
            state.currentOrganization = null;
            state.currentOrganizationLoaded = true;
        } else if (currentOrganizationId && (!state.currentOrganizationLoaded || String(state.currentOrganization?.id || '') !== String(currentOrganizationId))) {
            try {
                state.currentOrganization = await profileService.getCurrentOrganization();
                setActiveOrganizationId(currentOrganizationId, state.currentOrganization?.slug);
            } catch (error) {
                authLog('renderRoute:organization-fallback', error?.message || error);
                state.currentOrganization = null;
            }
            state.currentOrganizationLoaded = true;
        }

        let clientLoadResult;
        let processLoadResult;
        if (e2eOverrides) {
            hydrateStoresFromE2E(e2eOverrides);
            installE2EStoreAdapters();
            clientLoadResult = { status: 'fulfilled' };
            processLoadResult = { status: 'fulfilled' };
        } else {
            [clientLoadResult, processLoadResult] = await Promise.allSettled([
                clientStore.load(!state.hasRenderedProtectedApp),
                processStore.load(!state.hasRenderedProtectedApp)
            ]);
        }

        if (clientLoadResult.status === 'rejected') {
            authLog('renderRoute:client-load-failed', clientLoadResult.reason?.message || clientLoadResult.reason);
            clientStore.reset();
        }

        if (processLoadResult.status === 'rejected') {
            authLog('renderRoute:process-load-failed', processLoadResult.reason?.message || processLoadResult.reason);
            processStore.reset();
        }

        if (!hasAdminAccess(state.currentProfile)) {
            teamProfiles = [];
            state.teamProfilesLoaded = false;
        }

        authLog('profile sync complete', {
            renderId,
            role: state.currentProfile?.role,
            hasRenderedProtectedApp: state.hasRenderedProtectedApp
        });

        if (renderId !== state.renderSequence) {
            authLog('renderRoute:stale-render-skipped', { renderId, activeRenderId: state.renderSequence });
            return;
        }

        renderAuthenticatedApp(state.currentSession);
    };

    let shellRenderedForSession = null;
    const viewCache = new Map();

    const renderAuthenticatedApp = (session) => {
        authLog('renderAuthenticatedApp', {
            currentSection: state.currentSection,
            sessionUserId: session?.user?.id || null
        });
        state.disposeHeaderMenu?.();
        const isAdmin = hasOfficeAdminAccess(state.currentProfile);
        const isSuperAdmin = hasSuperAdminAccess(state.currentProfile);
        const visibleSections = ['organizacoes', 'painel', 'clientes', 'processos', 'prazos', 'financeiro', 'admin-panel', 'configuracoes']
            .filter((sectionId) => canViewSection(state.currentProfile, sectionId, state.currentOrganization?.enabled_modules));
        const displayName = getProfileDisplayName(state.currentProfile, session?.user?.email || '');
        const headerGreeting = getHeaderGreeting(state.currentProfile, session?.user?.email || '');

        if (shellRenderedForSession !== session?.user?.id) {
            app.innerHTML = `
                <div class="dashboard-shell">
                    <div class="dashboard-glow dashboard-glow-a"></div>
                    <div class="dashboard-glow dashboard-glow-b"></div>
                    <div id="shell-header-container"></div>
                    <main id="main-content" style="position: relative; flex: 1; display: flex; flex-direction: column; overflow: hidden; height: 100vh;"></main>
                    <div id="shell-dock-container"></div>
                </div>
            `;
            shellRenderedForSession = session?.user?.id;
            viewCache.clear();
        }

        document.getElementById('shell-header-container').innerHTML = renderHeader({
            email: session?.user?.email || '',
            fullName: displayName,
            greeting: headerGreeting,
            role: state.currentProfile?.role || 'user',
            alertDays: state.alertLeadDays
        });
        
        document.getElementById('shell-dock-container').innerHTML = renderDock({ 
            isAdmin, 
            visibleIds: visibleSections, 
            fullName: displayName, 
            email: session?.user?.email || '' 
        });

        state.disposeHeaderMenu = initHeaderMenu({
            profile: state.currentProfile,
            onProfileSave: async (payload) => {
                try {
                    state.currentProfile = await profileService.updateOwnProfile(payload);
                    showNoticeModal('Dados atualizados', 'Seu perfil foi atualizado com sucesso.');
                    renderAuthenticatedApp(state.currentSession);
                } catch (error) {
                    showNoticeModal('Erro ao atualizar', error?.message || 'Não foi possível atualizar seus dados.');
                }
            },
            onAlertSave: async (days) => {
                state.alertLeadDays = saveAlertDays(days);
                showNoticeModal('Alertas atualizados', `Os avisos de vencimento agora usarão ${state.alertLeadDays} dias de antecedência.`);
                renderAuthenticatedApp(state.currentSession);
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

        // DOM selectors removed tracking individually inside viewCache

        const ensureTeamProfilesLoaded = async (force = false) => {
            if (!hasOfficeAdminAccess(state.currentProfile)) {
                teamProfiles = [];
                state.teamProfilesLoaded = false;
                return [];
            }
            if (state.teamProfilesLoaded && !force) return teamProfiles;
            if (e2eOverrides?.teamProfiles) {
                teamProfiles = cloneE2EValue(e2eOverrides.teamProfiles, []);
                state.teamProfilesLoaded = true;
                return teamProfiles;
            }
            try {
                teamProfiles = await profileService.listProfiles();
                state.teamProfilesLoaded = true;
            } catch (error) {
                authLog('team-load-failed', error?.message || error);
                teamProfiles = [];
                state.teamProfilesLoaded = false;
                throw error;
            }
            return teamProfiles;
        };

        const ensureOrganizationsLoaded = async (force = false) => {
            if (!isSuperAdmin) {
                state.organizations = [];
                state.organizationsLoaded = false;
                return [];
            }
            if (state.organizationsLoaded && !force) return state.organizations;
            state.organizations = await profileService.listOrganizations();
            state.organizationsLoaded = true;
            return state.organizations;
        };

        let navigationSequence = 0;

        const navigate = async (id) => {
            const navigationId = ++navigationSequence;
            authLog('navigate:requested', { id, currentSection: state.currentSection });

            if (id !== 'equipe' && !canViewSection(state.currentProfile, id, state.currentOrganization?.enabled_modules)) {
                authLog('navigate:blocked by permission', { id, role: state.currentProfile?.role });
                showNoticeModal('Acesso restrito', 'Seu perfil não possui acesso a esta área.');
                void navigate(hasSuperAdminAccess(state.currentProfile) ? 'organizacoes' : 'painel');
                return;
            }

            state.currentSection = id;
            document.body.classList.toggle('workspace-lock-scroll', id === 'clientes' || id === 'processos');
            document.querySelectorAll('.dock-item').forEach((item) => {
                item.classList.toggle('active', item.dataset.id === id);
            });

            const mainContent = document.getElementById('main-content');
            if (!viewCache.has(id)) {
                const container = document.createElement('div');
                container.style.display = 'none';
                container.style.flexDirection = 'column';
                container.style.height = '100%';
                container.style.width = '100%';
                container.className = 'view-cache-container';
                container.innerHTML = `
                    <div class="view-header" style="flex-shrink: 0;">
                        <div class="view-actions-left"></div>
                        <div class="view-actions"></div>
                    </div>
                    <section class="content-area" style="flex: 1; overflow-y: auto; min-width: 0;"></section>
                `;
                mainContent.appendChild(container);

                viewCache.set(id, {
                    container,
                    viewHeader: container.querySelector('.view-header'),
                    viewActionsLeft: container.querySelector('.view-actions-left'),
                    viewActions: container.querySelector('.view-actions'),
                    contentArea: container.querySelector('.content-area'),
                    initialized: false
                });
            }

            // Oculta todas
            viewCache.forEach(v => v.container.style.display = 'none');
            
            // Exibe a view atual
            const currentView = viewCache.get(id);
            currentView.container.style.display = 'flex';

            const { viewHeader, viewActionsLeft, viewActions, contentArea, initialized } = currentView;

            if (initialized) {
                if (id === 'organizacoes') {
                    viewHeader.style.display = 'flex';
                    viewHeader.style.justifyContent = 'flex-end';
                    viewHeader.classList.remove('view-header-floating-left');
                } else if (id === 'painel') {
                    viewHeader.style.display = 'flex';
                    viewHeader.style.justifyContent = 'space-between';
                    viewHeader.classList.add('view-header-floating-left');
                } else if (['clientes', 'processos', 'prazos', 'financeiro', 'equipe', 'configuracoes', 'admin-panel'].includes(id)) {
                    viewHeader.style.display = 'flex';
                    viewHeader.style.justifyContent = 'flex-end';
                    viewHeader.classList.remove('view-header-floating-left');
                }

                if (id === 'processos') {
                    const clientSelect = contentArea.querySelector('select[name="clientId"]');
                    if (clientSelect) {
                        const currentVal = clientSelect.value;
                        const escapeHtml = (t) => String(t).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
                        
                        clientSelect.innerHTML = `
                            <option value="">Selecione um titular</option>
                            ${clientStore.clients.map((c) => `
                                <option value="${c.id}" ${String(c.id) === String(currentVal) ? 'selected' : ''}>
                                    ${escapeHtml(c.full_name || c.name || '')}${c.document ? ` - ${escapeHtml(c.document)}` : ''}
                                </option>
                            `).join('')}
                        `;
                    }
                }
                return; // Pula o render se já carregou antes
            }

            currentView.initialized = true;

            if (id === 'organizacoes') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'flex-end';
                if (viewHeader) viewHeader.classList.remove('view-header-floating-left');
                renderViewLoading(contentArea, 'Carregando organizações...');
                try {
                    await ensureOrganizationsLoaded();
                } catch (error) {
                    showNoticeModal('Erro ao atualizar', error?.message || 'Não foi possível carregar as organizações.');
                }
                const { renderOrganizationAdminView } = await loadOrganizationAdminViewModule();
                if (navigationId !== navigationSequence || state.currentSection !== id) return;
                renderOrganizationAdminView(contentArea, {
                    organizations: state.organizations,
                    loading: false,
                    createLoading: state.organizationCreateLoading,
                    onRefresh: async () => {
                        try {
                            await ensureOrganizationsLoaded(true);
                            if (viewCache.has('organizacoes')) viewCache.get('organizacoes').initialized = false;
                            void navigate('organizacoes');
                        } catch (error) {
                            showNoticeModal('Erro ao atualizar', error?.message || 'Não foi possível atualizar as organizações.');
                        }
                    },
                    onCreateOrganization: async (payload) => {
                        try {
                            state.organizationCreateLoading = true;
                            await profileService.createOrganization(payload);
                            await ensureOrganizationsLoaded(true);
                            showNoticeModal('Organização criada', 'A nova organização e o administrador principal foram provisionados com sucesso.');
                            if (viewCache.has('organizacoes')) viewCache.get('organizacoes').initialized = false;
                            void navigate('organizacoes');
                        } catch (error) {
                            showNoticeModal('Erro ao criar', error?.message || 'Não foi possível criar a organização.');
                        } finally {
                            state.organizationCreateLoading = false;
                        }
                    },
                    onUpdateOrganization: async (payload) => {
                        try {
                            await profileService.updateOrganization(payload);
                            await ensureOrganizationsLoaded(true);
                            if (viewCache.has('organizacoes')) viewCache.get('organizacoes').initialized = false;
                            void navigate('organizacoes');
                        } catch (error) {
                            showNoticeModal('Erro ao atualizar', error?.message || 'Não foi possível atualizar a organização.');
                            throw error;
                        }
                    },
                    onCreateOrganizationUser: async (payload) => {
                        try {
                            await profileService.createOrganizationUser(payload);
                            await ensureOrganizationsLoaded(true);
                            showNoticeModal('Usuário criado', 'O novo usuário foi criado com sucesso.');
                            void navigate('organizacoes');
                        } catch (error) {
                            showNoticeModal('Erro ao criar', error?.message || 'Não foi possível criar o usuário.');
                            throw error;
                        }
                    },
                    onUpdateOrganizationUser: async (payload) => {
                        try {
                            await profileService.updateOrganizationUser(payload);
                            await ensureOrganizationsLoaded(true);
                            showNoticeModal('Usuário atualizado', 'As informações do usuário foram atualizadas com sucesso.');
                            void navigate('organizacoes');
                        } catch (error) {
                            showNoticeModal('Erro ao salvar', error?.message || 'Não foi possível atualizar o usuário.');
                            throw error;
                        }
                    }
                });
            } else if (id === 'painel') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'space-between';
                if (viewHeader) viewHeader.classList.add('view-header-floating-left');
                renderViewLoading(contentArea, 'Carregando painel...');
                const { renderDashboard } = await loadDashboardViewModule();
                if (navigationId !== navigationSequence || state.currentSection !== id) return;
                renderDashboard(
                    contentArea,
                    viewActionsLeft,
                    getUserScopedStorageKey(DASHBOARD_WIDGETS_STORAGE_KEY, state.currentSession?.user?.id),
                    state.alertLeadDays
                );
            } else if (id === 'clientes') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'flex-end';
                if (viewHeader) viewHeader.classList.remove('view-header-floating-left');
                renderViewLoading(contentArea, 'Carregando titulares...');
                await renderClientesView(contentArea, viewActions, navigationId);
            } else if (id === 'processos') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'flex-end';
                if (viewHeader) viewHeader.classList.remove('view-header-floating-left');
                renderViewLoading(contentArea, 'Carregando processos...');
                await renderProcessosView(contentArea, viewActions, navigationId);
            } else if (id === 'prazos') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'flex-end';
                if (viewHeader) viewHeader.classList.remove('view-header-floating-left');
                renderViewLoading(contentArea, 'Carregando painel de prazos...');
                if (navigationId !== navigationSequence || state.currentSection !== id) return;
                const { renderDeadlineDashboard } = await loadDeadlineDashboardModule();
                if (navigationId !== navigationSequence || state.currentSection !== id) return;
                renderDeadlineDashboard(contentArea, {
                    canEdit: canEditContent(state.currentProfile)
                });
            } else if (id === 'configuracoes') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'flex-end';
                if (viewHeader) viewHeader.classList.remove('view-header-floating-left');
                renderViewLoading(contentArea, 'Carregando configuracoes...');
                
                const { renderSettingsMenuView } = await loadSettingsMenuViewModule();
                if (navigationId !== navigationSequence || state.currentSection !== id) return;

                const handleRefreshTeam = async () => {
                    try {
                        await ensureTeamProfilesLoaded(true);
                        if (viewCache.has('configuracoes')) viewCache.get('configuracoes').initialized = false;
                        void navigate('configuracoes');
                    } catch (error) {
                        showNoticeModal('Erro ao atualizar', error?.message || 'Nao foi possivel carregar a equipe.');
                    }
                };

                renderSettingsMenuView(contentArea, {
                    profile: state.currentProfile,
                    email: session?.user?.email || '',
                    alertDays: state.alertLeadDays,
                    currentTheme: state.currentTheme,
                    isAdmin,
                    teamProfiles,
                    teamLoading: false,
                    availableModules: state.currentOrganization?.enabled_modules || [],
                    onThemeChange: (themeId) => {
                        state.currentTheme = applyTheme(themeId);
                    },
                    onProfileSave: async (payload) => {
                        try {
                            state.currentProfile = await profileService.updateOwnProfile(payload);
                            showNoticeModal('Dados atualizados', 'Seu perfil foi atualizado com sucesso.');
                            renderAuthenticatedApp(state.currentSession);
                        } catch (error) {
                            showNoticeModal('Erro ao atualizar', error?.message || 'Não foi possível atualizar seus dados.');
                        }
                    },
                    onAlertSave: async (days) => {
                        state.alertLeadDays = saveAlertDays(days);
                        showNoticeModal('Alertas atualizados', `Os avisos de vencimento agora usarão ${state.alertLeadDays} dias de antecedência.`);
                        renderAuthenticatedApp(state.currentSession);
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
                    onRefreshTeam: handleRefreshTeam,
                    onCreateTeamMember: async (payload) => {
                        try {
                            await profileService.createMember(payload);
                            showNoticeModal('Membro criado', 'O novo membro foi criado com sucesso e já tem acesso ao sistema.');
                            await handleRefreshTeam();
                        } catch (error) {
                            showNoticeModal('Erro ao criar', error?.message || 'Falha ao cadastrar membro.');
                        }
                    },
                    onUpdateTeamMember: async (payload) => {
                        try {
                            await profileService.updateMember(payload);
                            showNoticeModal('Permissões atualizadas', 'As regras de acesso foram salvas.');
                            await handleRefreshTeam();
                        } catch (error) {
                            showNoticeModal('Erro ao salvar', error?.message || 'Falha ao atualizar permissões.');
                        }
                    }
                });
            } else if (id === 'admin-panel') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'flex-end';
                if (viewHeader) viewHeader.classList.remove('view-header-floating-left');
                
                if (!isAdmin) {
                    void navigate('painel');
                    return;
                }

                renderViewLoading(contentArea, 'Carregando painel administrativo...');
                const { renderAdminPanelView } = await loadAdminPanelViewModule();
                if (navigationId !== navigationSequence || state.currentSection !== id) return;

                const handleRefreshTeam = async () => {
                    try {
                        teamProfiles = await ensureTeamProfilesLoaded(true);
                        if (viewCache.has('admin-panel')) viewCache.get('admin-panel').initialized = false;
                        void navigate('admin-panel');
                    } catch (error) {
                        showNoticeModal('Erro ao atualizar', error?.message || 'Não foi possível carregar a equipe.');
                    }
                };

                try {
                    teamProfiles = await ensureTeamProfilesLoaded();
                } catch (error) {
                    showNoticeModal('Erro de conexão', 'Não foi possível carregar os dados da equipe.');
                }

                renderAdminPanelView(contentArea, {
                    profile: state.currentProfile,
                    isAdmin,
                    teamProfiles,
                    teamLoading: false,
                    availableModules: state.currentOrganization?.enabled_modules || [],
                    onRefreshTeam: handleRefreshTeam,
                    onCreateTeamMember: async (payload) => {
                        try {
                            await profileService.createMember(payload);
                            showNoticeModal('Membro criado', 'O novo membro foi criado com sucesso e já tem acesso ao sistema.');
                            await handleRefreshTeam();
                        } catch (error) {
                            showNoticeModal('Erro ao criar', error?.message || 'Falha ao cadastrar membro.');
                        }
                    },
                    onUpdateTeamMember: async (payload) => {
                        try {
                            await profileService.updateMember(payload);
                            showNoticeModal('Permissões atualizadas', 'As regras de acesso foram salvas.');
                            await handleRefreshTeam();
                        } catch (error) {
                            showNoticeModal('Erro ao salvar', error?.message || 'Falha ao atualizar permissões.');
                        }
                    }
                });
            } else if (id === 'financeiro') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'flex-end';
                if (viewHeader) viewHeader.classList.remove('view-header-floating-left');
                renderViewLoading(contentArea, 'Carregando financeiro...');
                const { renderFinanceiroView } = await loadFinanceViewModule();
                if (navigationId !== navigationSequence || state.currentSection !== id) return;
                renderFinanceiroView(
                    contentArea,
                    getUserScopedStorageKey(FINANCE_STORAGE_KEY, state.currentSession?.user?.id)
                );
            } else if (id === 'equipe') {
                if (viewHeader) viewHeader.style.display = 'flex';
                if (viewHeader) viewHeader.style.justifyContent = 'flex-end';
                if (viewHeader) viewHeader.classList.remove('view-header-floating-left');
                if (!isAdmin) {
                    void navigate(hasSuperAdminAccess(state.currentProfile) ? 'organizacoes' : 'painel');
                    return;
                }
                if (!canViewSection(state.currentProfile, 'configuracoes', state.currentOrganization?.enabled_modules)) {
                    void navigate(hasSuperAdminAccess(state.currentProfile) ? 'organizacoes' : 'painel');
                    return;
                }
                renderViewLoading(contentArea, 'Carregando equipe...');
                try {
                    await ensureTeamProfilesLoaded();
                } catch (error) {
                    showNoticeModal('Erro ao atualizar', error?.message || 'Não foi possível carregar a lista da equipe.');
                }
                const { renderTeamSettings } = await loadTeamSettingsModule();
                if (navigationId !== navigationSequence || state.currentSection !== id) return;
                renderTeamSettings(contentArea, {
                    currentProfile: state.currentProfile,
                    availableModules: state.currentOrganization?.enabled_modules || null,
                    profiles: teamProfiles,
                    loading: false,
                    createLoading: state.teamCreateLoading,
                    onRefresh: async () => {
                        try {
                            await ensureTeamProfilesLoaded(true);
                            void navigate('equipe');
                        } catch (error) {
                            showNoticeModal('Erro ao atualizar', error?.message || 'Não foi possível atualizar a lista da equipe.');
                        }
                    },
                    onCreateMember: async (payload) => {
                        try {
                            state.teamCreateLoading = true;
                            await profileService.createMember(payload);
                            await ensureTeamProfilesLoaded(true);
                            showNoticeModal('Novo membro criado', 'O novo usuário foi criado com sucesso e já possui acesso inicial.');
                            void navigate('equipe');
                        } catch (error) {
                            showNoticeModal('Erro ao criar', error?.message || 'Não foi possível criar o novo membro.');
                        } finally {
                            state.teamCreateLoading = false;
                        }
                    },
                    onUpdateMember: async (payload) => {
                        try {
                            await profileService.updateMember(payload);
                            await ensureTeamProfilesLoaded(true);
                            if (String(payload.id) === String(state.currentProfile?.id)) {
                                state.currentProfile = teamProfiles.find((profile) => String(profile.id) === String(payload.id)) || state.currentProfile;
                            }
                            showNoticeModal('Permissões atualizadas', 'As permissões do usuário foram atualizadas com sucesso.');
                            void navigate('equipe');
                        } catch (error) {
                            showNoticeModal('Erro ao salvar', error?.message || 'Não foi possível atualizar o membro da equipe.');
                        }
                    }
                });
            } else {
                renderEmptyState(contentArea, id);
            }
        };

        async function renderProcessosView(container, actionsContainer, navigationId = navigationSequence) {
            const { renderProcessList } = await loadProcessListModule();
            if (navigationId !== navigationSequence || state.currentSection !== 'processos') return;

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
                        canEdit: canEditContent(state.currentProfile),
                        canDelete: canDeleteContent(state.currentProfile)
                    }
                );
            };
            renderList();
        }

        async function showProcessDetails(container, actionsContainer, processId, clientId, projectId, renderList) {
            const { renderProcessDetails } = await loadProcessDetailsModule();
            container.innerHTML = '';
            actionsContainer.innerHTML = '';

            const onNavigate = {
                toProcessList: () => renderList(clientId, projectId),
                toClient: () => renderList(clientId, null),
                toProject: projectId ? () => renderList(clientId, projectId) : null,
                toEdit: (pid) => showEditProcess(container, actionsContainer, pid, () => showProcessDetails(container, actionsContainer, pid, clientId, projectId, renderList))
            };

            renderProcessDetails(container, actionsContainer, processId, onNavigate);
        }

        async function showEditProcess(container, actionsContainer, processId, onComplete) {
            const process = processStore.processes.find((item) => String(item.id) === String(processId));
            if (!process) return;
            const { renderProcessForm } = await loadProcessFormModule();

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

        async function showAddProcess(container, actionsContainer, onComplete, clientId = null) {
            const { renderProcessForm } = await loadProcessFormModule();
            container.innerHTML = '';
            actionsContainer.innerHTML = '';
            renderProcessForm(container, async (data) => {
                try {
                    const createdProcess = await processStore.addProcess(data);
                    onComplete(createdProcess?.clientId || null, createdProcess?.projectId || null);
                } catch (error) {
                    showNoticeModal('Erro ao salvar', error?.message || 'Não foi possível salvar o processo.');
                }
            }, onComplete, null, clientId);
        }

        async function renderClientesView(container, actionsContainer, navigationId = navigationSequence) {
            const { renderClientList } = await loadClientListModule();
            if (navigationId !== navigationSequence || state.currentSection !== 'clientes') return;

            const renderList = () => {
                actionsContainer.innerHTML = '';
                renderClientList(container, actionsContainer,
                    (client) => showEditClient(container, actionsContainer, client, renderList),
                    () => showAddClient(container, actionsContainer, renderList),
                    {
                        canEdit: canEditContent(state.currentProfile),
                        canDelete: canDeleteContent(state.currentProfile)
                    }
                );
            };
            renderList();
        }

        async function showAddClient(container, actionsContainer, onComplete) {
            const { renderClientForm } = await loadClientFormModule();
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

        async function showEditClient(container, actionsContainer, client, onComplete) {
            const { renderClientForm } = await loadClientFormModule();
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
        const defaultSection = ['organizacoes', 'painel', 'clientes', 'processos', 'prazos', 'configuracoes']
            .find((sectionId) => canViewSection(state.currentProfile, sectionId, state.currentOrganization?.enabled_modules)) || 'painel';
        const targetSection = canViewSection(state.currentProfile, state.currentSection, state.currentOrganization?.enabled_modules)
            ? state.currentSection
            : defaultSection;
        authLog('renderAuthenticatedApp:initial-section', { currentSection: state.currentSection, defaultSection, targetSection });
        void navigate(targetSection);
        state.hasRenderedProtectedApp = true;
    };

    const handleAuthStateChange = async (event, session) => {
        authLog('onAuthStateChange', {
            event,
            currentUserId: state.currentSession?.user?.id || null,
            nextUserId: session?.user?.id || null,
            isBootstrappingSession: state.isBootstrappingSession
        });

        if (state.isBootstrappingSession && event === 'INITIAL_SESSION') {
            authLog('ignoring INITIAL_SESSION during bootstrap');
            return;
        }

        if (event === 'SIGNED_IN' && state.currentSession?.user?.id === session?.user?.id && state.hasRenderedProtectedApp) {
            state.currentSession = session;
            authLog('ignoring redundant SIGNED_IN for same user');
            return;
        }

        if (event === 'TOKEN_REFRESHED' && state.currentSession?.user?.id === session?.user?.id && state.hasRenderedProtectedApp) {
            state.currentSession = session;
            authLog('ignoring TOKEN_REFRESHED rerender for same user');
            return;
        }

        state.currentSession = session;
        if (!session) {
            state.currentProfile = null;
            teamProfiles = [];
            state.teamProfilesLoaded = false;
            state.organizations = [];
            state.organizationsLoaded = false;
            state.currentOrganization = null;
            state.currentOrganizationLoaded = false;
            clientStore.reset();
            processStore.reset();
            resetActiveOrganizationId();
            state.hasRenderedProtectedApp = false;
            state.currentSection = 'painel';
            navigateTo(LOGIN_ROUTE, true);
        } else {
            navigateTo(APP_ROUTE, true);
        }
        await renderRoute();
    };

    const authSubscription = e2eOverrides
        ? { subscription: { unsubscribe() {} } }
        : authService.onAuthStateChange((event, session) => {
            window.setTimeout(() => {
                handleAuthStateChange(event, session).catch((error) => {
                    authLog('handleAuthStateChange:error', error);
                    reportUiError('auth.state-change', error, { event });
                });
            }, 0);
        }).data;

    window.addEventListener('popstate', () => {
        renderRoute().catch((error) => {
            reportUiError('navigation.popstate', error, { pathname: window.location.pathname });
            app.innerHTML = `<main id="main-content" style="padding: 3rem 2rem;"><div class="glass-card"><p>${error?.message || 'Erro inesperado de rota.'}</p></div></main>`;
        });
    });

    try {
        state.currentSession = e2eOverrides?.session
            ? cloneE2EValue(e2eOverrides.session, null)
            : await authService.getSession();
        reportUiEvent('bootstrap.session-loaded', {
            hasSession: Boolean(state.currentSession),
            pathname: window.location.pathname
        });
        authLog('bootstrap:getSession', {
            sessionUserId: state.currentSession?.user?.id || null,
            pathname: window.location.pathname
        });
        if (state.currentSession && window.location.pathname === LOGIN_ROUTE) {
            navigateTo(APP_ROUTE, true);
        }
        if (!state.currentSession && window.location.pathname !== LOGIN_ROUTE) {
            navigateTo(LOGIN_ROUTE, true);
        }
        await renderRoute();
    } catch (error) {
        authLog('bootstrap:error', error);
        reportUiError('bootstrap.session-load', error, { pathname: window.location.pathname });
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
        state.isBootstrappingSession = false;
        authLog('bootstrap:done');
    }

    window.addEventListener('beforeunload', () => {
        authSubscription?.subscription?.unsubscribe?.();
    });
});

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

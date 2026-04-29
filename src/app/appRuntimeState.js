export function createAppRuntimeState({ currentTheme, alertLeadDays } = {}) {
    return {
        currentTheme: currentTheme || 'niobio',
        currentSession: null,
        currentProfile: null,
        teamProfiles: [],
        teamProfilesLoaded: false,
        teamCreateLoading: false,
        organizations: [],
        organizationsLoaded: false,
        organizationCreateLoading: false,
        currentOrganization: null,
        currentOrganizationLoaded: false,
        dashboardSummary: null,
        currentSection: 'painel',
        hasRenderedProtectedApp: false,
        coreDataLoaded: false,
        coreDataLoading: false,
        coreDataBootstrapPromise: null,
        preferencesLoaded: false,
        preferencesLoading: false,
        preferencesBootstrapPromise: null,
        isBootstrappingSession: true,
        renderSequence: 0,
        alertLeadDays: Number.isFinite(Number(alertLeadDays)) ? Number(alertLeadDays) : 15,
        disposeHeaderMenu: null
    };
}

export function createAppRuntimeState({ currentTheme, alertLeadDays } = {}) {
    return {
        currentTheme: currentTheme || 'niobio',
        currentSession: null,
        currentProfile: null,
        teamProfiles: [],
        teamProfilesLoaded: false,
        teamCreateLoading: false,
        currentSection: 'painel',
        hasRenderedProtectedApp: false,
        isBootstrappingSession: true,
        renderSequence: 0,
        alertLeadDays: Number.isFinite(Number(alertLeadDays)) ? Number(alertLeadDays) : 15,
        disposeHeaderMenu: null
    };
}

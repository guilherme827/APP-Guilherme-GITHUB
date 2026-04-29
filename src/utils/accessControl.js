import accessPolicy from '../../shared/accessPolicy.mjs';

export const {
    FOLDER_OPTIONS,
    DEFAULT_PERMISSIONS,
    ROLE_SUPER_ADMIN,
    ROLE_ADMIN,
    ROLE_USER,
    ALL_NON_ORGANIZATION_SECTION_IDS,
    ORGANIZATION_MODULE_IDS
} = accessPolicy;

export function normalizePermissions(permissions) {
    return accessPolicy.normalizePermissions(permissions, ROLE_USER);
}

export function normalizeFolderAccess(folderAccess) {
    return accessPolicy.normalizeFolderAccess(folderAccess, ROLE_USER);
}

export function normalizeOrganizationModules(enabledModules) {
    return accessPolicy.normalizeOrganizationModules(enabledModules);
}

export function hasSuperAdminAccess(profile) {
    return accessPolicy.isSuperAdminRole(profile?.role);
}

export function hasOfficeAdminAccess(profile) {
    return accessPolicy.isOfficeAdminRole(profile?.role);
}

export function hasAdminAccess(profile) {
    return accessPolicy.isAdminRole(profile?.role);
}

export function canViewSection(profile, sectionId, enabledModules = null) {
    if (hasSuperAdminAccess(profile)) {
        return FOLDER_OPTIONS.some((folder) => folder.id === sectionId);
    }
    if (sectionId === 'organizacoes') {
        return false;
    }
    if (sectionId === 'admin-panel') {
        return hasOfficeAdminAccess(profile);
    }
    if (hasOfficeAdminAccess(profile)) return true;

    const organizationModules = normalizeOrganizationModules(enabledModules);
    if (!organizationModules.includes(sectionId)) {
        return false;
    }
    const permissions = accessPolicy.normalizePermissions(profile?.permissions, profile?.role);
    const folders = normalizeFolderAccess(profile?.folder_access);
    return permissions.view && folders.includes(sectionId);
}

export function canEditContent(profile) {
    if (hasAdminAccess(profile)) return true;
    return accessPolicy.normalizePermissions(profile?.permissions, profile?.role).edit;
}

export function canDeleteContent(profile) {
    if (hasAdminAccess(profile)) return true;
    return accessPolicy.normalizePermissions(profile?.permissions, profile?.role).delete;
}

export function getPreferredVisibleSection(profile, visibleSections = []) {
    const sections = Array.isArray(visibleSections) ? visibleSections.filter(Boolean) : [];
    const sectionPriority = hasSuperAdminAccess(profile)
        ? ['organizacoes', 'admin-panel', 'configuracoes', 'ia-chat', 'painel', 'clientes', 'processos', 'prazos', 'financeiro']
        : ['painel', 'clientes', 'processos', 'prazos', 'financeiro', 'admin-panel', 'configuracoes', 'ia-chat'];
    return sectionPriority.find((sectionId) => sections.includes(sectionId))
        || sections[0]
        || null;
}

export function getRoleLabel(role) {
    if (hasSuperAdminAccess({ role })) return 'Super Administrador';
    if (hasOfficeAdminAccess({ role })) return 'Administrador';
    return 'Colaborador';
}

export function getWelcomeLabel(profile) {
    const fullName = String(profile?.full_name || profile?.email || '').trim();
    const firstName = fullName.split(/\s+/)[0] || 'usuário';
    return `Bem-vindo, ${firstName}`;
}

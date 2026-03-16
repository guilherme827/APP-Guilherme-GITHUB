export const FOLDER_OPTIONS = [
    { id: 'organizacoes', label: 'Organizações' },
    { id: 'painel', label: 'Painel Central' },
    { id: 'clientes', label: 'Titulares' },
    { id: 'processos', label: 'Processos' },
    { id: 'prazos', label: 'Prazos' },
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'admin-panel', label: 'Painel Administrativo' },
    { id: 'configuracoes', label: 'Configurações' }
];

export const DEFAULT_PERMISSIONS = {
    view: true,
    edit: false,
    delete: false
};

export const ROLE_SUPER_ADMIN = 'super_admin';
export const ROLE_ADMIN = 'admin';
export const ROLE_USER = 'user';
export const ORGANIZATION_MODULE_IDS = FOLDER_OPTIONS
    .map((folder) => folder.id)
    .filter((folderId) => folderId !== 'organizacoes');

export function normalizePermissions(permissions) {
    return {
        view: permissions?.view !== false,
        edit: permissions?.edit === true,
        delete: permissions?.delete === true
    };
}

export function normalizeFolderAccess(folderAccess) {
    if (!Array.isArray(folderAccess)) {
        return [...ORGANIZATION_MODULE_IDS];
    }
    return [...new Set(folderAccess.filter(Boolean))];
}

export function normalizeOrganizationModules(enabledModules) {
    if (!Array.isArray(enabledModules)) {
        return [...ORGANIZATION_MODULE_IDS];
    }
    const normalized = [...new Set(enabledModules.filter(Boolean).map((item) => String(item).trim()))]
        .filter((item) => ORGANIZATION_MODULE_IDS.includes(item));
    return normalized.length > 0 ? normalized : [...ORGANIZATION_MODULE_IDS];
}

export function hasSuperAdminAccess(profile) {
    return profile?.role === ROLE_SUPER_ADMIN;
}

export function hasOfficeAdminAccess(profile) {
    return profile?.role === ROLE_ADMIN;
}

export function hasAdminAccess(profile) {
    return hasSuperAdminAccess(profile) || hasOfficeAdminAccess(profile);
}

export function canViewSection(profile, sectionId, enabledModules = null) {
    if (hasSuperAdminAccess(profile)) {
        return sectionId === 'organizacoes' || sectionId === 'configuracoes' || sectionId === 'admin-panel';
    }
    if (sectionId === 'organizacoes') {
        return false;
    }
    if (sectionId === 'admin-panel') {
        return hasOfficeAdminAccess(profile);
    }
    const organizationModules = normalizeOrganizationModules(enabledModules);
    if (!organizationModules.includes(sectionId)) {
        return false;
    }
    if (hasOfficeAdminAccess(profile)) return true;
    const permissions = normalizePermissions(profile?.permissions);
    const folders = normalizeFolderAccess(profile?.folder_access);
    return permissions.view && folders.includes(sectionId);
}

export function canEditContent(profile) {
    // Permissoes granulares foram removidas do painel; se tem acesso a visualizar, tem acesso de criar.
    return true;
}

export function canDeleteContent(profile) {
    // Permissoes granulares foram removidas do painel; se tem acesso a visualizar, tem acesso de exclusao.
    return true;
}

export function getWelcomeLabel(profile) {
    const fullName = String(profile?.full_name || profile?.email || '').trim();
    const firstName = fullName.split(/\s+/)[0] || 'usuário';
    return `Bem-vindo, ${firstName}`;
}

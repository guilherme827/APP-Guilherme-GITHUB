export const FOLDER_OPTIONS = [
    { id: 'painel', label: 'Painel Central' },
    { id: 'clientes', label: 'Titulares' },
    { id: 'processos', label: 'Processos' },
    { id: 'prazos', label: 'Prazos' },
    { id: 'configuracoes', label: 'Configurações' },
    { id: 'financeiro', label: 'Financeiro' }
];

export const DEFAULT_PERMISSIONS = {
    view: true,
    edit: false,
    delete: false
};

export function normalizePermissions(permissions) {
    return {
        view: permissions?.view !== false,
        edit: permissions?.edit === true,
        delete: permissions?.delete === true
    };
}

export function normalizeFolderAccess(folderAccess) {
    if (!Array.isArray(folderAccess)) {
        return FOLDER_OPTIONS.map((folder) => folder.id);
    }
    return [...new Set(folderAccess.filter(Boolean))];
}

export function hasAdminAccess(profile) {
    return profile?.role === 'admin';
}

export function canViewSection(profile, sectionId) {
    if (hasAdminAccess(profile)) return true;
    const permissions = normalizePermissions(profile?.permissions);
    const folders = normalizeFolderAccess(profile?.folder_access);
    return permissions.view && folders.includes(sectionId);
}

export function canEditContent(profile) {
    if (hasAdminAccess(profile)) return true;
    return normalizePermissions(profile?.permissions).edit;
}

export function canDeleteContent(profile) {
    if (hasAdminAccess(profile)) return true;
    return normalizePermissions(profile?.permissions).delete;
}

export function getWelcomeLabel(profile) {
    const fullName = String(profile?.full_name || profile?.email || '').trim();
    const firstName = fullName.split(/\s+/)[0] || 'usuário';
    if (profile?.gender === 'feminino') {
        return `Bem-vinda, ${firstName}`;
    }
    if (profile?.gender === 'masculino') {
        return `Bem-vindo, ${firstName}`;
    }
    return `Bem-vindo(a), ${firstName}`;
}

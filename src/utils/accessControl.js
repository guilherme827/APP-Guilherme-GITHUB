export const FOLDER_OPTIONS = [
    { id: 'organizacoes', label: 'Organizações' },
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

export const ROLE_SUPER_ADMIN = 'super_admin';
export const ROLE_ADMIN = 'admin';
export const ROLE_USER = 'user';

export function normalizePermissions(permissions) {
    return {
        view: permissions?.view !== false,
        edit: permissions?.edit === true,
        delete: permissions?.delete === true
    };
}

export function normalizeFolderAccess(folderAccess) {
    if (!Array.isArray(folderAccess)) {
        return FOLDER_OPTIONS
            .map((folder) => folder.id)
            .filter((folderId) => folderId !== 'organizacoes');
    }
    return [...new Set(folderAccess.filter(Boolean))];
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

export function canViewSection(profile, sectionId) {
    if (hasSuperAdminAccess(profile)) {
        return sectionId === 'organizacoes' || sectionId === 'configuracoes';
    }
    if (hasOfficeAdminAccess(profile)) return sectionId !== 'organizacoes';
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

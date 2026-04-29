const FOLDER_OPTIONS = [
    { id: 'organizacoes', label: 'Organizações' },
    { id: 'ia-chat', label: 'Chat IA' },
    { id: 'painel', label: 'Painel Central' },
    { id: 'clientes', label: 'Titulares' },
    { id: 'processos', label: 'Processos' },
    { id: 'prazos', label: 'Prazos' },
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'admin-panel', label: 'Painel Administrativo' },
    { id: 'configuracoes', label: 'Configurações' }
];

const KNOWN_SECTION_IDS = FOLDER_OPTIONS.map((folder) => folder.id);

const DEFAULT_PERMISSIONS = {
    view: true,
    edit: false,
    delete: false
};

const ROLE_SUPER_ADMIN = 'super_admin';
const ROLE_ADMIN = 'admin';
const ROLE_USER = 'user';

const ALL_NON_ORGANIZATION_SECTION_IDS = FOLDER_OPTIONS
    .map((folder) => folder.id)
    .filter((folderId) => folderId !== 'organizacoes');

const ORGANIZATION_MODULE_IDS = ['painel', 'clientes', 'processos', 'prazos', 'financeiro', 'configuracoes'];
const DEFAULT_USER_FOLDERS = ['painel', 'clientes', 'processos', 'prazos', 'configuracoes'];
const ADMIN_FOLDERS = ['painel', 'clientes', 'processos', 'prazos', 'financeiro', 'admin-panel', 'configuracoes'];

function normalizeRoleName(role) {
    const normalizedRole = String(role || '').trim();
    if (normalizedRole === ROLE_SUPER_ADMIN) return ROLE_SUPER_ADMIN;
    if (normalizedRole === ROLE_ADMIN || normalizedRole === 'adm') return ROLE_ADMIN;
    return ROLE_USER;
}

function isSuperAdminRole(role) {
    return normalizeRoleName(role) === ROLE_SUPER_ADMIN;
}

function isOfficeAdminRole(role) {
    return normalizeRoleName(role) === ROLE_ADMIN;
}

function isAdminRole(role) {
    const normalized = normalizeRoleName(role);
    return normalized === ROLE_ADMIN || normalized === ROLE_SUPER_ADMIN;
}

function normalizePermissions(permissions, role = ROLE_USER) {
    if (isAdminRole(role)) {
        return { view: true, edit: true, delete: true };
    }
    return {
        view: permissions?.view !== false,
        edit: permissions?.edit === true,
        delete: permissions?.delete === true
    };
}

function normalizeFolderAccess(folderAccess, role = ROLE_USER) {
    if (!Array.isArray(folderAccess) || folderAccess.length === 0) {
        return isAdminRole(role) ? [...ADMIN_FOLDERS] : [...DEFAULT_USER_FOLDERS];
    }
    const normalized = [...new Set(folderAccess.filter(Boolean).map((item) => String(item).trim()))]
        .filter((item) => KNOWN_SECTION_IDS.includes(item));
    if (isAdminRole(role) && !normalized.includes('admin-panel')) {
        normalized.push('admin-panel');
    }
    if (isAdminRole(role) && !normalized.includes('financeiro')) {
        normalized.push('financeiro');
    }
    return normalized;
}

function normalizeOrganizationModules(input) {
    if (!Array.isArray(input)) {
        return [...ORGANIZATION_MODULE_IDS];
    }
    const normalized = [...new Set(input.filter(Boolean).map((item) => String(item).trim()))]
        .filter((item) => ORGANIZATION_MODULE_IDS.includes(item));
    return normalized.length > 0 ? normalized : [...ORGANIZATION_MODULE_IDS];
}

function normalizeManagedUserAccess({ permissions, folder_access: folderAccess, role = ROLE_USER, allowedModules = ORGANIZATION_MODULE_IDS } = {}) {
    const normalizedRole = normalizeRoleName(role);
    const normalizedAllowedModules = normalizeOrganizationModules(allowedModules);
    const allowedFolderSet = new Set(normalizedAllowedModules);
    const normalizedFolderAccess = Array.isArray(folderAccess)
        ? [...new Set(folderAccess.filter(Boolean).map((item) => String(item).trim()))]
            .filter((item) => allowedFolderSet.has(item))
        : [];

    return {
        role: normalizedRole,
        permissions: normalizePermissions(permissions, normalizedRole),
        folder_access: normalizedRole === ROLE_ADMIN
            ? [...normalizedAllowedModules]
            : normalizedFolderAccess
    };
}

module.exports = {
    FOLDER_OPTIONS,
    KNOWN_SECTION_IDS,
    DEFAULT_PERMISSIONS,
    ROLE_SUPER_ADMIN,
    ROLE_ADMIN,
    ROLE_USER,
    ALL_NON_ORGANIZATION_SECTION_IDS,
    ORGANIZATION_MODULE_IDS,
    DEFAULT_USER_FOLDERS,
    ADMIN_FOLDERS,
    normalizeRoleName,
    isSuperAdminRole,
    isOfficeAdminRole,
    isAdminRole,
    normalizePermissions,
    normalizeFolderAccess,
    normalizeOrganizationModules,
    normalizeManagedUserAccess
};

import fs from 'node:fs';
import path from 'node:path';

export async function loadAccessControlFunctions() {
    const modulePath = path.resolve(process.cwd(), 'src/utils/accessControl.js');
    const source = fs.readFileSync(modulePath, 'utf8');
    const withoutImports = source.replace(/^import[\s\S]*?;\n/gm, '');
    const sanitized = withoutImports.replace(/export\s+/g, '');
    const factory = new Function(
        'accessPolicy',
        `${sanitized}
        return {
            FOLDER_OPTIONS,
            DEFAULT_PERMISSIONS,
            ROLE_SUPER_ADMIN,
            ROLE_ADMIN,
            ROLE_USER,
            ORGANIZATION_MODULE_IDS,
            normalizePermissions,
            normalizeFolderAccess,
            normalizeOrganizationModules,
            hasSuperAdminAccess,
            hasOfficeAdminAccess,
            hasAdminAccess,
            canViewSection,
            canEditContent,
            canDeleteContent,
            getPreferredVisibleSection,
            getRoleLabel
        };`
    );
    const accessPolicyModule = await import('../../shared/accessPolicy.mjs');
    return factory(accessPolicyModule.default);
}

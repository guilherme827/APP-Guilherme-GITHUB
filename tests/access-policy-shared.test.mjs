import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const accessPolicy = require('../shared/accessPolicy.cjs');

test('normalizeRoleName should map adm alias and keep super_admin', () => {
    assert.equal(accessPolicy.normalizeRoleName('adm'), accessPolicy.ROLE_ADMIN);
    assert.equal(accessPolicy.normalizeRoleName('super_admin'), accessPolicy.ROLE_SUPER_ADMIN);
    assert.equal(accessPolicy.normalizeRoleName('something-else'), accessPolicy.ROLE_USER);
});

test('normalizePermissions should grant full access to admins and preserve granular user flags', () => {
    assert.deepEqual(
        accessPolicy.normalizePermissions({ view: false, edit: false, delete: false }, accessPolicy.ROLE_ADMIN),
        { view: true, edit: true, delete: true }
    );

    assert.deepEqual(
        accessPolicy.normalizePermissions({ view: true, edit: false, delete: true }, accessPolicy.ROLE_USER),
        { view: true, edit: false, delete: true }
    );
});

test('normalizeFolderAccess should inject admin modules and keep default user folders', () => {
    assert.deepEqual(
        accessPolicy.normalizeFolderAccess([], accessPolicy.ROLE_ADMIN),
        accessPolicy.ADMIN_FOLDERS
    );

    assert.deepEqual(
        accessPolicy.normalizeFolderAccess(null, accessPolicy.ROLE_USER),
        accessPolicy.DEFAULT_USER_FOLDERS
    );

    assert.deepEqual(
        accessPolicy.normalizeFolderAccess(['clientes'], accessPolicy.ROLE_ADMIN),
        ['clientes', 'admin-panel', 'financeiro']
    );

    assert.deepEqual(
        accessPolicy.normalizeFolderAccess(['clientes', 'foo', 'organizacoes'], accessPolicy.ROLE_USER),
        ['clientes', 'organizacoes']
    );
});

test('normalizeOrganizationModules should sanitize invalid entries and fallback safely', () => {
    assert.deepEqual(
        accessPolicy.normalizeOrganizationModules(['clientes', 'foo', 'financeiro', 'clientes']),
        ['clientes', 'financeiro']
    );

    assert.deepEqual(
        accessPolicy.normalizeOrganizationModules([]),
        accessPolicy.ORGANIZATION_MODULE_IDS
    );
});

test('normalizeManagedUserAccess should discard folders outside organization modules', () => {
    assert.deepEqual(
        accessPolicy.normalizeManagedUserAccess({
            role: accessPolicy.ROLE_USER,
            permissions: { view: true, edit: false, delete: false },
            folder_access: ['clientes', 'admin-panel', 'ia-chat', 'foo'],
            allowedModules: ['clientes', 'processos']
        }),
        {
            role: accessPolicy.ROLE_USER,
            permissions: { view: true, edit: false, delete: false },
            folder_access: ['clientes']
        }
    );

    assert.deepEqual(
        accessPolicy.normalizeManagedUserAccess({
            role: accessPolicy.ROLE_ADMIN,
            permissions: { view: false, edit: false, delete: false },
            folder_access: ['clientes'],
            allowedModules: ['clientes', 'financeiro']
        }),
        {
            role: accessPolicy.ROLE_ADMIN,
            permissions: { view: true, edit: true, delete: true },
            folder_access: ['clientes', 'financeiro']
        }
    );
});

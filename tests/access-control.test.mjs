import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAccessControlFunctions } from './helpers/loadAccessControlFunctions.mjs';

const {
    canViewSection,
    canEditContent,
    canDeleteContent,
    getPreferredVisibleSection,
    getRoleLabel
} = await loadAccessControlFunctions();

test('super_admin should be able to view organization and app sections', () => {
    const profile = { role: 'super_admin' };
    assert.equal(canViewSection(profile, 'organizacoes'), true);
    assert.equal(canViewSection(profile, 'admin-panel'), true);
    assert.equal(canViewSection(profile, 'painel'), true);
    assert.equal(canViewSection(profile, 'clientes'), true);
    assert.equal(canViewSection(profile, 'financeiro'), true);
});

test('regular user should respect folder access and organization modules', () => {
    const profile = {
        role: 'user',
        permissions: { view: true, edit: false, delete: false },
        folder_access: ['clientes']
    };
    assert.equal(canViewSection(profile, 'clientes', ['clientes', 'processos']), true);
    assert.equal(canViewSection(profile, 'processos', ['clientes', 'processos']), false);
    assert.equal(canViewSection(profile, 'financeiro', ['clientes', 'financeiro']), false);
});

test('granular edit and delete permissions should be respected for regular users', () => {
    const profile = {
        role: 'user',
        permissions: { view: true, edit: false, delete: true }
    };
    assert.equal(canEditContent(profile), false);
    assert.equal(canDeleteContent(profile), true);
});

test('admins should keep full edit and delete capabilities', () => {
    assert.equal(canEditContent({ role: 'admin' }), true);
    assert.equal(canDeleteContent({ role: 'admin' }), true);
    assert.equal(canEditContent({ role: 'super_admin' }), true);
    assert.equal(canDeleteContent({ role: 'super_admin' }), true);
});

test('preferred visible section should choose the first accessible priority for regular users', () => {
    const profile = { role: 'user' };
    const section = getPreferredVisibleSection(profile, ['financeiro', 'configuracoes']);
    assert.equal(section, 'financeiro');
});

test('preferred visible section should choose organization first for super admins', () => {
    const profile = { role: 'super_admin' };
    const section = getPreferredVisibleSection(profile, ['clientes', 'organizacoes', 'admin-panel']);
    assert.equal(section, 'organizacoes');
});

test('preferred visible section should return null when no visible section exists', () => {
    assert.equal(getPreferredVisibleSection({ role: 'user' }, []), null);
});

test('role labels should be normalized for admin and super admin displays', () => {
    assert.equal(getRoleLabel('user'), 'Colaborador');
    assert.equal(getRoleLabel('admin'), 'Administrador');
    assert.equal(getRoleLabel('adm'), 'Administrador');
    assert.equal(getRoleLabel('super_admin'), 'Super Administrador');
});

let activeOrganizationId = null;
let activeOrganizationSlug = 'default';

export function setActiveOrganizationId(organizationId, slug = null) {
    activeOrganizationId = organizationId ? String(organizationId) : null;
    if (slug) activeOrganizationSlug = String(slug);
    
    if (typeof globalThis !== 'undefined') {
        globalThis.__APP_CONTROL_ACTIVE_ORG_ID__ = activeOrganizationId;
        globalThis.__APP_CONTROL_ACTIVE_ORG_SLUG__ = activeOrganizationSlug;
    }
    return activeOrganizationId;
}

export function getActiveOrganizationId() {
    if (typeof globalThis !== 'undefined' && globalThis.__APP_CONTROL_ACTIVE_ORG_ID__) {
        return String(globalThis.__APP_CONTROL_ACTIVE_ORG_ID__);
    }
    return activeOrganizationId ? String(activeOrganizationId) : null;
}

export function getActiveOrganizationSlug() {
    if (typeof globalThis !== 'undefined' && globalThis.__APP_CONTROL_ACTIVE_ORG_SLUG__) {
        return String(globalThis.__APP_CONTROL_ACTIVE_ORG_SLUG__);
    }
    return activeOrganizationSlug;
}

export function resetActiveOrganizationId() {
    activeOrganizationId = null;
    activeOrganizationSlug = 'default';
    if (typeof globalThis !== 'undefined') {
        delete globalThis.__APP_CONTROL_ACTIVE_ORG_ID__;
        delete globalThis.__APP_CONTROL_ACTIVE_ORG_SLUG__;
    }
}

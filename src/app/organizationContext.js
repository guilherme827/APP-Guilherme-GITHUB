let activeOrganizationId = null;

export function setActiveOrganizationId(organizationId) {
    activeOrganizationId = organizationId ? String(organizationId) : null;
    if (typeof globalThis !== 'undefined') {
        globalThis.__APP_CONTROL_ACTIVE_ORG_ID__ = activeOrganizationId;
    }
    return activeOrganizationId;
}

export function getActiveOrganizationId() {
    if (typeof globalThis !== 'undefined' && globalThis.__APP_CONTROL_ACTIVE_ORG_ID__) {
        return String(globalThis.__APP_CONTROL_ACTIVE_ORG_ID__);
    }
    return activeOrganizationId ? String(activeOrganizationId) : null;
}

export function resetActiveOrganizationId() {
    activeOrganizationId = null;
    if (typeof globalThis !== 'undefined') {
        delete globalThis.__APP_CONTROL_ACTIVE_ORG_ID__;
    }
}

const { createClient } = require('@supabase/supabase-js');
const accessPolicy = require('../shared/accessPolicy.cjs');

function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => {
            raw += String(chunk || '');
        });
        req.on('end', () => {
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

function getClients(env) {
    const supabaseUrl = String(env.VITE_SUPABASE_URL || '').trim();
    const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY || '').trim();
    const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
        throw new Error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY precisam estar configuradas no servidor.');
    }

    return {
        anonClient: createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } }),
        serviceClient: createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    };
}

function slugify(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^\w]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function normalizeOrganizationModules(input) {
    return accessPolicy.normalizeOrganizationModules(input);
}

function sanitizeManagedUserPayload(body = {}, allowedModules = accessPolicy.ORGANIZATION_MODULE_IDS) {
    const access = accessPolicy.normalizeManagedUserAccess({
        role: body.role,
        permissions: body.permissions,
        folder_access: body.folder_access,
        allowedModules
    });

    return {
        id: String(body.id || '').trim(),
        organization_id: String(body.organization_id || '').trim(),
        full_name: String(body.full_name || '').trim(),
        email: String(body.email || '').trim().toLowerCase(),
        cpf: String(body.cpf || '').trim(),
        password: String(body.password || ''),
        gender: ['masculino', 'feminino', 'neutro'].includes(String(body.gender || 'neutro')) ? String(body.gender || 'neutro') : 'neutro',
        role: access.role,
        permissions: access.permissions,
        folder_access: access.folder_access
    };
}

async function getOrganizationById(serviceClient, organizationId) {
    const baseSelect = 'id, name, slug, is_active, created_by, created_at, updated_at';
    const orgResult = await serviceClient
        .from('organizations')
        .select(`enabled_modules, ${baseSelect}`)
        .eq('id', organizationId)
        .single();

    if (orgResult.error && /enabled_modules/i.test(String(orgResult.error.message || ''))) {
        const fallbackResult = await serviceClient
            .from('organizations')
            .select(baseSelect)
            .eq('id', organizationId)
            .single();
        return {
            data: fallbackResult.data ? { ...fallbackResult.data, enabled_modules: [...accessPolicy.ORGANIZATION_MODULE_IDS] } : null,
            error: fallbackResult.error
        };
    }

    return {
        data: orgResult.data ? { ...orgResult.data, enabled_modules: normalizeOrganizationModules(orgResult.data.enabled_modules) } : null,
        error: orgResult.error
    };
}

async function buildAuthUserMetadataMap(serviceClient) {
    const metadataMap = new Map();
    let page = 1;
    const perPage = 200;

    while (true) {
        const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage });
        if (error) {
            return metadataMap;
        }

        const users = Array.isArray(data?.users) ? data.users : [];
        users.forEach((user) => {
            metadataMap.set(String(user.id), user.user_metadata || {});
        });

        if (users.length < perPage) {
            return metadataMap;
        }
        page += 1;
    }
}

async function upsertProfileWithOptionalCpf(serviceClient, payload) {
    let profilePayload = { ...payload };
    let result = await serviceClient
        .from('profiles')
        .upsert(profilePayload)
        .select('*')
        .single();

    if (result.error && /cpf/i.test(String(result.error.message || ''))) {
        delete profilePayload.cpf;
        result = await serviceClient
            .from('profiles')
            .upsert(profilePayload)
            .select('*')
            .single();

        if (result.data) {
            result.data = { ...result.data, cpf: '' };
        }
    }

    return result;
}

async function authenticateRequester(req, env) {
    const { anonClient, serviceClient } = getClients(env);
    const authorization = String(req.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

    if (!token) {
        return { error: { status: 401, message: 'Token de autenticação ausente.' } };
    }

    const { data: authData, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !authData?.user) {
        return { error: { status: 401, message: authError?.message || 'Sessão inválida.' } };
    }

    const { data: profile, error: profileError } = await serviceClient
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

    if (profileError || !profile) {
        return { error: { status: 403, message: profileError?.message || 'Perfil não encontrado.' } };
    }

    return { serviceClient, profile };
}

async function handleGet(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }

    const requestUrl = new URL(req.url, 'http://localhost');
    const scope = String(requestUrl.searchParams.get('scope') || '').trim();

    if (scope === 'current') {
        if (accessPolicy.isSuperAdminRole(auth.profile.role)) {
            sendJson(res, 200, { data: null });
            return;
        }
        if (!auth.profile.organization_id) {
            sendJson(res, 404, { error: 'Perfil sem organização vinculada.' });
            return;
        }

        const { data: organization, error: organizationError } = await auth.serviceClient
            .from('organizations')
            .select('*')
            .eq('id', auth.profile.organization_id)
            .single();

        if (organizationError && /enabled_modules/i.test(String(organizationError.message || ''))) {
            const fallbackOrganizationResult = await auth.serviceClient
                .from('organizations')
                .select('id, name, slug, is_active, created_by, created_at, updated_at')
                .eq('id', auth.profile.organization_id)
                .single();

            if (fallbackOrganizationResult.error || !fallbackOrganizationResult.data) {
                sendJson(res, 500, { error: fallbackOrganizationResult.error?.message || 'Não foi possível carregar a organização atual.' });
                return;
            }

            sendJson(res, 200, {
                data: {
                    ...fallbackOrganizationResult.data,
                    enabled_modules: [...accessPolicy.ORGANIZATION_MODULE_IDS]
                }
            });
            return;
        }

        if (organizationError || !organization) {
            sendJson(res, 500, { error: organizationError?.message || 'Não foi possível carregar a organização atual.' });
            return;
        }

        sendJson(res, 200, {
            data: {
                ...organization,
                enabled_modules: normalizeOrganizationModules(organization.enabled_modules)
            }
        });
        return;
    }

    if (!accessPolicy.isSuperAdminRole(auth.profile.role)) {
        sendJson(res, 403, { error: 'Apenas o super admin pode gerenciar organizações.' });
        return;
    }

    let organizations = null;
    let organizationsError = null;
    const organizationsResult = await auth.serviceClient
        .from('organizations')
        .select('*')
        .order('name', { ascending: true });
    organizations = organizationsResult.data;
    organizationsError = organizationsResult.error;

    if (organizationsError && /enabled_modules/i.test(String(organizationsError.message || ''))) {
        const fallbackOrganizationsResult = await auth.serviceClient
            .from('organizations')
            .select('id, name, slug, is_active, created_by, created_at, updated_at')
            .order('name', { ascending: true });
        organizations = fallbackOrganizationsResult.data;
        organizationsError = fallbackOrganizationsResult.error;
    }

    if (organizationsError) {
        sendJson(res, 500, { error: organizationsError.message || 'Não foi possível carregar as organizações.' });
        return;
    }

    let organizationProfiles = null;
    let organizationProfilesError = null;
    const organizationProfilesResult = await auth.serviceClient
        .from('profiles')
        .select('id, email, full_name, cpf, organization_id, role, created_at')
        .in('role', ['admin', 'user']);
    organizationProfiles = organizationProfilesResult.data;
    organizationProfilesError = organizationProfilesResult.error;

    if (organizationProfilesError && /cpf/i.test(String(organizationProfilesError.message || ''))) {
        const fallbackOrganizationProfilesResult = await auth.serviceClient
            .from('profiles')
            .select('id, email, full_name, organization_id, role, created_at')
            .in('role', ['admin', 'user']);
        organizationProfiles = (fallbackOrganizationProfilesResult.data || []).map((profile) => ({
            ...profile,
            cpf: ''
        }));
        organizationProfilesError = fallbackOrganizationProfilesResult.error;
    }

    if (organizationProfilesError) {
        sendJson(res, 500, { error: organizationProfilesError.message || 'Não foi possível carregar os usuários da organização.' });
        return;
    }

    const authUserMetadataMap = await buildAuthUserMetadataMap(auth.serviceClient);

    const normalized = (organizations || []).map((organization) => ({
        ...organization,
        enabled_modules: normalizeOrganizationModules(organization?.enabled_modules),
        users: (organizationProfiles || [])
            .filter((profile) => String(profile.organization_id || '') === String(organization.id))
            .map((profile) => {
                const authMetadata = authUserMetadataMap.get(String(profile.id)) || {};
                return {
                    ...profile,
                    cpf: String(profile?.cpf || authMetadata?.cpf || '').trim()
                };
            })
            .sort((left, right) => {
                const roleWeight = (profile) => (accessPolicy.isAdminRole(profile?.role) ? 0 : 1);
                const weightDelta = roleWeight(left) - roleWeight(right);
                if (weightDelta !== 0) return weightDelta;
                return String(left?.full_name || left?.email || '').localeCompare(String(right?.full_name || right?.email || ''), 'pt-BR');
            })
    }));

    sendJson(res, 200, { data: normalized });
}

async function handlePost(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }
    if (!accessPolicy.isSuperAdminRole(auth.profile.role)) {
        sendJson(res, 403, { error: 'Apenas o super admin pode gerenciar organizações.' });
        return;
    }

    let body;
    try {
        body = await parseBody(req);
    } catch {
        sendJson(res, 400, { error: 'Payload inválido.' });
        return;
    }

    const organizationName = String(body.organization_name || '').trim();
    const organizationSlug = slugify(body.organization_slug || organizationName);
    const adminFullName = String(body.admin_full_name || '').trim();
    const adminEmail = String(body.admin_email || '').trim().toLowerCase();
    const adminCpf = String(body.admin_cpf || '').trim();
    const adminPassword = String(body.admin_password || '');
    const adminGender = ['masculino', 'feminino', 'neutro'].includes(String(body.admin_gender || 'neutro'))
        ? String(body.admin_gender || 'neutro')
        : 'neutro';
    const enabledModules = normalizeOrganizationModules(body.enabled_modules);

    if (!organizationName || !organizationSlug || !adminFullName || !adminEmail || adminPassword.length < 6) {
        sendJson(res, 400, { error: 'Nome da organização, slug, dados do administrador e senha válida são obrigatórios.' });
        return;
    }

    const organizationInsertPayload = {
        name: organizationName,
        slug: organizationSlug,
        created_by: auth.profile.id,
        enabled_modules: enabledModules
    };

    let organization = null;
    let organizationError = null;
    const organizationResult = await auth.serviceClient
        .from('organizations')
        .insert(organizationInsertPayload)
        .select('*')
        .single();
    organization = organizationResult.data;
    organizationError = organizationResult.error;

    if (organizationError && /enabled_modules/i.test(String(organizationError.message || ''))) {
        const fallbackOrganizationResult = await auth.serviceClient
            .from('organizations')
            .insert({
                name: organizationName,
                slug: organizationSlug,
                created_by: auth.profile.id
            })
            .select('id, name, slug, is_active, created_by, created_at, updated_at')
            .single();
        organization = fallbackOrganizationResult.data
            ? {
                ...fallbackOrganizationResult.data,
                enabled_modules: enabledModules
            }
            : null;
        organizationError = fallbackOrganizationResult.error;
    }

    if (organizationError || !organization) {
        sendJson(res, 500, { error: organizationError?.message || 'Não foi possível criar a organização.' });
        return;
    }

    const { data: createdUserData, error: createUserError } = await auth.serviceClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
            full_name: adminFullName,
            gender: adminGender,
            role: 'admin',
            organization_id: organization.id,
            cpf: adminCpf,
            folder_access: enabledModules
        }
    });

    if (createUserError || !createdUserData?.user) {
        sendJson(res, 500, { error: createUserError?.message || 'Organização criada, mas falhou ao criar o administrador.' });
        return;
    }

    let adminProfilePayload = {
        id: createdUserData.user.id,
        email: adminEmail,
        full_name: adminFullName,
        cpf: adminCpf,
        gender: adminGender,
        role: 'admin',
        organization_id: organization.id,
        permissions: { view: true, edit: true, delete: true },
        folder_access: enabledModules
    };

    let adminProfile = null;
    let adminProfileError = null;
    const adminProfileResult = await auth.serviceClient
        .from('profiles')
        .upsert(adminProfilePayload)
        .select('*')
        .single();
    adminProfile = adminProfileResult.data;
    adminProfileError = adminProfileResult.error;

    if (adminProfileError && /cpf/i.test(String(adminProfileError.message || ''))) {
        adminProfilePayload = {
            ...adminProfilePayload,
            cpf: undefined
        };
        delete adminProfilePayload.cpf;
        const fallbackAdminProfileResult = await auth.serviceClient
            .from('profiles')
            .upsert(adminProfilePayload)
            .select('*')
            .single();
        adminProfile = fallbackAdminProfileResult.data
            ? {
                ...fallbackAdminProfileResult.data,
                cpf: ''
            }
            : null;
        adminProfileError = fallbackAdminProfileResult.error;
    }

    if (adminProfileError) {
        sendJson(res, 500, { error: adminProfileError.message || 'Administrador criado no Auth, mas o perfil não foi salvo.' });
        return;
    }

    sendJson(res, 201, {
        data: {
            ...organization,
            enabled_modules: enabledModules,
            users: [adminProfile]
        }
    });
}

async function handleUserPost(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }
    if (!accessPolicy.isSuperAdminRole(auth.profile.role)) {
        sendJson(res, 403, { error: 'Apenas o super admin pode gerenciar usuários das organizações.' });
        return;
    }

    let body;
    try {
        body = await parseBody(req);
    } catch {
        sendJson(res, 400, { error: 'Payload inválido.' });
        return;
    }

    const organizationId = String(body.organization_id || '').trim();
    if (!organizationId) {
        sendJson(res, 400, { error: 'Organização é obrigatória.' });
        return;
    }

    const { data: organization, error: organizationError } = await getOrganizationById(auth.serviceClient, organizationId);
    if (organizationError || !organization) {
        sendJson(res, 404, { error: organizationError?.message || 'Organização não encontrada.' });
        return;
    }

    const payload = sanitizeManagedUserPayload(body, organization.enabled_modules);
    if (!payload.full_name || !payload.email || payload.password.length < 6) {
        sendJson(res, 400, { error: 'Nome, e-mail e senha com pelo menos 6 caracteres são obrigatórios.' });
        return;
    }

    const { data: createdUserData, error: createUserError } = await auth.serviceClient.auth.admin.createUser({
        email: payload.email,
        password: payload.password,
        email_confirm: true,
        user_metadata: {
            full_name: payload.full_name,
            cpf: payload.cpf,
            gender: payload.gender,
            role: payload.role,
            organization_id: organizationId,
            folder_access: payload.folder_access
        }
    });

    if (createUserError || !createdUserData?.user) {
        sendJson(res, 500, { error: createUserError?.message || 'Não foi possível criar o usuário.' });
        return;
    }

    const { data: profile, error: profileError } = await upsertProfileWithOptionalCpf(auth.serviceClient, {
        id: createdUserData.user.id,
        email: payload.email,
        full_name: payload.full_name,
        cpf: payload.cpf,
        gender: payload.gender,
        role: payload.role,
        organization_id: organizationId,
        permissions: payload.permissions,
        folder_access: payload.folder_access
    });

    if (profileError || !profile) {
        sendJson(res, 500, { error: profileError?.message || 'Usuário criado, mas o perfil não foi salvo.' });
        return;
    }

    sendJson(res, 201, { data: profile });
}

async function handleUserPatch(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }
    if (!accessPolicy.isSuperAdminRole(auth.profile.role)) {
        sendJson(res, 403, { error: 'Apenas o super admin pode gerenciar usuários das organizações.' });
        return;
    }

    let body;
    try {
        body = await parseBody(req);
    } catch {
        sendJson(res, 400, { error: 'Payload inválido.' });
        return;
    }

    const userId = String(body.id || '').trim();
    const organizationId = String(body.organization_id || '').trim();
    if (!userId || !organizationId) {
        sendJson(res, 400, { error: 'Usuário e organização são obrigatórios.' });
        return;
    }

    const { data: organization, error: organizationError } = await getOrganizationById(auth.serviceClient, organizationId);
    if (organizationError || !organization) {
        sendJson(res, 404, { error: organizationError?.message || 'Organização não encontrada.' });
        return;
    }

    const payload = sanitizeManagedUserPayload(body, organization.enabled_modules);
    if (!payload.full_name || !payload.email) {
        sendJson(res, 400, { error: 'Nome e e-mail são obrigatórios.' });
        return;
    }

    const { data: existingProfile, error: existingProfileError } = await auth.serviceClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .eq('organization_id', organizationId)
        .single();

    if (existingProfileError || !existingProfile) {
        sendJson(res, 404, { error: existingProfileError?.message || 'Usuário não encontrado na organização.' });
        return;
    }

    const authUpdatePayload = {
        email: payload.email,
        user_metadata: {
            full_name: payload.full_name,
            cpf: payload.cpf,
            gender: payload.gender,
            role: payload.role,
            organization_id: organizationId,
            folder_access: payload.folder_access
        }
    };
    if (payload.password) {
        if (payload.password.length < 6) {
            sendJson(res, 400, { error: 'A nova senha precisa ter pelo menos 6 caracteres.' });
            return;
        }
        authUpdatePayload.password = payload.password;
    }

    const { error: authUpdateError } = await auth.serviceClient.auth.admin.updateUserById(userId, authUpdatePayload);
    if (authUpdateError) {
        sendJson(res, 500, { error: authUpdateError.message || 'Não foi possível atualizar o usuário.' });
        return;
    }

    let updatePayload = {
        email: payload.email,
        full_name: payload.full_name,
        cpf: payload.cpf,
        gender: payload.gender,
        role: payload.role,
        organization_id: organizationId,
        permissions: payload.permissions,
        folder_access: payload.folder_access
    };

    let updateResult = await auth.serviceClient
        .from('profiles')
        .update(updatePayload)
        .eq('id', userId)
        .eq('organization_id', organizationId)
        .select('*')
        .single();

    if (updateResult.error && /cpf/i.test(String(updateResult.error.message || ''))) {
        delete updatePayload.cpf;
        updateResult = await auth.serviceClient
            .from('profiles')
            .update(updatePayload)
            .eq('id', userId)
            .eq('organization_id', organizationId)
            .select('*')
            .single();
        if (updateResult.data) {
            updateResult.data = { ...updateResult.data, cpf: '' };
        }
    }

    if (updateResult.error || !updateResult.data) {
        sendJson(res, 500, { error: updateResult.error?.message || 'Não foi possível atualizar o perfil do usuário.' });
        return;
    }

    sendJson(res, 200, { data: updateResult.data });
}

async function handlePatch(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }
    if (!accessPolicy.isSuperAdminRole(auth.profile.role)) {
        sendJson(res, 403, { error: 'Apenas o super admin pode gerenciar organizações.' });
        return;
    }

    let body;
    try {
        body = await parseBody(req);
    } catch {
        sendJson(res, 400, { error: 'Payload inválido.' });
        return;
    }

    const organizationId = String(body.id || '').trim();
    if (!organizationId) {
        sendJson(res, 400, { error: 'ID da organização é obrigatório.' });
        return;
    }

    const enabledModules = normalizeOrganizationModules(body.enabled_modules);
    
    let updateResult = await auth.serviceClient
        .from('organizations')
        .update({ enabled_modules: enabledModules })
        .eq('id', organizationId)
        .select('*')
        .single();
        
    if (updateResult.error && /enabled_modules/i.test(String(updateResult.error.message || ''))) {
        sendJson(res, 200, { data: { id: organizationId, is_fallback: true } });
        return;
    }

    if (updateResult.error || !updateResult.data) {
        sendJson(res, 500, { error: updateResult.error?.message || 'Não foi possível atualizar a organização.' });
        return;
    }

    sendJson(res, 200, { data: { ...updateResult.data, enabled_modules: normalizeOrganizationModules(updateResult.data.enabled_modules) } });
}

module.exports = async function organizationsHandler(req, res, env = process.env) {
    const requestUrl = new URL(req.url, 'http://localhost');
    const scope = String(requestUrl.searchParams.get('scope') || '').trim();

    if (scope === 'user' && req.method === 'POST') {
        await handleUserPost(req, res, env);
        return;
    }

    if (scope === 'user' && req.method === 'PATCH') {
        await handleUserPatch(req, res, env);
        return;
    }

    if (req.method === 'GET') {
        await handleGet(req, res, env);
        return;
    }

    if (req.method === 'POST') {
        await handlePost(req, res, env);
        return;
    }

    if (req.method === 'PATCH') {
        await handlePatch(req, res, env);
        return;
    }

    sendJson(res, 405, { error: 'Método não suportado.' });
};

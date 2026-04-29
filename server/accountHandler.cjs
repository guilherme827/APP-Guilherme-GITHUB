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

async function authenticateUser(req, env) {
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

    return { user: authData.user, serviceClient };
}

function normalizePermissions(permissions, role = 'user') {
    return accessPolicy.normalizePermissions(permissions, role);
}

function normalizeFolderAccess(folderAccess, role = 'user') {
    return accessPolicy.normalizeFolderAccess(folderAccess, role);
}

function normalizeRole(role, email = '') {
    return accessPolicy.normalizeRoleName(role);
}

async function ensureOwnProfile(auth) {
    const userId = String(auth.user?.id || '').trim();
    const userEmail = String(auth.user?.email || '').trim().toLowerCase();
    const metadata = auth.user?.user_metadata || {};

    const { data: existingProfile } = await auth.serviceClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    let emailProfile = null;
    if (userEmail) {
        const { data } = await auth.serviceClient
            .from('profiles')
            .select('*')
            .eq('email', userEmail)
            .order('updated_at', { ascending: false })
            .limit(1);
        emailProfile = Array.isArray(data) ? data[0] || null : null;
    }

    const role = normalizeRole(
        existingProfile?.role || metadata?.role || emailProfile?.role,
        userEmail
    );
    const fullName = String(existingProfile?.full_name || metadata?.full_name || emailProfile?.full_name || '').trim();
    const gender = ['masculino', 'feminino', 'neutro'].includes(String(existingProfile?.gender || metadata?.gender || emailProfile?.gender || '').trim())
        ? String(existingProfile?.gender || metadata?.gender || emailProfile?.gender || 'neutro').trim()
        : 'neutro';
    const organizationId = existingProfile?.organization_id || metadata?.organization_id || emailProfile?.organization_id || null;
    const permissions = normalizePermissions(
        existingProfile?.permissions || metadata?.permissions || emailProfile?.permissions,
        role
    );
    const folderAccess = normalizeFolderAccess(
        existingProfile?.folder_access || metadata?.folder_access || emailProfile?.folder_access,
        role
    );

    const shouldPersist = !existingProfile
        || existingProfile.email !== userEmail
        || existingProfile.role !== role
        || String(existingProfile.organization_id || '') !== String(organizationId || '')
        || JSON.stringify(existingProfile.permissions || {}) !== JSON.stringify(permissions)
        || JSON.stringify(existingProfile.folder_access || []) !== JSON.stringify(folderAccess)
        || String(existingProfile.full_name || '').trim() !== fullName
        || String(existingProfile.gender || '').trim() !== gender;

    let profile = existingProfile;
    if (shouldPersist) {
        const { data, error } = await auth.serviceClient
            .from('profiles')
            .upsert({
                id: userId,
                email: userEmail,
                full_name: fullName,
                gender,
                role,
                organization_id: organizationId,
                permissions,
                folder_access: folderAccess
            })
            .select('*')
            .single();

        if (error) {
            throw new Error(error.message || 'Não foi possível sincronizar o perfil do usuário.');
        }
        profile = data;
    }

    const metadataPayload = {
        ...metadata,
        full_name: fullName,
        gender,
        role,
        organization_id: organizationId,
        permissions,
        folder_access: folderAccess
    };

    const metadataNeedsSync = JSON.stringify({
        full_name: metadata?.full_name || '',
        gender: metadata?.gender || 'neutro',
        role: metadata?.role || '',
        organization_id: metadata?.organization_id || null,
        permissions: metadata?.permissions || null,
        folder_access: metadata?.folder_access || null
    }) !== JSON.stringify({
        full_name: fullName,
        gender,
        role,
        organization_id: organizationId,
        permissions,
        folder_access: folderAccess
    });

    if (metadataNeedsSync) {
        await auth.serviceClient.auth.admin.updateUserById(userId, {
            user_metadata: metadataPayload
        });
    }

    return profile;
}

async function handleGet(req, res, env) {
    const auth = await authenticateUser(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }

    try {
        const profile = await ensureOwnProfile(auth);
        sendJson(res, 200, { data: profile });
    } catch (error) {
        sendJson(res, 500, { error: error.message || 'Não foi possível carregar o perfil.' });
    }
}

async function handlePatch(req, res, env) {
    const auth = await authenticateUser(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }

    let body;
    try {
        body = await parseBody(req);
    } catch {
        sendJson(res, 400, { error: 'Payload inválido.' });
        return;
    }

    const fullName = String(body.full_name || '').trim();
    const gender = ['masculino', 'feminino', 'neutro'].includes(String(body.gender || '').trim())
        ? String(body.gender || 'neutro').trim()
        : 'neutro';

    if (!fullName) {
        sendJson(res, 400, { error: 'Nome completo é obrigatório.' });
        return;
    }

    const { data, error } = await auth.serviceClient
        .from('profiles')
        .update({
            full_name: fullName,
            gender
        })
        .eq('id', auth.user.id)
        .select('*')
        .single();

    if (error) {
        sendJson(res, 500, { error: error.message || 'Não foi possível atualizar o perfil.' });
        return;
    }

    await auth.serviceClient.auth.admin.updateUserById(auth.user.id, {
        user_metadata: {
            ...(auth.user.user_metadata || {}),
            full_name: fullName,
            gender
        }
    });

    sendJson(res, 200, { data });
}

async function accountHandler(req, res, env = process.env) {
    if (req.method === 'GET') {
        await handleGet(req, res, env);
        return;
    }

    if (req.method === 'PATCH') {
        await handlePatch(req, res, env);
        return;
    }

    sendJson(res, 405, { error: 'Método não suportado.' });
}

module.exports = accountHandler;
module.exports.sendJson = sendJson;
module.exports.parseBody = parseBody;
module.exports.getClients = getClients;
module.exports.authenticateUser = authenticateUser;
module.exports.ensureOwnProfile = ensureOwnProfile;

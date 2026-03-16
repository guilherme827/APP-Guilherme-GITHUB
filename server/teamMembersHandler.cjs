const { createClient } = require('@supabase/supabase-js');

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

async function authenticateAdmin(req, env) {
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
        return { error: { status: 403, message: profileError?.message || 'Perfil do usuário não encontrado.' } };
    }

    if (profile.role !== 'admin') {
        return { error: { status: 403, message: 'Apenas administradores podem gerenciar a equipe.' } };
    }

    if (!profile.organization_id) {
        return { error: { status: 403, message: 'Administrador sem organização vinculada.' } };
    }

    return { serviceClient, adminProfile: profile };
}

function sanitizeMemberPayload(payload = {}) {
    const permissions = payload.permissions && typeof payload.permissions === 'object'
        ? {
            view: payload.permissions.view !== false,
            edit: payload.permissions.edit === true,
            delete: payload.permissions.delete === true
        }
        : { view: true, edit: false, delete: false };

    const folderAccess = Array.isArray(payload.folder_access)
        ? [...new Set(payload.folder_access.filter(Boolean).map((item) => String(item).trim()))]
        : [];

    return {
        full_name: String(payload.full_name || '').trim(),
        email: String(payload.email || '').trim().toLowerCase(),
        password: String(payload.password || ''),
        gender: String(payload.gender || '').trim() || 'neutro',
        role: String(payload.role || 'user').trim() === 'admin' ? 'admin' : 'user',
        permissions,
        folder_access: folderAccess
    };
}

async function handleGet(req, res, env) {
    const auth = await authenticateAdmin(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }

    const { data, error } = await auth.serviceClient
        .from('profiles')
        .select('*')
        .eq('organization_id', auth.adminProfile.organization_id)
        .order('email', { ascending: true });

    if (error) {
        sendJson(res, 500, { error: error.message || 'Não foi possível listar os membros.' });
        return;
    }

    sendJson(res, 200, { data: data || [] });
}

async function handlePost(req, res, env) {
    const auth = await authenticateAdmin(req, env);
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

    const payload = sanitizeMemberPayload(body);
    if (!payload.full_name || !payload.email || !payload.password) {
        sendJson(res, 400, { error: 'Nome, e-mail e senha inicial são obrigatórios.' });
        return;
    }

    const { data: createdUserData, error: createError } = await auth.serviceClient.auth.admin.createUser({
        email: payload.email,
        password: payload.password,
        email_confirm: true,
        user_metadata: {
            full_name: payload.full_name,
            
            gender: payload.gender,
            role: payload.role,
            organization_id: auth.adminProfile.organization_id
        }
    });

    if (createError || !createdUserData?.user) {
        sendJson(res, 500, { error: createError?.message || 'Não foi possível criar o usuário.' });
        return;
    }

    const { data: profile, error: profileError } = await auth.serviceClient
        .from('profiles')
        .upsert({
            id: createdUserData.user.id,
            email: payload.email,
            full_name: payload.full_name,
            
            gender: payload.gender,
            role: payload.role,
            organization_id: auth.adminProfile.organization_id,
            permissions: payload.permissions,
            folder_access: payload.folder_access
        })
        .select('*')
        .single();

    if (profileError) {
        sendJson(res, 500, { error: profileError.message || 'Usuário criado, mas falhou ao persistir o perfil.' });
        return;
    }

    sendJson(res, 201, { data: profile });
}

async function handlePatch(req, res, env) {
    const auth = await authenticateAdmin(req, env);
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

    const memberId = String(body.id || '').trim();
    if (!memberId) {
        sendJson(res, 400, { error: 'ID do perfil é obrigatório.' });
        return;
    }

    const payload = sanitizeMemberPayload(body);

    const updatePayload = {
        full_name: payload.full_name,
        
        gender: payload.gender,
        role: payload.role,
        permissions: payload.permissions,
        folder_access: payload.folder_access
    };

    const { data, error } = await auth.serviceClient
        .from('profiles')
        .update(updatePayload)
        .eq('id', memberId)
        .eq('organization_id', auth.adminProfile.organization_id)
        .select('*')
        .single();

    if (error) {
        sendJson(res, 500, { error: error.message || 'Não foi possível atualizar o membro.' });
        return;
    }

    sendJson(res, 200, { data });
}

module.exports = async function teamMembersHandler(req, res, env = process.env) {
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

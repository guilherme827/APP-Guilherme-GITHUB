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
            if (!raw) return resolve({});
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

async function authenticateRequester(req, env) {
    const { anonClient, serviceClient } = getClients(env);
    const authorization = String(req.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

    if (!token) return { error: { status: 401, message: 'Token de autenticação ausente.' } };

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

    return { user: authData.user, profile, serviceClient };
}

async function writeActivityLog(auth, payload) {
    await auth.serviceClient.from('activity_logs').insert({
        organization_id: auth.profile.organization_id,
        user_id: auth.user.id,
        user_name: auth.profile.full_name || auth.user.email || 'Usuário',
        action_type: payload.action_type,
        entity_type: 'PROJETO',
        entity_id: String(payload.entity_id),
        entity_label: String(payload.entity_label || 'Projeto'),
        details: payload.details ? JSON.stringify(payload.details) : null
    });
}

async function handleGet(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) return sendJson(res, auth.error.status, { error: auth.error.message });

    const { data: trashedData } = await auth.serviceClient
        .from('trash')
        .select('item_id')
        .eq('organization_id', auth.profile.organization_id)
        .eq('item_type', 'projeto');
    const trashedIds = new Set((trashedData || []).map((row) => String(row.item_id)));

    const { data, error } = await auth.serviceClient
        .from('projects')
        .select('*')
        .eq('organization_id', auth.profile.organization_id)
        .order('name', { ascending: true });

    if (error) return sendJson(res, 500, { error: error.message || 'Não foi possível carregar os projetos.' });

    sendJson(res, 200, { data: (data || []).filter((row) => !trashedIds.has(String(row.id))) });
}

async function handlePost(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) return sendJson(res, auth.error.status, { error: auth.error.message });

    let body;
    try {
        body = await parseBody(req);
    } catch {
        return sendJson(res, 400, { error: 'Payload inválido.' });
    }

    const payload = {
        ...body,
        organization_id: auth.profile.organization_id
    };

    const { data, error } = await auth.serviceClient
        .from('projects')
        .insert(payload)
        .select('*')
        .single();

    if (error) return sendJson(res, 500, { error: error.message || 'Erro ao salvar projeto.' });

    await writeActivityLog(auth, {
        action_type: 'CREATE',
        entity_id: data.id,
        entity_label: data.name,
        details: { client_id: data.client_id, name: data.name }
    });

    sendJson(res, 201, { data });
}

async function handlePatch(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) return sendJson(res, auth.error.status, { error: auth.error.message });

    let body;
    try {
        body = await parseBody(req);
    } catch {
        return sendJson(res, 400, { error: 'Payload inválido.' });
    }

    const projectId = String(body.id || '').trim();
    if (!projectId) return sendJson(res, 400, { error: 'ID do projeto é obrigatório.' });

    const updatePayload = {
        ...body,
        organization_id: auth.profile.organization_id
    };
    delete updatePayload.id;

    const { data, error } = await auth.serviceClient
        .from('projects')
        .update(updatePayload)
        .eq('id', projectId)
        .eq('organization_id', auth.profile.organization_id)
        .select('*')
        .single();

    if (error) return sendJson(res, 500, { error: error.message || 'Erro ao atualizar projeto.' });

    await writeActivityLog(auth, {
        action_type: 'UPDATE',
        entity_id: data.id,
        entity_label: data.name,
        details: { client_id: data.client_id, name: data.name }
    });

    sendJson(res, 200, { data });
}

module.exports = async function projectsHandler(req, res, env = process.env) {
    if (req.method === 'GET') return handleGet(req, res, env);
    if (req.method === 'POST') return handlePost(req, res, env);
    if (req.method === 'PATCH') return handlePatch(req, res, env);
    sendJson(res, 405, { error: 'Método não suportado.' });
};

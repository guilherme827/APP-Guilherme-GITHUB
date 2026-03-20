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

async function handleGet(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }

    const url = new URL(req.url, 'http://localhost');
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 200)));

    const { data, error } = await auth.serviceClient
        .from('activity_logs')
        .select('*')
        .eq('organization_id', auth.profile.organization_id)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        sendJson(res, 500, { error: error.message || 'Não foi possível carregar o registro de atividades.' });
        return;
    }

    sendJson(res, 200, { data: data || [] });
}

async function handlePost(req, res, env) {
    const auth = await authenticateRequester(req, env);
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

    const payload = {
        organization_id: auth.profile.organization_id,
        user_id: auth.user.id,
        user_name: auth.profile.full_name || auth.user.email || 'Usuário',
        action_type: String(body.action_type || '').trim(),
        entity_type: String(body.entity_type || '').trim(),
        entity_id: String(body.entity_id || '').trim(),
        entity_label: String(body.entity_label || '').trim() || 'Item desconhecido',
        details: body.details ? JSON.stringify(body.details) : null
    };

    if (!payload.action_type || !payload.entity_type || !payload.entity_id) {
        sendJson(res, 400, { error: 'Ação, entidade e ID são obrigatórios.' });
        return;
    }

    const { data, error } = await auth.serviceClient
        .from('activity_logs')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
        sendJson(res, 500, { error: error.message || 'Não foi possível registrar a atividade.' });
        return;
    }

    sendJson(res, 201, { data });
}

module.exports = async function activityLogsHandler(req, res, env = process.env) {
    if (req.method === 'GET') {
        await handleGet(req, res, env);
        return;
    }
    if (req.method === 'POST') {
        await handlePost(req, res, env);
        return;
    }
    sendJson(res, 405, { error: 'Método não suportado.' });
};

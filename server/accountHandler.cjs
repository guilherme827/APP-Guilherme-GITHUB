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

module.exports = async function accountHandler(req, res, env = process.env) {
    if (req.method === 'PATCH') {
        await handlePatch(req, res, env);
        return;
    }

    sendJson(res, 405, { error: 'Método não suportado.' });
};

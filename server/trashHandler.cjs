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
        entity_type: payload.entity_type,
        entity_id: String(payload.entity_id),
        entity_label: String(payload.entity_label || 'Item desconhecido'),
        details: payload.details ? JSON.stringify(payload.details) : null
    });
}

async function handleGet(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) return sendJson(res, auth.error.status, { error: auth.error.message });

    const { data, error } = await auth.serviceClient
        .from('trash')
        .select('*')
        .eq('organization_id', auth.profile.organization_id)
        .order('deleted_at', { ascending: false });

    if (error) return sendJson(res, 500, { error: error.message || 'Não foi possível carregar a lixeira.' });

    sendJson(res, 200, { data: data || [] });
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
        organization_id: auth.profile.organization_id,
        item_type: String(body.item_type || '').trim(),
        item_id: String(body.item_id || '').trim(),
        item_label: String(body.item_label || '').trim(),
        item_data: body.item_data || {},
        storage_paths: Array.isArray(body.storage_paths) ? body.storage_paths.filter(Boolean) : [],
        deleted_by: auth.user?.id || null,
        deleted_at: new Date().toISOString()
    };

    if (!payload.item_type || !payload.item_id || !payload.item_label) {
        return sendJson(res, 400, { error: 'Tipo, ID e nome do item são obrigatórios.' });
    }

    const { data, error } = await auth.serviceClient
        .from('trash')
        .insert(payload)
        .select('*')
        .single();

    if (error) return sendJson(res, 500, { error: error.message || 'Não foi possível mover o item para a lixeira.' });

    await writeActivityLog(auth, {
        action_type: 'SOFT_DELETE',
        entity_type: payload.item_type === 'titular' ? 'TITULAR' : payload.item_type === 'processo' ? 'PROCESSO' : 'PROJETO',
        entity_id: payload.item_id,
        entity_label: payload.item_label
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

    const trashId = String(body.id || '').trim();
    if (!trashId) return sendJson(res, 400, { error: 'ID da lixeira é obrigatório.' });

    const { data: item, error: itemError } = await auth.serviceClient
        .from('trash')
        .select('*')
        .eq('id', trashId)
        .eq('organization_id', auth.profile.organization_id)
        .single();

    if (itemError || !item) return sendJson(res, 404, { error: itemError?.message || 'Item não encontrado na lixeira.' });

    const { error } = await auth.serviceClient
        .from('trash')
        .delete()
        .eq('id', trashId)
        .eq('organization_id', auth.profile.organization_id);

    if (error) return sendJson(res, 500, { error: error.message || 'Não foi possível restaurar o item.' });

    await writeActivityLog(auth, {
        action_type: 'RESTORE',
        entity_type: item.item_type === 'titular' ? 'TITULAR' : item.item_type === 'processo' ? 'PROCESSO' : 'PROJETO',
        entity_id: item.item_id,
        entity_label: item.item_label
    });

    sendJson(res, 200, { data: { id: trashId } });
}

async function handleDelete(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) return sendJson(res, auth.error.status, { error: auth.error.message });

    let body;
    try {
        body = await parseBody(req);
    } catch {
        return sendJson(res, 400, { error: 'Payload inválido.' });
    }

    const trashId = String(body.id || '').trim();
    const emptyAll = body.empty_all === true;

    const { data: items, error: itemsError } = await auth.serviceClient
        .from('trash')
        .select('*')
        .eq('organization_id', auth.profile.organization_id)
        .order('deleted_at', { ascending: false });

    if (itemsError) return sendJson(res, 500, { error: itemsError.message || 'Não foi possível carregar a lixeira.' });

    const targets = emptyAll
        ? (items || [])
        : (items || []).filter((item) => String(item.id) === trashId);

    if (!emptyAll && targets.length === 0) {
        return sendJson(res, 404, { error: 'Item não encontrado na lixeira.' });
    }

    for (const item of targets) {
        const storagePaths = Array.isArray(item.storage_paths) ? item.storage_paths.filter(Boolean) : [];
        if (storagePaths.length > 0) {
            await auth.serviceClient.storage.from('documentos').remove(storagePaths);
        }

        if (item.item_type === 'titular') {
            await auth.serviceClient.from('clients').delete().eq('id', item.item_id).eq('organization_id', auth.profile.organization_id);
        } else if (item.item_type === 'processo') {
            await auth.serviceClient.from('processes').delete().eq('id', item.item_id).eq('organization_id', auth.profile.organization_id);
        } else if (item.item_type === 'projeto') {
            await auth.serviceClient.from('projects').delete().eq('id', item.item_id).eq('organization_id', auth.profile.organization_id);
        }

        await auth.serviceClient.from('trash').delete().eq('id', item.id).eq('organization_id', auth.profile.organization_id);

        await writeActivityLog(auth, {
            action_type: 'PERMANENT_DELETE',
            entity_type: item.item_type === 'titular' ? 'TITULAR' : item.item_type === 'processo' ? 'PROCESSO' : 'PROJETO',
            entity_id: item.item_id,
            entity_label: item.item_label
        });
    }

    sendJson(res, 200, { data: { deleted: targets.length } });
}

module.exports = async function trashHandler(req, res, env = process.env) {
    if (req.method === 'POST') {
        await handlePost(req, res, env);
        return;
    }
    if (req.method === 'GET') {
        await handleGet(req, res, env);
        return;
    }
    if (req.method === 'PATCH') {
        await handlePatch(req, res, env);
        return;
    }
    if (req.method === 'DELETE') {
        await handleDelete(req, res, env);
        return;
    }
    sendJson(res, 405, { error: 'Método não suportado.' });
};

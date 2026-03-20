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
        return { error: { status: 403, message: profileError?.message || 'Perfil do usuário não encontrado.' } };
    }

    if (!profile.organization_id) {
        return { error: { status: 403, message: 'Usuário sem organização vinculada.' } };
    }

    return { user: authData.user, profile, serviceClient };
}

async function handleGet(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }

    const { data: trashedData, error: trashedError } = await auth.serviceClient
        .from('trash')
        .select('item_id')
        .eq('organization_id', auth.profile.organization_id)
        .eq('item_type', 'processo');

    if (trashedError) {
        sendJson(res, 500, { error: trashedError.message || 'Não foi possível carregar a lixeira de processos.' });
        return;
    }

    const trashedIds = new Set((trashedData || []).map((row) => String(row.item_id)));

    const { data, error } = await auth.serviceClient
        .from('processes')
        .select('*')
        .eq('organization_id', auth.profile.organization_id)
        .order('id', { ascending: true });

    if (error) {
        sendJson(res, 500, { error: error.message || 'Não foi possível carregar os processos.' });
        return;
    }

    sendJson(res, 200, { data: (data || []).filter((row) => !trashedIds.has(String(row.id))) });
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
        ...body,
        organization_id: auth.profile.organization_id
    };

    const { data, error } = await auth.serviceClient
        .from('processes')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
        sendJson(res, 500, { error: error.message || 'Não foi possível salvar o processo.' });
        return;
    }

    await auth.serviceClient.from('activity_logs').insert({
        organization_id: auth.profile.organization_id,
        user_id: auth.user.id,
        user_name: auth.profile.full_name || auth.user.email || 'Usuário',
        action_type: 'CREATE',
        entity_type: 'PROCESSO',
        entity_id: String(data.id),
        entity_label: [data.numero_processo, data.tipo, data.municipio].filter(Boolean).join(' · ') || `Processo #${data.id}`
    });

    sendJson(res, 201, { data });
}

async function handlePatch(req, res, env) {
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

    const processId = body?.id;
    if (processId == null || processId === '') {
        sendJson(res, 400, { error: 'ID do processo é obrigatório.' });
        return;
    }

    const updatePayload = {
        ...body,
        organization_id: auth.profile.organization_id
    };
    delete updatePayload.id;

    const { data, error } = await auth.serviceClient
        .from('processes')
        .update(updatePayload)
        .eq('id', processId)
        .eq('organization_id', auth.profile.organization_id)
        .select('*')
        .single();

    if (error) {
        sendJson(res, 500, { error: error.message || 'Não foi possível atualizar o processo.' });
        return;
    }

    await auth.serviceClient.from('activity_logs').insert({
        organization_id: auth.profile.organization_id,
        user_id: auth.user.id,
        user_name: auth.profile.full_name || auth.user.email || 'Usuário',
        action_type: 'UPDATE',
        entity_type: 'PROCESSO',
        entity_id: String(data.id),
        entity_label: [data.numero_processo, data.tipo, data.municipio].filter(Boolean).join(' · ') || `Processo #${data.id}`
    });

    sendJson(res, 200, { data });
}

async function handleDelete(req, res, env) {
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

    const processId = body?.id;
    if (processId == null || processId === '') {
        sendJson(res, 400, { error: 'ID do processo é obrigatório.' });
        return;
    }

    const { data: process, error: processError } = await auth.serviceClient
        .from('processes')
        .select('*')
        .eq('id', processId)
        .eq('organization_id', auth.profile.organization_id)
        .single();

    if (processError || !process) {
        sendJson(res, 404, { error: processError?.message || 'Processo não encontrado.' });
        return;
    }

    const storagePaths = [];
    if (process.doc_storage_path) storagePaths.push(process.doc_storage_path);
    (Array.isArray(process.events) ? process.events : []).forEach((event) => {
        (Array.isArray(event.documents) ? event.documents : []).forEach((doc) => {
            const path = doc?.storagePath || doc?.storage_path;
            if (path && typeof path === 'string') storagePaths.push(path);
        });
    });

    const itemLabel = [process.numero_processo, process.tipo, process.municipio]
        .filter(Boolean)
        .join(' · ') || `Processo #${processId}`;

    const { error: trashError } = await auth.serviceClient
        .from('trash')
        .insert({
            organization_id: auth.profile.organization_id,
            item_type: 'processo',
            item_id: String(processId),
            item_label: itemLabel,
            item_data: process,
            storage_paths: storagePaths,
            deleted_by: auth.user?.id || null,
            deleted_at: new Date().toISOString()
        });

    if (trashError) {
        sendJson(res, 500, { error: trashError.message || 'Não foi possível mover o processo para a lixeira.' });
        return;
    }

    await auth.serviceClient.from('activity_logs').insert({
        organization_id: auth.profile.organization_id,
        user_id: auth.user.id,
        user_name: auth.profile.full_name || auth.user.email || 'Usuário',
        action_type: 'SOFT_DELETE',
        entity_type: 'PROCESSO',
        entity_id: String(processId),
        entity_label: itemLabel
    });

    sendJson(res, 200, { data: { id: processId, item_label: itemLabel } });
}

module.exports = async function processesHandler(req, res, env = process.env) {
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

    if (req.method === 'DELETE') {
        await handleDelete(req, res, env);
        return;
    }

    sendJson(res, 405, { error: 'Método não suportado.' });
};

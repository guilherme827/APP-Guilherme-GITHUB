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

async function authenticateRequester(req, env) {
    const { anonClient, serviceClient } = getClients(env);
    const authorization = String(req.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

    if (!token) {
        return { error: { status: 401, message: 'Token de autenticacao ausente.' } };
    }

    const { data: authData, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !authData?.user) {
        return { error: { status: 401, message: authError?.message || 'Sessao invalida.' } };
    }

    const { data: profile, error: profileError } = await serviceClient
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

    if (profileError || !profile) {
        return { error: { status: 403, message: profileError?.message || 'Perfil do usuario nao encontrado.' } };
    }

    if (!profile.organization_id) {
        return { error: { status: 403, message: 'Usuario sem organizacao vinculada.' } };
    }

    if (!accessPolicy.isAdminRole(profile.role)) {
        return { error: { status: 403, message: 'Apenas administradores podem gerenciar a base de conhecimento.' } };
    }

    return { user: authData.user, profile, serviceClient };
}

function normalizeText(value) {
    return String(value || '').trim();
}

function buildClientName(client) {
    return client.type === 'PF'
        ? (client.nome || 'Titular')
        : (client.nome_fantasia || client.nome_empresarial || 'Empresa');
}

function buildClientChunk(client) {
    const clientName = buildClientName(client);
    const docs = Array.isArray(client.documents) ? client.documents : [];
    const content = [
        `Titular ${clientName}.`,
        `Tipo: ${client.type || '-'}.`,
        `Documento: ${client.cpf || client.cnpj || '-'}.`,
        `Email: ${client.email || '-'}. Telefone: ${client.telefone || '-'}.`,
        `Endereco: ${[client.logradouro, client.numero, client.bairro, client.cidade, client.uf, client.cep].filter(Boolean).join(', ') || '-'}.`,
        docs.length ? `Documentos de cadastro: ${docs.map((doc) => doc?.name || doc).filter(Boolean).join(', ')}.` : ''
    ].filter(Boolean).join(' ');

    return {
        entity_type: 'titular',
        entity_id: String(client.id),
        source_scope: 'client_profile',
        title: `Titular ${clientName}`,
        content,
        search_text: `${clientName} ${client.cpf || ''} ${client.cnpj || ''} ${client.email || ''} ${client.cidade || ''}`.toLowerCase(),
        metadata: {
            client_id: client.id,
            type: client.type || '',
            document_count: docs.length
        }
    };
}

function buildProcessChunks(processItem, clientName = '') {
    const chunks = [];
    const rootDoc = processItem.doc_name ? [processItem.doc_name] : [];
    const events = Array.isArray(processItem.events) ? processItem.events : [];
    const deadlines = Array.isArray(processItem.deadlines) ? processItem.deadlines : [];

    chunks.push({
        entity_type: 'processo',
        entity_id: String(processItem.id),
        source_scope: 'process_summary',
        title: `Processo ${processItem.numero_processo || processItem.numero_titulo || processItem.id}`,
        content: [
            `Titular: ${clientName || '-'}.`,
            `Numero do processo: ${processItem.numero_processo || '-'}.`,
            `Numero do titulo: ${processItem.numero_titulo || '-'}.`,
            `Fase: ${processItem.fase || '-'}. Tipo: ${processItem.tipo || '-'} (${processItem.tipo_sigla || '-' }).`,
            `Tipologia: ${processItem.tipologia || '-'}.`,
            `Projeto: ${processItem.project_name || 'sem projeto'}.`,
            `Municipio: ${processItem.municipio || '-'}.`,
            `Orgao: ${processItem.orgao_sigla || processItem.orgao_nome_completo || '-'}.`,
            `Datas: protocolo=${processItem.data_protocolo || '-'}, outorga=${processItem.data_outorga || '-'}, validade=${processItem.data_validade || '-'}.`,
            rootDoc.length ? `Documento principal: ${rootDoc.join(', ')}.` : ''
        ].filter(Boolean).join(' '),
        search_text: [
            processItem.numero_processo,
            processItem.numero_titulo,
            processItem.tipo,
            processItem.tipologia,
            processItem.project_name,
            processItem.municipio,
            processItem.orgao_sigla,
            clientName
        ].filter(Boolean).join(' ').toLowerCase(),
        metadata: {
            process_id: processItem.id,
            client_id: processItem.client_id,
            project_name: processItem.project_name || '',
            event_count: events.length,
            deadline_count: deadlines.length
        }
    });

    deadlines.forEach((deadline, index) => {
        chunks.push({
            entity_type: 'processo',
            entity_id: String(processItem.id),
            source_scope: 'process_deadline',
            title: `Prazo ${index + 1} do processo ${processItem.numero_processo || processItem.id}`,
            content: `Prazo do processo ${processItem.numero_processo || processItem.id}: ${deadline.desc || deadline.reference || 'sem descricao'} | data=${deadline.date || 'sem data'} | status=${deadline.status || 'pending'}.`,
            search_text: `${processItem.numero_processo || ''} ${deadline.desc || ''} ${deadline.reference || ''} ${clientName}`.toLowerCase(),
            metadata: {
                process_id: processItem.id,
                deadline_id: deadline.id || null
            }
        });
    });

    events.forEach((event, index) => {
        const docNames = (Array.isArray(event.documents) ? event.documents : []).map((doc) => doc?.name).filter(Boolean);
        chunks.push({
            entity_type: 'processo',
            entity_id: String(processItem.id),
            source_scope: 'process_event',
            title: `Evento ${index + 1} do processo ${processItem.numero_processo || processItem.id}`,
            content: `Evento do processo ${processItem.numero_processo || processItem.id}: ${event.description || 'sem descricao'} | tipo=${event.type || 'movimentacao'} | data=${event.date || 'sem data'}${docNames.length ? ` | documentos=${docNames.join(', ')}` : ''}.`,
            search_text: `${processItem.numero_processo || ''} ${event.description || ''} ${event.type || ''} ${docNames.join(' ')} ${clientName}`.toLowerCase(),
            metadata: {
                process_id: processItem.id,
                event_id: event.id || null,
                document_count: docNames.length
            }
        });
    });

    return chunks;
}

async function loadKnowledgeStats(serviceClient, organizationId) {
    const { data, error } = await serviceClient
        .from('ai_knowledge_chunks')
        .select('id, entity_type, source_scope, updated_at')
        .eq('organization_id', organizationId);

    if (error) {
        throw new Error(error.message || 'Nao foi possivel carregar a base de conhecimento.');
    }

    return {
        total_chunks: (data || []).length,
        by_entity_type: (data || []).reduce((acc, item) => {
            const key = item.entity_type || 'desconhecido';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {}),
        by_scope: (data || []).reduce((acc, item) => {
            const key = item.source_scope || 'desconhecido';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {}),
        last_updated_at: (data || []).sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0]?.updated_at || null
    };
}

async function rebuildKnowledge(serviceClient, organizationId) {
    const [trashRes, clientsRes, processesRes] = await Promise.all([
        serviceClient.from('trash').select('item_id,item_type').eq('organization_id', organizationId),
        serviceClient.from('clients').select('*').eq('organization_id', organizationId),
        serviceClient.from('processes').select('*').eq('organization_id', organizationId)
    ]);

    if (trashRes.error) throw new Error(trashRes.error.message || 'Nao foi possivel carregar a lixeira para indexacao.');
    if (clientsRes.error) throw new Error(clientsRes.error.message || 'Nao foi possivel carregar os titulares para indexacao.');
    if (processesRes.error) throw new Error(processesRes.error.message || 'Nao foi possivel carregar os processos para indexacao.');

    const trashed = new Set((trashRes.data || []).map((item) => `${item.item_type}:${item.item_id}`));
    const clients = (clientsRes.data || []).filter((item) => !trashed.has(`titular:${item.id}`));
    const processes = (processesRes.data || []).filter((item) => !trashed.has(`processo:${item.id}`));
    const clientById = new Map(clients.map((item) => [String(item.id), item]));

    const chunkPayload = [
        ...clients.map(buildClientChunk),
        ...processes.flatMap((processItem) => buildProcessChunks(processItem, buildClientName(clientById.get(String(processItem.client_id)) || {})))
    ].map((item) => ({
        organization_id: organizationId,
        ...item
    }));

    const removeResult = await serviceClient
        .from('ai_knowledge_chunks')
        .delete()
        .eq('organization_id', organizationId);

    if (removeResult.error) {
        throw new Error(removeResult.error.message || 'Nao foi possivel limpar a base anterior.');
    }

    if (chunkPayload.length > 0) {
        const insertResult = await serviceClient.from('ai_knowledge_chunks').insert(chunkPayload);
        if (insertResult.error) {
            throw new Error(insertResult.error.message || 'Nao foi possivel reconstruir a base de conhecimento.');
        }
    }

    return {
        inserted_chunks: chunkPayload.length,
        clients_indexed: clients.length,
        processes_indexed: processes.length
    };
}

module.exports = async function aiKnowledgeHandler(req, res, env = process.env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }

    try {
        if (req.method === 'GET') {
            const stats = await loadKnowledgeStats(auth.serviceClient, auth.profile.organization_id);
            sendJson(res, 200, { data: stats });
            return;
        }

        if (req.method === 'POST') {
            let body;
            try {
                body = await parseBody(req);
            } catch {
                sendJson(res, 400, { error: 'Payload invalido.' });
                return;
            }

            if (String(body.action || '') !== 'rebuild') {
                sendJson(res, 400, { error: 'Acao nao suportada.' });
                return;
            }

            const result = await rebuildKnowledge(auth.serviceClient, auth.profile.organization_id);
            sendJson(res, 200, { data: result });
            return;
        }

        sendJson(res, 405, { error: 'Metodo nao suportado.' });
    } catch (error) {
        sendJson(res, 500, { error: error.message || 'Nao foi possivel gerenciar a base de conhecimento.' });
    }
};

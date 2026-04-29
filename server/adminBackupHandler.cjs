const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const JSZip = require('jszip');
const accessPolicy = require('../shared/accessPolicy.cjs');

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

function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
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
        return { error: { status: 403, message: 'Apenas administradores podem gerar backup.' } };
    }

    return { user: authData.user, profile, serviceClient };
}

function normalizeText(value) {
    return String(value || '').trim();
}

function safeFileName(value, fallback = 'item') {
    const normalized = normalizeText(value)
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized || fallback;
}

function buildClientDisplayName(client) {
    if (!client) return 'Titular';
    return client.type === 'PF'
        ? (client.nome || 'Titular')
        : (client.nome_fantasia || client.nome_empresarial || 'Empresa');
}

function buildClientDocument(client) {
    return client?.type === 'PF' ? (client?.cpf || '') : (client?.cnpj || '');
}

function buildProcessDisplayName(processItem) {
    return processItem.numero_processo || processItem.numero_titulo || processItem.tipo || `processo-${processItem.id}`;
}

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function objectToRows(data, preferredKeys = []) {
    const seen = new Set();
    const keys = [...preferredKeys, ...Object.keys(data || {}).filter((key) => !preferredKeys.includes(key))];
    return keys
        .filter((key) => {
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map((key) => {
            const value = data?.[key];
            const printable = typeof value === 'object' && value !== null
                ? JSON.stringify(value, null, 2)
                : String(value ?? '');
            return `<tr><th>${esc(key)}</th><td><pre>${esc(printable)}</pre></td></tr>`;
        })
        .join('');
}

function buildEntityHtml(title, subtitle, data, preferredKeys = []) {
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
</head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 24px; background: #f5f7fb; color: #0f172a;">
  <main style="max-width: 1100px; margin: 0 auto; background: #fff; border: 1px solid #dbe3ee; border-radius: 14px; padding: 20px;">
    <p style="margin:0; font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.12em;">Backup estruturado</p>
    <h1 style="margin: 8px 0 8px;">${esc(title)}</h1>
    <p style="margin:0 0 18px; color:#64748b;">${esc(subtitle)}</p>
    <table style="width:100%; border-collapse: collapse;">
      <tbody>
        ${objectToRows(data, preferredKeys)}
      </tbody>
    </table>
  </main>
</body>
</html>`;
}

async function downloadStorageFile(serviceClient, storagePath) {
    const { data, error } = await serviceClient.storage.from('documentos').download(storagePath);
    if (error || !data) {
        throw new Error(error?.message || `Nao foi possivel baixar ${storagePath}`);
    }

    if (typeof data.arrayBuffer === 'function') {
        const buffer = Buffer.from(await data.arrayBuffer());
        return buffer;
    }

    if (Buffer.isBuffer(data)) return data;
    return Buffer.from(data);
}

async function appendStorageDocument(zipFolder, serviceClient, storagePath, explicitName = '') {
    if (!storagePath) return;
    try {
        const buffer = await downloadStorageFile(serviceClient, storagePath);
        const fileName = safeFileName(explicitName || path.basename(storagePath), 'arquivo');
        zipFolder.file(fileName, buffer);
    } catch (_error) {
        zipFolder.file(`${safeFileName(explicitName || path.basename(storagePath), 'arquivo')}.erro.txt`, `Falha ao baixar arquivo do storage: ${storagePath}`);
    }
}

async function addClientBackup(clientFolder, client, serviceClient) {
    const cadastroFolder = clientFolder.folder('cadastro');
    cadastroFolder.file('titular.json', JSON.stringify(client, null, 2));
    cadastroFolder.file(
        'titular.html',
        buildEntityHtml(
            buildClientDisplayName(client),
            'Dados cadastrais do titular',
            client,
            ['type', 'nome', 'nome_fantasia', 'nome_empresarial', 'cpf', 'cnpj', 'email', 'telefone', 'logradouro', 'numero', 'bairro', 'cidade', 'uf', 'cep']
        )
    );

    const docsFolder = cadastroFolder.folder('documentos-cadastro');
    const docs = Array.isArray(client.documents) ? client.documents : [];
    for (let index = 0; index < docs.length; index += 1) {
        const doc = docs[index];
        const storagePath = doc?.storagePath || doc?.storage_path || '';
        const fileName = doc?.name || `documento-${index + 1}`;
        if (!storagePath) {
            docsFolder.file(`${safeFileName(fileName, `documento-${index + 1}`)}.sem-storage.txt`, 'Documento sem storagePath salvo.');
            continue;
        }
        await appendStorageDocument(docsFolder, serviceClient, storagePath, fileName);
    }
}

async function addProcessBackup(processFolder, processItem, serviceClient) {
    processFolder.file('processo.json', JSON.stringify(processItem, null, 2));
    processFolder.file(
        'processo.html',
        buildEntityHtml(
            buildProcessDisplayName(processItem),
            'Dados completos do processo',
            processItem,
            ['fase', 'tipo', 'tipo_sigla', 'tipologia', 'numero_processo', 'numero_titulo', 'municipio', 'orgao_nome_completo', 'orgao_sigla', 'project_name', 'data_protocolo', 'data_outorga', 'data_validade', 'area']
        )
    );

    const docsFolder = processFolder.folder('documentos-processo');
    if (processItem.doc_storage_path) {
        await appendStorageDocument(docsFolder, serviceClient, processItem.doc_storage_path, processItem.doc_name || 'documento-principal');
    }

    const events = Array.isArray(processItem.events) ? processItem.events : [];
    const extractRows = [];
    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
        const event = events[eventIndex];
        extractRows.push({
            data: event?.date || '',
            tipo: event?.type || '',
            descricao: event?.description || '',
            arquivos: Array.isArray(event?.documents) ? event.documents.length : 0
        });

        const docs = Array.isArray(event?.documents) ? event.documents : [];
        if (docs.length === 0) continue;
        const eventFolder = docsFolder.folder(`evento-${String(eventIndex + 1).padStart(2, '0')}-${safeFileName(event?.description || event?.type || 'movimentacao', 'evento')}`);
        for (let docIndex = 0; docIndex < docs.length; docIndex += 1) {
            const doc = docs[docIndex];
            const storagePath = doc?.storagePath || doc?.storage_path || '';
            const fileName = doc?.name || `documento-${docIndex + 1}`;
            if (!storagePath) {
                eventFolder.file(`${safeFileName(fileName, `documento-${docIndex + 1}`)}.sem-storage.txt`, 'Documento sem storagePath salvo.');
                continue;
            }
            await appendStorageDocument(eventFolder, serviceClient, storagePath, fileName);
        }
    }

    processFolder.file(
        'extrato-processo.json',
        JSON.stringify(extractRows.sort((a, b) => String(a.data || '').localeCompare(String(b.data || ''))), null, 2)
    );
}

function buildProjectBuckets(processes) {
    const buckets = new Map();
    for (const processItem of processes) {
        const projectName = normalizeText(processItem.project_name);
        if (!projectName) continue;
        if (!buckets.has(projectName)) buckets.set(projectName, []);
        buckets.get(projectName).push(processItem);
    }
    return buckets;
}

async function handleGet(req, res, env) {
    const auth = await authenticateRequester(req, env);
    if (auth.error) {
        sendJson(res, auth.error.status, { error: auth.error.message });
        return;
    }

    try {
        const orgId = auth.profile.organization_id;
        const [clientsResponse, processesResponse, trashResponse] = await Promise.all([
            auth.serviceClient.from('clients').select('*').eq('organization_id', orgId).order('id', { ascending: true }),
            auth.serviceClient.from('processes').select('*').eq('organization_id', orgId).order('id', { ascending: true }),
            auth.serviceClient.from('trash').select('item_id, item_type').eq('organization_id', orgId)
        ]);

        if (clientsResponse.error) {
            throw new Error(clientsResponse.error.message || 'Nao foi possivel carregar titulares.');
        }
        if (processesResponse.error) {
            throw new Error(processesResponse.error.message || 'Nao foi possivel carregar processos.');
        }
        if (trashResponse.error) {
            throw new Error(trashResponse.error.message || 'Nao foi possivel carregar a lixeira.');
        }

        const trashedClientIds = new Set((trashResponse.data || []).filter((item) => item.item_type === 'titular').map((item) => String(item.item_id)));
        const trashedProcessIds = new Set((trashResponse.data || []).filter((item) => item.item_type === 'processo').map((item) => String(item.item_id)));
        const clients = (clientsResponse.data || []).filter((client) => !trashedClientIds.has(String(client.id)));
        const processes = (processesResponse.data || []).filter((processItem) => !trashedProcessIds.has(String(processItem.id)));
        const zip = new JSZip();
        const generatedAt = new Date().toISOString();

        zip.file('manifest.json', JSON.stringify({
            generated_at: generatedAt,
            organization_id: orgId,
            generated_by: auth.user.email || auth.user.id,
            totals: {
                clients: clients.length,
                processes: processes.length
            }
        }, null, 2));

        const titularesFolder = zip.folder('Titulares');
        for (const client of clients) {
            const clientName = buildClientDisplayName(client);
            const clientFolder = titularesFolder.folder(`${safeFileName(clientName, `titular-${client.id}`)}__${safeFileName(buildClientDocument(client), String(client.id))}`);
            await addClientBackup(clientFolder, client, auth.serviceClient);

            const clientProcesses = processes.filter((processItem) => String(processItem.client_id) === String(client.id));
            const projectBuckets = buildProjectBuckets(clientProcesses);
            const looseProcesses = clientProcesses.filter((processItem) => !normalizeText(processItem.project_name));

            const projectsRoot = clientFolder.folder('projetos');
            for (const [projectName, projectProcesses] of projectBuckets.entries()) {
                const projectFolder = projectsRoot.folder(safeFileName(projectName, 'projeto'));
                for (const processItem of projectProcesses) {
                    const processFolder = projectFolder.folder(safeFileName(buildProcessDisplayName(processItem), `processo-${processItem.id}`));
                    await addProcessBackup(processFolder, processItem, auth.serviceClient);
                }
            }

            const looseRoot = clientFolder.folder('processos-sem-projeto');
            for (const processItem of looseProcesses) {
                const processFolder = looseRoot.folder(safeFileName(buildProcessDisplayName(processItem), `processo-${processItem.id}`));
                await addProcessBackup(processFolder, processItem, auth.serviceClient);
            }
        }

        const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const fileName = `backup-geoconsult-${safeFileName(String(auth.profile.organization_id || 'organizacao'))}-${generatedAt.slice(0, 10)}.zip`;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.end(buffer);
    } catch (error) {
        sendJson(res, 500, { error: error.message || 'Nao foi possivel gerar o backup.' });
    }
}

module.exports = async function adminBackupHandler(req, res, env = process.env) {
    if (req.method === 'GET') {
        await handleGet(req, res, env);
        return;
    }

    sendJson(res, 405, { error: 'Metodo nao suportado.' });
};

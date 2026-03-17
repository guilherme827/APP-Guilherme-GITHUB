function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeProjectName(projectName) {
    return String(projectName || '').trim();
}

export function buildProjectId(clientId, projectName) {
    const safeName = normalizeProjectName(projectName)
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^\w]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return safeName ? `project-${clientId}-${safeName}` : null;
}

export function buildProjectsFromProcesses(processes) {
    const projectsById = new Map();
    processes.forEach((process) => {
        const projectName = normalizeProjectName(process.projectName);
        if (!projectName) return;
        const projectId = buildProjectId(process.clientId, projectName);
        if (!projectId || projectsById.has(projectId)) return;
        projectsById.set(projectId, {
            id: projectId,
            clientId: process.clientId,
            name: projectName
        });
    });
    return [...projectsById.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function mapClientRowToModel(row) {
    return {
        id: row.id,
        organizationId: row.organization_id || null,
        type: row.type,
        nome: row.nome || '',
        cpf: row.cpf || '',
        nomeFantasia: row.nome_fantasia || '',
        cnpj: row.cnpj || '',
        nomeEmpresarial: row.nome_empresarial || '',
        email: row.email || '',
        telefone: row.telefone || '',
        logradouro: row.logradouro || '',
        numero: row.numero || '',
        bairro: row.bairro || '',
        cidade: row.cidade || '',
        uf: row.uf || '',
        cep: row.cep || '',
        documents: normalizeArray(row.documents)
    };
}

export function mapClientModelToRow(client) {
    return {
        organization_id: client.organizationId || null,
        type: client.type || 'PF',
        nome: client.type === 'PF' ? (client.nome || '') : '',
        cpf: client.type === 'PF' ? (client.cpf || '') : '',
        nome_fantasia: client.type === 'PJ' ? (client.nomeFantasia || '') : '',
        cnpj: client.type === 'PJ' ? (client.cnpj || '') : '',
        nome_empresarial: client.type === 'PJ' ? (client.nomeEmpresarial || '') : '',
        email: client.email || '',
        telefone: client.telefone || '',
        logradouro: client.logradouro || '',
        numero: client.numero || '',
        bairro: client.bairro || '',
        cidade: client.cidade || '',
        uf: client.uf || '',
        cep: client.cep || '',
        documents: normalizeArray(client.documents)
    };
}

export function mapProjectRowToModel(row) {
    return {
        id: row.id,
        organizationId: row.organization_id || null,
        clientId: row.client_id,
        name: row.name || ''
    };
}

export function mapProjectModelToRow(project) {
    return {
        organization_id: project.organizationId || null,
        client_id: project.clientId,
        name: project.name || ''
    };
}

export function mapProcessRowToModel(row) {
    const projectName = normalizeProjectName(row.project_name);
    return {
        id: row.id,
        organizationId: row.organization_id || null,
        clientId: row.client_id,
        projectId: row.project_id || null,
        projectName,
        fase: row.fase || 'Requerimento',
        tipo: row.tipo || '',
        tipoSigla: row.tipo_sigla || '',
        tipologia: row.tipologia || '',
        area: row.area || '',
        municipio: row.municipio || '',
        orgaoSigla: row.orgao_sigla || '',
        orgaoNomeCompleto: row.orgao_nome_completo || '',
        orgao: row.orgao || '',
        numeroProcesso: row.numero_processo || '',
        dataProtocolo: row.data_protocolo || '',
        numeroTitulo: row.numero_titulo || '',
        dataValidade: row.data_validade || '',
        dataOutorga: row.data_outorga || '',
        deadlines: normalizeArray(row.deadlines),
        events: normalizeArray(row.events),
        docBase64: row.doc_base64 || '',
        docStoragePath: row.doc_storage_path || '',
        docName: row.doc_name || '',
        docType: row.doc_type || '',
        docSize: Number(row.doc_size) || 0
    };
}

export function mapProcessModelToRow(process, resolvedProjectName = '') {
    return {
        organization_id: process.organizationId || null,
        client_id: Number(process.clientId),
        project_id: process.projectId || null,
        project_name: normalizeProjectName(resolvedProjectName),
        fase: process.fase || 'Requerimento',
        tipo: process.tipo || '',
        tipo_sigla: process.tipoSigla || '',
        tipologia: process.tipologia || '',
        area: process.area || '',
        municipio: process.municipio || '',
        orgao_sigla: process.orgaoSigla || '',
        orgao_nome_completo: process.orgaoNomeCompleto || '',
        orgao: process.orgao || '',
        numero_processo: process.numeroProcesso || '',
        data_protocolo: process.dataProtocolo || null,
        numero_titulo: process.numeroTitulo || '',
        data_validade: process.dataValidade || null,
        data_outorga: process.dataOutorga || null,
        deadlines: normalizeArray(process.deadlines),
        events: normalizeArray(process.events).map(event => ({
            ...event,
            documents: normalizeArray(event.documents).map(doc => ({
                ...doc,
                base64: '' // Força a supressão do base64 em anexos de eventos.
            }))
        })),
        doc_base64: '', // Força a supressão do base64 para evitar blobs gigantes na tabela.
        doc_storage_path: process.docStoragePath || '',
        doc_name: process.docName || '',
        doc_type: process.docType || '',
        doc_size: Number(process.docSize) || 0
    };
}

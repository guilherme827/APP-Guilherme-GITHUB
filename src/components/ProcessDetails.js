import { processStore } from '../utils/ProcessStore.js';
import { clientStore } from '../utils/ClientStore.js';
import { projectStore } from '../utils/ProjectStore.js';
import { escapeHtml } from '../utils/sanitize.js';
import { getDocumentAccessUrl } from '../utils/DocumentStorage.js';

export function renderProcessDetails(container, actionsContainer, processId, onNavigate) {
    const process = processStore.processes.find((p) => String(p.id) === String(processId));
    if (!process) {
        container.innerHTML = `<p class="label-tech" style="color:var(--rose-500); padding:4rem; text-align:center;">PROCESSO NÃO ENCONTRADO</p>`;
        return;
    }

    const client = clientStore.clients.find(c => c.id == process.clientId);
    const clientName = client ? (client.type === 'PF' ? client.nome : client.nomeFantasia) : '–';
    
    const project = process.projectId ? projectStore.projects.find(p => String(p.id) === String(process.projectId)) : null;

    const formatDate = (dateStr) => {
        if (!dateStr) return '–';
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
    };

    const isInitialEvent = (event) => {
        const normalizedType = String(event?.type || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
        const normalizedDesc = String(event?.description || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
        const id = String(event?.id || '');
        const looksInitialByText = normalizedDesc.includes('inicial') && (normalizedType === 'protocolo' || normalizedType === 'titulo');
        return event?.isInitial === true || event?.usesProcessDocument === true || id.includes('event-inicial') || looksInitialByText;
    };

    // Actions bar
    actionsContainer.innerHTML = '';
    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn-pill btn-black';
    btnEdit.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:0.5rem;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> EDITAR`;
    btnEdit.onclick = () => onNavigate.toEdit && onNavigate.toEdit(process.id);
    actionsContainer.appendChild(btnEdit);

    const btnExportTop = document.createElement('button');
    btnExportTop.className = 'btn-pill';
    btnExportTop.style.cssText = 'background: var(--bg-main); color: var(--primary); border:1px solid var(--slate-200); margin-left:0.5rem;';
    btnExportTop.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right:0.5rem;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> BAIXAR EXTRATO`;
    actionsContainer.appendChild(btnExportTop);

    // Build breadcrumb label for this process
    const procLabel = `PROCESSO ${process.tipo || ''}${process.numeroTitulo ? ' ' + process.numeroTitulo : process.numeroProcesso ? ' ' + process.numeroProcesso : ''}`.trim().toUpperCase();
    const baseDocument = process.docBase64
        || process.docStoragePath
        ? {
            id: `${process.id}-doc-inicial`,
            name: process.docName || 'documento',
            type: process.docType || 'application/pdf',
            base64: process.docBase64 || '',
            storagePath: process.docStoragePath || ''
        }
        : null;
    const resolvedEvents = (process.events || []).map((event) => {
        if (baseDocument && isInitialEvent(event)) {
            return {
                ...event,
                isInitial: true,
                documents: [{ ...baseDocument }]
            };
        }
        return event;
    });

    const extractEvents = [...resolvedEvents].sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date) - new Date(a.date);
    });

    const diasProtocolado = process.dataProtocolo ? Math.max(0, Math.round((new Date() - new Date(process.dataProtocolo + 'T00:00:00')) / (1000 * 60 * 60 * 24))) : null;
    const diasAteVencimento = process.dataValidade ? Math.round((new Date(process.dataValidade + 'T00:00:00') - new Date(new Date().setHours(0, 0, 0, 0))) / (1000 * 60 * 60 * 24)) : null;
    const isTitulo = String(process.numeroTitulo || '').trim() !== '';
    const sortedEventsOldestFirst = [...extractEvents].sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date) - new Date(b.date);
    });

    container.innerHTML = `
        <div class="animate-fade-in" style="max-width: 100%; display:flex; flex-direction:column; gap:1.25rem;">
            <div class="glass-card" style="padding:1.25rem 1.5rem;">
                <div style="display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:1rem; margin-bottom:0.75rem;">
                    <div>
                        <p class="label-tech">TITULAR</p>
                        <p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(client?.type === 'PF' ? (client?.nome || '-') : (client?.nomeFantasia || '-'))}</p>
                    </div>
                    ${client?.type === 'PF'
                        ? `<div>
                            <p class="label-tech">NOME EMPRESARIAL (SE PJ)</p>
                            <p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">—</p>
                        </div>
                        <div>
                            <p class="label-tech">CPF</p>
                            <p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(client?.cpf || '—')}</p>
                        </div>`
                        : `<div>
                            <p class="label-tech">NOME EMPRESARIAL</p>
                            <p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(client?.nomeEmpresarial || '—')}</p>
                        </div>
                        <div>
                            <p class="label-tech">CNPJ</p>
                            <p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(client?.cnpj || '—')}</p>
                        </div>`
                    }
                    <div><p class="label-tech">PROJETO</p><p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(project?.name || '—')}</p></div>
                </div>

                <div style="display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:1rem; margin-bottom:0.75rem;">
                    <div><p class="label-tech">FASE</p><p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(String(process.numeroTitulo || '').trim() ? 'Título' : 'Requerimento')}</p></div>
                    <div><p class="label-tech">ÓRGÃO</p><p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(process.orgaoNomeCompleto || '—')}</p></div>
                    <div><p class="label-tech">SIGLA DO ÓRGÃO</p><p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(process.orgaoSigla || '—')}</p></div>
                    <div><p class="label-tech">MUNICÍPIO</p><p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(process.municipio || '—')}</p></div>
                </div>

                <div style="display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:1rem; margin-bottom:0.75rem;">
                    <div><p class="label-tech">TIPO DE PROCESSO</p><p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(process.tipo || '—')}</p></div>
                    <div><p class="label-tech">SIGLA DO TIPO</p><p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(process.tipoSigla || '—')}</p></div>
                    <div><p class="label-tech">TIPOLOGIA</p><p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(process.tipologia || '—')}</p></div>
                    <div><p class="label-tech">ÁREA DO PROCESSO</p><p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(process.area || '—')}</p></div>
                </div>

                <div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:1rem;">
                    <div><p class="label-tech">Nº DO PROCESSO</p><p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(process.numeroProcesso || '—')}</p></div>
                    <div><p class="label-tech">Nº DO TÍTULO</p><p class="font-black" style="font-size:0.95rem; margin-top:0.2rem;">${escapeHtml(process.numeroTitulo || '—')}</p></div>
                </div>
            </div>

            <div class="glass-card" style="padding:1.25rem 1.5rem;">
                <div style="display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:1rem;">
                    <div><p class="label-tech">DATA DE PROTOCOLO</p><p class="font-black" style="margin-top:0.2rem;">${formatDate(process.dataProtocolo)}</p></div>
                    <div><p class="label-tech">DATA DA OUTORGA</p><p class="font-black" style="margin-top:0.2rem;">${formatDate(process.dataOutorga)}</p></div>
                    <div><p class="label-tech">DATA DE VALIDADE</p><p class="font-black" style="margin-top:0.2rem;">${formatDate(process.dataValidade)}</p></div>
                    <div>
                        <p class="label-tech">${isTitulo ? 'DIAS ATÉ O VENCIMENTO' : 'DIAS PROTOCOLADOS'}</p>
                        <p class="font-black" style="margin-top:0.2rem;">
                            ${isTitulo
                                ? (diasAteVencimento !== null ? `${diasAteVencimento} dias` : '—')
                                : (diasProtocolado !== null ? `${diasProtocolado} dias` : '—')}
                        </p>
                    </div>
                </div>
            </div>

            <div class="glass-card" style="padding:1.25rem 1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h4 class="label-tech" style="color: var(--slate-900);">EXTRATO PROCESSUAL</h4>
                </div>
                <div style="overflow:auto;">
                    <table class="data-table" id="extract-events-table">
                        <thead>
                            <tr>
                                <th class="label-tech" style="width:140px;">DATA</th>
                                <th class="label-tech">DESCRIÇÃO</th>
                                <th class="label-tech" style="width:360px;">ARQUIVO</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedEventsOldestFirst.length === 0 ? `
                                <tr><td colspan="3" class="label-tech" style="padding:2rem; text-align:center; color:var(--slate-400);">SEM ITENS NO EXTRATO</td></tr>
                            ` : sortedEventsOldestFirst.map((event, index) => `
                                <tr data-event-id="${escapeHtml(event.id)}">
                                    <td>
                                        <div style="display:flex; flex-direction:column;">
                                            <span class="font-black" style="font-size:0.85rem;">${formatDate(event.date)}</span>
                                            <span class="label-tech" style="font-size:8px; margin-top:2px;">${escapeHtml((event.type || 'movimentacao').toUpperCase())}</span>
                                        </div>
                                    </td>
                                    <td><span style="font-weight:600; font-size:0.92rem;">${escapeHtml(event.description || `Evento ${index + 1}`)}</span></td>
                                    <td>
                                        ${(event.documents || []).length === 0
                                            ? `<span class="label-tech" style="font-size:8px; color:var(--slate-400);">SEM ARQUIVOS</span>`
                                            : (event.documents || []).map((doc) => `
                                                <div style="display:flex; align-items:center; gap:0.45rem; margin-bottom:0.25rem;">
                                                    <span style="font-size:0.8rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(doc.name || 'documento')}</span>
                                                    <button class="btn-download-doc-event" data-event-id="${escapeHtml(event.id)}" data-doc-id="${escapeHtml(doc.id)}" style="background:none; border:none; cursor:pointer; color:var(--slate-500);">
                                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                                    </button>
                                                </div>
                                            `).join('')
                                        }
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Breadcrumbs removidos (arquitetura nova)

    container.querySelectorAll('.btn-download-doc-event').forEach((btn) => {
        btn.onclick = async () => {
            const eventId = btn.dataset.eventId;
            const docId = btn.dataset.docId;
            const event = resolvedEvents.find((item) => String(item.id) === String(eventId));
            const doc = event?.documents?.find((item) => String(item.id) === String(docId));
            const accessUrl = await getDocumentAccessUrl(doc);
            if (!accessUrl) return;
            const link = document.createElement('a');
            link.href = accessUrl;
            link.download = doc.name || 'documento';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
    });

    const buildExtractHTML = async (selectedEvents, generatedAt) => {
        const selectedRowsByEvent = await Promise.all(selectedEvents.map(async (event, index) => {
            const docs = event.includeDocs
                ? (await Promise.all((event.documents || []).map(async (doc, docIndex) => {
                const accessUrl = await getDocumentAccessUrl(doc);
                const isImage = (doc.type || '').startsWith('image/');
                const isPdf = (doc.type || '').includes('pdf');
                const title = `${index + 1}.${docIndex + 1} ${doc.name || 'documento'}`;
                if (!accessUrl) {
                    return `
                        <article style="margin-top:14px; border:1px solid #dbe3ee; border-radius:10px; overflow:hidden; padding:12px;">
                            <p style="margin:0 0 8px; font-weight:700;">${escapeHtml(title)}</p>
                            <p style="margin:0;">Não foi possível gerar acesso ao arquivo.</p>
                        </article>
                    `;
                }

                if (isImage) {
                    return `
                        <article style="margin-top:14px; border:1px solid #dbe3ee; border-radius:10px; overflow:hidden;">
                            <header style="padding:10px 12px; background:#f7fafc; font-weight:700;">${escapeHtml(title)}</header>
                            <img src="${accessUrl}" alt="${escapeHtml(doc.name || 'documento')}" style="width:100%; display:block;" />
                        </article>
                    `;
                }

                if (isPdf) {
                    return `
                        <article style="margin-top:14px; border:1px solid #dbe3ee; border-radius:10px; overflow:hidden;">
                            <header style="padding:10px 12px; background:#f7fafc; font-weight:700;">${escapeHtml(title)}</header>
                            <iframe src="${accessUrl}" style="width:100%; height:820px; border:none;"></iframe>
                        </article>
                    `;
                }

                return `
                    <article style="margin-top:14px; border:1px solid #dbe3ee; border-radius:10px; overflow:hidden; padding:12px;">
                        <p style="margin:0 0 8px; font-weight:700;">${escapeHtml(title)}</p>
                        <p style="margin:0;">Tipo de arquivo não suportado para visualização incorporada.</p>
                    </article>
                `;
            }))).join('')
                : '<p style="margin-top:12px; color:#64748b;">Anexos não selecionados para este item.</p>';

            return `
                <section style="margin-top:18px; border:1px solid #dbe3ee; border-radius:12px; padding:14px;">
                    <p style="margin:0; font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.12em;">Evento</p>
                    <h3 style="margin:6px 0 4px; font-size:18px;">${escapeHtml(event.description || 'Sem descrição')}</h3>
                    <p style="margin:0; color:#334155;">${escapeHtml(formatDate(event.date))} • ${escapeHtml((event.type || 'movimentacao').toUpperCase())}</p>
                    ${docs || '<p style="margin-top:12px; color:#64748b;">Sem documentos anexados.</p>'}
                </section>
            `;
        }));
        const selectedRows = selectedRowsByEvent.join('');

        return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Extrato Processual</title>
</head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 24px; background: #f5f7fb; color: #0f172a;">
  <main style="max-width: 1100px; margin: 0 auto; background: #fff; border: 1px solid #dbe3ee; border-radius: 14px; padding: 20px;">
    <h1 style="margin: 0 0 16px;">Extrato Processual</h1>
    <p style="margin:0 0 14px; color:#64748b;">Gerado em: ${escapeHtml(generatedAt)}</p>
    <section style="border:1px solid #dbe3ee; border-radius:12px; padding:14px;">
      <p style="margin:0 0 8px; font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.12em;">Titular</p>
      <p style="margin:0; font-weight:700;">${escapeHtml(clientName)}</p>
      <p style="margin:10px 0 0; font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.12em;">Órgão • Tipo • Tipologia</p>
      <p style="margin:0;">${escapeHtml(orgaoDisplay || '—')} • ${escapeHtml(process.tipo || '—')} • ${escapeHtml(process.tipologia || '—')}</p>
      <p style="margin:10px 0 0; font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.12em;">Projeto • Área</p>
      <p style="margin:0;">${escapeHtml(project?.name || '—')} • ${escapeHtml(process.area || '—')}</p>
    </section>
    <section style="margin-top:14px; border:1px solid #dbe3ee; border-radius:12px; padding:14px;">
      <p style="margin:0 0 8px; font-size:12px; color:#64748b; text-transform:uppercase; letter-spacing:0.12em;">Resumo</p>
      <p style="margin:0;">Nº Processo: ${escapeHtml(process.numeroProcesso || '—')}</p>
      <p style="margin:2px 0 0;">Data de Protocolo: ${escapeHtml(formatDate(process.dataProtocolo))} • Dias protocolado: ${diasProtocolado !== null ? `${diasProtocolado} dias` : '—'}</p>
      <p style="margin:2px 0 0;">Nº Título/LO: ${escapeHtml(process.numeroTitulo || '—')} • Outorga: ${escapeHtml(formatDate(process.dataOutorga))} • Validade: ${escapeHtml(formatDate(process.dataValidade))}</p>
    </section>
    <section style="margin-top:14px;">
      <h2 style="margin:0 0 6px;">Eventos selecionados (${selectedEvents.length})</h2>
      <p style="margin:0; color:#64748b;">Ordem cronológica: do mais antigo para o mais recente.</p>
      ${selectedRows}
    </section>
    <footer style="margin-top:18px; padding-top:12px; border-top:1px solid #dbe3ee; color:#64748b; font-size:12px;">
      Extrato gerado automaticamente em ${escapeHtml(generatedAt)}.
    </footer>
  </main>
</body>
</html>`;
    };

    const openExtractPreview = () => {
        const generatedAt = new Date().toLocaleString('pt-BR');
        const backdrop = document.createElement('div');
        backdrop.style.cssText = `
            position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(8px); display:flex; align-items:center; justify-content:center;
            z-index: 9999; padding: 1.5rem;
        `;

        backdrop.innerHTML = `
            <div class="glass-card" style="max-width:1100px; width:100%; max-height:90vh; overflow:auto; padding:1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem;">
                    <div>
                        <h3 class="font-black" style="font-size:1.3rem;">Pré-visualização do Extrato</h3>
                        <p class="label-tech" style="margin-top:0.4rem;">GERADO EM ${escapeHtml(generatedAt)}</p>
                    </div>
                    <button type="button" id="btn-close-preview" class="btn-pill" style="background:transparent; color:var(--slate-500);">Fechar</button>
                </div>
                <div style="margin-top:1rem; border:1px solid var(--slate-200); border-radius:14px; padding:1rem; background:var(--bg-main);">
                    <p style="font-weight:700;">${escapeHtml(clientName)} • ${escapeHtml(process.tipo || '—')}</p>
                    <p style="margin-top:0.35rem; color:var(--slate-500);">Processo: ${escapeHtml(process.numeroProcesso || '—')} | Título/LO: ${escapeHtml(process.numeroTitulo || '—')}</p>
                </div>
                <div style="margin-top:1rem; overflow:auto;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th class="label-tech" style="width:130px;">DATA</th>
                                <th class="label-tech">DESCRIÇÃO</th>
                                <th class="label-tech" style="width:180px;">ANEXAR DOCS?</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sortedEventsOldestFirst.length === 0 ? `
                                <tr><td colspan="3" class="label-tech" style="padding:1.25rem; text-align:center; color:var(--slate-400);">SEM ITENS NO EXTRATO</td></tr>
                            ` : sortedEventsOldestFirst.map((event, index) => `
                                <tr>
                                    <td><span class="font-black" style="font-size:0.85rem;">${formatDate(event.date)}</span></td>
                                    <td><span style="font-weight:600; font-size:0.92rem;">${escapeHtml(event.description || `Item ${index + 1}`)}</span></td>
                                    <td>
                                        ${(event.documents || []).length === 0
                                            ? `<span class="label-tech" style="font-size:8px; color:var(--slate-400);">SEM ANEXOS</span>`
                                            : `<label style="display:flex; align-items:center; gap:0.45rem; font-size:0.82rem; font-weight:600;">
                                                <input type="checkbox" class="preview-include-docs" data-event-id="${escapeHtml(event.id)}" checked style="width:16px; height:16px; accent-color: var(--primary);" />
                                                Incluir ${event.documents.length} arquivo(s)
                                            </label>`
                                        }
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="margin-top:1rem; display:flex; justify-content:flex-end; gap:0.6rem;">
                    <button type="button" id="btn-cancel-preview" class="btn-pill" style="background:transparent; color:var(--slate-500);">Cancelar</button>
                    <button type="button" id="btn-download-preview" class="btn-pill btn-black">BAIXAR EXTRATO</button>
                </div>
            </div>
        `;

        const closePreview = () => backdrop.remove();
        backdrop.querySelector('#btn-close-preview').onclick = closePreview;
        backdrop.querySelector('#btn-cancel-preview').onclick = closePreview;
        backdrop.onclick = (event) => {
            if (event.target === backdrop) closePreview();
        };

        backdrop.querySelector('#btn-download-preview').onclick = async () => {
            const includeMap = new Map(
                Array.from(backdrop.querySelectorAll('.preview-include-docs')).map((input) => [String(input.dataset.eventId), input.checked])
            );
            const selectedEvents = sortedEventsOldestFirst.map((event) => ({
                ...event,
                includeDocs: includeMap.has(String(event.id)) ? includeMap.get(String(event.id)) : false
            }));
            const downloadButton = backdrop.querySelector('#btn-download-preview');
            downloadButton.disabled = true;
            downloadButton.textContent = 'GERANDO...';
            const html = await buildExtractHTML(selectedEvents, generatedAt);
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const baseNumber = process.numeroProcesso || process.numeroTitulo || process.id;
            link.href = url;
            link.download = `extrato-processo-${String(baseNumber).replace(/[^\w.-]+/g, '_')}.html`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            closePreview();
        };

        document.body.appendChild(backdrop);
    };

    btnExportTop.onclick = openExtractPreview;

}

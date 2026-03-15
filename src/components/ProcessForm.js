import { clientStore } from '../utils/ClientStore.js';
import { processStore } from '../utils/ProcessStore.js';
import { AIService } from '../utils/AIService.js';
import { showNoticeModal } from './NoticeModal.js';
import { escapeHtml } from '../utils/sanitize.js';
import { uploadDocumentFile } from '../utils/DocumentStorage.js';

export function renderProcessForm(container, onSave, onCancel, editData = null, initialClientId = null) {
    let step = editData ? 3 : 1; // 1: Upload, 2: AI Reading, 3: Form
    const hasPrimaryDocument = () => !!(formData.docStoragePath);
    const getNormalizedPhase = (numeroTitulo) => (String(numeroTitulo || '').trim() ? 'Título' : 'Requerimento');
    const getInitialEventTypeForPhase = (phase) => (phase === 'Título' ? 'titulo' : 'protocolo');
    const getInitialEventDescriptionForPhase = (phase) => (phase === 'Título' ? 'Título inicial' : 'Protocolo inicial');
    const getInitialEventDateForPhase = (phase, data) => (phase === 'Título' ? (data.dataOutorga || data.dataProtocolo || '') : (data.dataProtocolo || data.dataOutorga || ''));
    const normalizeText = (value) => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const looksLikeSigla = (value) => {
        const text = String(value || '').trim();
        if (!text) return false;
        if (text.length > 14) return false;
        if (/\s{2,}/.test(text)) return false;
        const lettersOnly = text.replace(/[^A-Za-z]/g, '');
        if (!lettersOnly) return false;
        const upperRatio = lettersOnly.split('').filter((char) => char === char.toUpperCase()).length / lettersOnly.length;
        return upperRatio > 0.65;
    };
    const looksLikeLongName = (value) => {
        const text = String(value || '').trim();
        if (!text) return false;
        return text.length >= 18 || text.includes(' ');
    };
    const isInitialEvent = (event) => {
        const type = normalizeText(event?.type);
        const desc = normalizeText(event?.description);
        return event?.isInitial === true || event?.usesProcessDocument === true || (desc.includes('inicial') && (type === 'protocolo' || type === 'titulo'));
    };
    const syncInitialEventInFormData = () => {
        if (!hasPrimaryDocument()) return;
        const phase = getNormalizedPhase(formData.numeroTitulo);
        const initialType = getInitialEventTypeForPhase(phase);
        const initialDescription = getInitialEventDescriptionForPhase(phase);
        const initialDate = getInitialEventDateForPhase(phase, formData);
        const currentEvents = Array.isArray(formData.events) ? formData.events : [];
        const initialIdx = currentEvents.findIndex((event) => isInitialEvent(event));

        if (initialIdx === -1) {
            formData.events = [{
                id: `event-inicial-${Date.now()}`,
                type: initialType,
                description: initialDescription,
                date: initialDate,
                isInitial: true,
                usesProcessDocument: true,
                documents: []
            }, ...currentEvents];
            return;
        }

        const initialEvent = currentEvents[initialIdx];
        const currentDescription = String(initialEvent?.description || '');
        const normalizedCurrentDescription = normalizeText(currentDescription);
        const shouldOverwriteDescription = !currentDescription
            || normalizedCurrentDescription === normalizeText('Título inicial')
            || normalizedCurrentDescription === normalizeText('Protocolo inicial');
        const updatedInitialEvent = {
            ...initialEvent,
            id: String(initialEvent.id || '').includes('event-inicial') ? initialEvent.id : `event-inicial-${Date.now()}`,
            type: initialType,
            isInitial: true,
            usesProcessDocument: true,
            documents: [],
            description: shouldOverwriteDescription ? initialDescription : currentDescription,
            date: initialEvent.date || initialDate
        };

        const nextEvents = [...currentEvents];
        nextEvents.splice(initialIdx, 1);
        formData.events = [updatedInitialEvent, ...nextEvents];
    };

    let formData = editData || {
        clientId: initialClientId || '',
        projectId: '',
        fase: 'Requerimento',
        tipo: '',
        tipoSigla: '',
        tipologia: '',
        area: '',
        municipio: '',
        orgaoSigla: '',
        orgaoNomeCompleto: '',
        orgao: '',
        numeroProcesso: '',
        dataProtocolo: '',
        numeroTitulo: '',
        dataValidade: '',
        dataOutorga: '',
        deadlines: [],
        events: [],
        // Attached document
        docStoragePath: '',
        docName: '',
        docType: ''
    };

    if (editData) {
        const legacyOrgao = editData.orgao || '';
        const [legacySigla, ...legacyNomeParts] = legacyOrgao.split(' - ');
        const legacyNome = legacyNomeParts.join(' - ').trim();
        formData = {
            ...editData,
            area: editData.area || '',
            orgaoSigla: editData.orgaoSigla || (legacyNome ? legacySigla : legacyOrgao) || '',
            orgaoNomeCompleto: editData.orgaoNomeCompleto || (legacyNome || ''),
            docStoragePath: editData.docStoragePath || '',
            events: Array.isArray(editData.events) ? editData.events : []
        };
    }

    const render = (file = null) => {
        container.innerHTML = '';
        if (step === 1) renderUploadStep();
        else if (step === 2) renderAISimulation(file);
        else renderFullForm();
    };

    const renderUploadStep = () => {
        container.innerHTML = `
            <div class="glass-card animate-fade-in" style="max-width: 800px; margin: 4rem auto; padding: 4rem; text-align: center;">
                <h2 class="font-black" style="font-size: 2rem; margin-bottom: 1rem;">Novo Processo</h2>
                <p class="label-tech" style="margin-bottom: 3rem;">INICIE ADICIONANDO UM DOCUMENTO PARA A IA ANALISAR</p>
                
                <div class="upload-zone rounded-3xl" id="process-upload-zone" style="height: 250px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 2px dashed var(--slate-200); cursor: pointer;">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--primary)" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    <p class="label-tech" style="margin-top: 1.5rem;">ARRASTE OU CLIQUE PARA CARREGAR</p>
                    <input type="file" id="process-file-input" style="display: none;" accept=".pdf,image/*">
                </div>
                
                <div style="margin-top: 3rem; display: flex; justify-content: center; gap: 1rem;">
                    <button class="btn-pill" id="btn-skip-upload" style="color: var(--slate-400);">PREENCHER MANUALMENTE</button>
                    <button class="btn-pill" id="btn-cancel-upload" style="background: transparent; color: var(--slate-400);">CANCELAR</button>
                </div>
            </div>
        `;

        const zone = container.querySelector('#process-upload-zone');
        const input = container.querySelector('#process-file-input');
        const processSelectedFile = async (file) => {
            if (!file) return;
            try {
                const uploadedDoc = await uploadDocumentFile(file, 'processos', formData.clientId || 'temp');
                formData.docStoragePath = uploadedDoc.storagePath || '';
                formData.docSize = uploadedDoc.size || 0;
                formData.docName = uploadedDoc.name || file.name;
                formData.docType = uploadedDoc.type || file.type || 'application/octet-stream';
                step = 2;
                render(file);
            } catch (error) {
                console.error('Falha ao preparar documento inicial:', error);
                showNoticeModal('Falha no upload', 'Não foi possível carregar o arquivo. Tente novamente.');
            }
        };
        zone.onclick = () => input.click();
        input.onchange = (e) => processSelectedFile(e.target.files[0]);

        const preventDragDefaults = (event) => {
            event.preventDefault();
            event.stopPropagation();
        };
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
            zone.addEventListener(eventName, preventDragDefaults);
        });
        zone.addEventListener('dragenter', () => {
            zone.style.borderColor = 'var(--primary)';
            zone.style.background = 'rgba(16, 185, 129, 0.06)';
        });
        zone.addEventListener('dragleave', () => {
            zone.style.borderColor = 'var(--slate-200)';
            zone.style.background = 'transparent';
        });
        zone.addEventListener('drop', (event) => {
            zone.style.borderColor = 'var(--slate-200)';
            zone.style.background = 'transparent';
            const file = event.dataTransfer?.files?.[0];
            processSelectedFile(file);
        });

        container.querySelector('#btn-skip-upload').onclick = () => { step = 3; render(); };
        container.querySelector('#btn-cancel-upload').onclick = () => {
            onCancel();
        };
    };

    const renderAISimulation = async (file) => {
        container.innerHTML = `
            <div class="glass-card animate-fade-in" style="max-width: 800px; margin: 4rem auto; padding: 4rem; text-align: center;">
                <div class="ai-loader" style="width: 80px; height: 80px; border-radius: 50%; border: 4px solid var(--slate-100); border-top-color: var(--primary); margin: 0 auto; animation: spin 1s linear infinite;"></div>
                <h3 class="font-black" style="margin-top: 2rem; font-size: 1.5rem;">O Gemini está analisando o arquivo...</h3>
                <p class="label-tech" style="margin-top: 1rem; color: var(--primary);">EXTRAINDO DADOS E LISTANDO PRAZOS</p>
                <div style="margin-top: 3rem; background: var(--bg-main); padding: 2rem; border-radius: 24px; text-align: left;">
                    <div id="ai-status-text" class="label-tech" style="margin-bottom: 1rem;">INICIANDO CONVERSÃO...</div>
                    <div class="sim-line" style="width: 100%; height: 8px; background: var(--slate-200); border-radius: 4px; position: relative; overflow: hidden;"><div style="position: absolute; width: 40%; height: 100%; background: var(--primary); animation: move 2s infinite linear;"></div></div>
                </div>
            </div>
            <style>
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes move { from { left: -40%; } to { left: 100%; } }
            </style>
        `;

        const status = container.querySelector('#ai-status-text');

        try {
            status.innerText = "LENDO DOCUMENTO E PROCESSANDO IA...";
            const aiData = await AIService.analyzeDocument(file);
            
            // Map AI data to formData
            formData = {
                ...formData,
                clientId: formData.clientId, // Keep selected client if any
                fase: getNormalizedPhase(aiData.numeroTitulo || ''),
                tipo: (looksLikeSigla(aiData.tipo) && !aiData.tipoSigla) ? '' : (aiData.tipo || ''),
                tipoSigla: aiData.tipoSigla || ((looksLikeSigla(aiData.tipo) && !aiData.tipoSigla) ? aiData.tipo : ''),
                tipologia: aiData.tipologia || '',
                municipio: aiData.municipio || '',
                orgaoSigla: looksLikeSigla(aiData.orgao) ? (aiData.orgao || '') : '',
                orgaoNomeCompleto: looksLikeLongName(aiData.orgao) ? (aiData.orgao || '') : (formData.orgaoNomeCompleto || ''),
                orgao: aiData.orgao || '',
                numeroProcesso: aiData.numeroProcesso || '',
                numeroTitulo: aiData.numeroTitulo || '',
                dataProtocolo: aiData.dataProtocolo || '',
                dataOutorga: aiData.dataOutorga || '',
                dataValidade: aiData.dataValidade || '',
                deadlines: (aiData.deadlines || []).map(d => ({
                    desc: d.desc || '',
                    date: d.date || ''
                }))
            };
            const learnedOrgaoSigla = processStore.getLearnedOrgaoSigla(formData.orgaoNomeCompleto);
            if (!formData.orgaoSigla && learnedOrgaoSigla) formData.orgaoSigla = learnedOrgaoSigla;
            const learnedTipoSigla = processStore.getLearnedTipoSigla(formData.tipo);
            if (!formData.tipoSigla && learnedTipoSigla) formData.tipoSigla = learnedTipoSigla;

            status.innerText = "ANÁLISE CONCLUÍDA COM SUCESSO!";
            setTimeout(() => { step = 3; render(); }, 800);
        } catch (error) {
            console.error(error);
            container.innerHTML += `
                <div style="margin-top: 2rem; color: var(--rose-500); font-weight: 700;">
                    ERRO NA ANÁLISE: ${escapeHtml(error.message)}
                </div>
                <button class="btn-pill" id="btn-error-manual" style="margin-top: 2rem; border: 1px solid var(--rose-200);">PREENCHER MANUALMENTE</button>
            `;
            container.querySelector('#btn-error-manual').onclick = () => { step = 3; render(); };
        }
    };

    const renderFullForm = () => {
        formData.fase = getNormalizedPhase(formData.numeroTitulo);
        syncInitialEventInFormData();
        formData.events = (Array.isArray(formData.events) ? formData.events : []).map((event, index) => ({
            id: event.id || `event-${Date.now()}-${index}`,
            type: event.type || 'movimentacao',
            description: event.description || '',
            date: event.date || '',
            isInitial: event.isInitial === true,
            usesProcessDocument: event.usesProcessDocument === true,
            documents: (Array.isArray(event.documents) ? event.documents : []).filter((doc) => !!doc?.storagePath).map((doc, docIndex) => ({
                id: doc.id || `doc-${Date.now()}-${index}-${docIndex}`,
                name: doc.name || 'documento',
                type: doc.type || 'application/octet-stream',
                storagePath: doc.storagePath || ''
            }))
        }));

        const clients = clientStore.clients;
        const initialClient = clients.find(c => c.id == formData.clientId);
        const initialClientName = initialClient ? (initialClient.type === 'PF' ? initialClient.nome : initialClient.nomeFantasia) : '';

        // Initial Project Name if id exists
        let initialProjectName = '';
        if (formData.projectId) {
            const proj = processStore.projects.find(p => p.id == formData.projectId);
            initialProjectName = proj ? proj.name : '';
        }
        const getEventDisplayDocs = (event) => {
            if (!event) return [];
            if (event.usesProcessDocument === true && hasPrimaryDocument()) {
                return [{
                    id: `${event.id || 'event'}-process-doc`,
                    name: formData.docName || 'documento',
                    type: formData.docType || 'application/pdf',
                    storagePath: formData.docStoragePath || ''
                }];
            }
            return Array.isArray(event.documents) ? event.documents : [];
        };

        container.innerHTML = `
            <div class="glass-card animate-fade-in" style="width: 100%; padding: 4rem;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3rem;">
                    <div>
                        <h2 class="font-black" style="font-size: 2rem;">Configuração do Processo</h2>
                        <p class="label-tech" style="color: var(--slate-400); margin-top: 0.5rem;">PREENCHA OS DETALHES TÉCNICOS E DATAS</p>
                    </div>
                </div>
                
                <form id="process-form-element">
                    <!-- Section 1: Titular Identity -->
                    <div class="grid-4" style="margin-bottom: 1.5rem;">
                        <div class="form-group" style="position: relative;">
                            <label class="label-tech">TITULAR (VÍNCULO OBRIGATÓRIO)</label>
                            <input type="text" id="client-search-input" value="${escapeHtml(initialClientName)}" placeholder="Buscar titular..." autocomplete="off" required>
                            <input type="hidden" name="clientId" id="client-id-hidden" value="${escapeHtml(formData.clientId)}">
                            <div id="client-results" class="search-results hidden"></div>
                        </div>
                        <div class="form-group">
                            <label class="label-tech" id="client-meta-label-a">NOME EMPRESARIAL (SE PJ)</label>
                            <input type="text" id="client-meta-a" readonly placeholder="Selecione um titular">
                        </div>
                        <div class="form-group">
                            <label class="label-tech" id="client-meta-label-b">CPF / CNPJ</label>
                            <input type="text" id="client-meta-b" readonly placeholder="Selecione um titular">
                        </div>
                        <div class="form-group" style="position: relative;">
                            <label class="label-tech">PROJETO (OPCIONAL)</label>
                            <input type="text" id="project-search-input" name="projectName" value="${escapeHtml(initialProjectName)}" placeholder="Nome do projeto..." autocomplete="off">
                            <input type="hidden" name="projectId" id="project-id-hidden" value="${escapeHtml(formData.projectId)}">
                            <div id="project-results" class="search-results hidden"></div>
                        </div>
                    </div>

                    <!-- Section 2: Technical Details -->
                    <div class="grid-4" style="margin-bottom: 1.5rem;">
                        <div class="form-group">
                            <label class="label-tech">FASE (AUTOMÁTICA)</label>
                            <input type="text" id="process-phase-preview" value="${escapeHtml(String(formData.numeroTitulo || '').trim() ? 'Título' : 'Requerimento')}" readonly>
                        </div>
                        <div class="form-group">
                            <label class="label-tech">ÓRGÃO</label>
                            <input type="text" name="orgaoNomeCompleto" value="${escapeHtml(formData.orgaoNomeCompleto || '')}" placeholder="Ex: SECRETARIA DE ESTADO ...">
                        </div>
                        <div class="form-group" style="position: relative;">
                            <label class="label-tech">SIGLA DO ÓRGÃO</label>
                            <input type="text" name="orgaoSigla" id="input-orgao-sigla" value="${escapeHtml(formData.orgaoSigla || formData.orgao || '')}" placeholder="Ex: SEMAS/PA" autocomplete="off">
                            <div id="results-orgao" class="search-results hidden"></div>
                        </div>
                        <div class="form-group">
                            <label class="label-tech">MUNICÍPIO</label>
                            <input type="text" name="municipio" value="${escapeHtml(formData.municipio || '')}" placeholder="Ex: Parauapebas">
                        </div>
                    </div>

                    <div class="grid-4" style="margin-bottom: 1.5rem;">
                        <div class="form-group" style="position: relative;">
                            <label class="label-tech">TIPO DE PROCESSO</label>
                            <input type="text" name="tipo" id="input-tipo" value="${escapeHtml(formData.tipo)}" placeholder="Ex: Licença de Operação" autocomplete="off">
                            <div id="results-tipo" class="search-results hidden"></div>
                        </div>
                        <div class="form-group" style="position: relative;">
                            <label class="label-tech">SIGLA DO TIPO</label>
                            <input type="text" name="tipoSigla" id="input-tipo-sigla" value="${escapeHtml(formData.tipoSigla || '')}" placeholder="Ex: LO" autocomplete="off">
                            <div id="results-tipo-sigla" class="search-results hidden"></div>
                        </div>
                        <div class="form-group" style="position: relative;">
                            <label class="label-tech">TIPOLOGIA</label>
                            <input type="text" name="tipologia" id="input-tipologia" value="${escapeHtml(formData.tipologia)}" placeholder="Ex: Lavra Garimpeira..." autocomplete="off">
                            <div id="results-tipologia" class="search-results hidden"></div>
                        </div>
                        <div class="form-group">
                            <label class="label-tech">ÁREA DO PROCESSO</label>
                            <input type="text" name="area" id="input-area-processo" value="${escapeHtml(formData.area || '')}" placeholder="Ex: 1.245,77 hectares">
                        </div>
                    </div>

                    <div class="grid-2" style="margin-bottom: 3rem;">
                        <div class="form-group">
                            <label class="label-tech">Nº DO PROCESSO</label>
                            <input type="text" name="numeroProcesso" value="${escapeHtml(formData.numeroProcesso)}" placeholder="850.xxx/2024">
                        </div>
                        <div class="form-group">
                            <label class="label-tech">Nº DO TÍTULO (SE HOUVER)</label>
                            <input type="text" name="numeroTitulo" value="${escapeHtml(formData.numeroTitulo || '')}" placeholder="Ex: LO 123/2024">
                        </div>
                    </div>

                    <!-- Section 3: Dates -->
                    <h3 class="label-tech" style="margin-bottom: 1.5rem; color: var(--primary);">DATAS E VALIDADES</h3>
                    <div class="grid-4" style="margin-bottom: 4rem;">
                        <div class="form-group">
                            <label class="label-tech">DATA DE PROTOCOLO</label>
                            <input type="date" name="dataProtocolo" value="${escapeHtml(formData.dataProtocolo || '')}">
                        </div>
                        <div class="form-group">
                            <label class="label-tech">DATA DA OUTORGA</label>
                            <input type="date" name="dataOutorga" value="${escapeHtml(formData.dataOutorga || '')}">
                        </div>
                        <div class="form-group">
                            <label class="label-tech">DATA DE VALIDADE</label>
                            <input type="date" name="dataValidade" value="${escapeHtml(formData.dataValidade || '')}">
                        </div>
                        <div class="form-group">
                            <label class="label-tech" id="validity-days-label">${String(formData.numeroTitulo || '').trim() ? 'DIAS ATÉ O VENCIMENTO' : 'DIAS PROTOCOLADOS'}</label>
                            <input type="text" id="validity-days-value" value="—" readonly>
                        </div>
                    </div>

                    <!-- Extract Section in Full Form -->
                    <div class="glass-card" style="margin-top:2rem; padding:1.5rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                            <h4 class="label-tech" style="color:var(--slate-900);">EXTRATO PROCESSUAL</h4>
                            <button type="button" class="btn-pill" id="btn-add-extract-event" style="border:1px solid var(--slate-200); color:var(--primary); background:var(--bg-main);">+ ADICIONAR EVENTO</button>
                        </div>
                        <div id="edit-extract-list" style="display:flex; flex-direction:column; gap:0.75rem;">
                            ${formData.events.length === 0
                                ? `<p class="label-tech" style="padding:1.25rem; text-align:center; color:var(--slate-400); border:1px dashed var(--slate-200); border-radius:12px;">SEM ITENS NO EXTRATO</p>`
                                : formData.events.map((event, index) => `
                                    <div class="extract-event-row" style="display:grid; grid-template-columns:180px 1fr minmax(260px, 360px) 32px; gap:0.9rem; align-items:start; padding:0.85rem; border:1px solid var(--slate-100); border-radius:12px; background:var(--input-bg);">
                                        <div>
                                            <p class="label-tech" style="margin-bottom:0.25rem;">DATA</p>
                                            <input type="date" class="extract-event-input-date" data-index="${index}" value="${escapeHtml(event.date || '')}" style="padding:0.65rem; font-size:0.82rem;">
                                        </div>
                                        <div>
                                            <p class="label-tech" style="margin-bottom:0.25rem;">DESCRIÇÃO</p>
                                            <input type="text" class="extract-event-input-desc" data-index="${index}" value="${escapeHtml(event.description || `Evento ${index + 1}`)}" style="padding:0.65rem; font-size:0.85rem;">
                                        </div>
                                        <div>
                                            <p class="label-tech" style="margin-bottom:0.25rem;">ARQUIVO</p>
                                            ${(getEventDisplayDocs(event) || []).length === 0
                                                ? `<button type="button" class="btn-add-file-inline" data-index="${index}" style="background:none; border:none; color:var(--primary); font-size:0.78rem; font-weight:700; cursor:pointer; padding:0;">ADICIONAR ARQUIVO</button>
                                                   <input type="file" class="extract-event-file-input hidden" data-index="${index}" accept=".pdf,image/*">`
                                                : getEventDisplayDocs(event).map((doc) => `
                                                    <div style="display:flex; align-items:center; gap:0.45rem; margin-bottom:0.2rem;">
                                                        <span style="font-size:0.8rem; font-weight:600;">${escapeHtml(doc.name || 'documento')}</span>
                                                        <button type="button" class="extract-remove-file-btn" data-index="${index}" data-doc-id="${escapeHtml(doc.id)}" style="background:none; border:none; color:var(--rose-500); cursor:pointer; font-size:0.82rem; font-weight:800;">x</button>
                                                    </div>
                                                `).join('')
                                            }
                                        </div>
                                        <button type="button" class="extract-remove-row-btn" data-index="${index}" style="background:none; border:none; color:var(--rose-500); cursor:pointer; font-size:0.95rem; font-weight:800; align-self:center;">x</button>
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>

                    <!-- Section 4: Deadlines -->
                    <div class="glass-card" style="margin-top:2rem; padding:1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h4 class="label-tech" style="color: var(--rose-500);">EXTRATO DE PRAZOS A CUMPRIR</h4>
                            <button type="button" class="btn-pill" id="btn-add-deadline" style="font-size: 11px; padding: 0.5rem 1rem; border:1px solid var(--slate-200); color:var(--rose-500); background:var(--bg-main);">+ ADICIONAR PRAZO A CUMPRIR</button>
                        </div>
                        <div id="deadline-container" style="display: flex; flex-direction: column; gap: 0.75rem;">
                            <!-- Deadlines injected here -->
                        </div>
                    </div>

                    <div style="margin-top: 4rem; display: flex; justify-content: flex-end; gap: 1rem; border-top: 1px solid var(--slate-200); padding-top: 2rem;">
                        <button type="button" class="btn-pill" id="btn-cancel" style="background: transparent; color: var(--slate-400);">CANCELAR</button>
                        <button type="submit" class="btn-pill btn-black" style="padding: 1rem 3rem;">SALVAR PROCESSO</button>
                    </div>
                </form>
            </div>

            <style>
                .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
                .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
                .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; }
                input, select { 
                    width: 100%; padding: 1rem; border: 1px solid var(--input-border); 
                    border-radius: 12px; background: var(--input-bg); font-family: inherit; color: var(--slate-900);
                    transition: var(--transition);
                }
                input:focus { border-color: color-mix(in srgb, var(--primary) 58%, transparent); outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent); }
                label { display: block; margin-bottom: 0.75rem; color: var(--slate-500); font-size: 11px; letter-spacing: 0.05em; font-weight: 600; text-transform: uppercase; }
                
                .phase-toggle {
                    display: flex; background: var(--slate-200); padding: 4px; border-radius: 12px; gap: 4px;
                }
                .toggle-option { flex: 1; margin-bottom: 0; cursor: pointer; }
                .toggle-option input { display: none; }
                .toggle-option span {
                    display: block; text-align: center; padding: 0.75rem; border-radius: 9px;
                    font-size: 10px; font-weight: 800; color: var(--slate-500); transition: var(--transition);
                }
                .toggle-option input:checked + span { background: var(--input-bg); color: var(--slate-950); box-shadow: var(--shadow-sm); }

                .search-results {
                    position: absolute; top: 100%; left: 0; right: 0; background: var(--card-bg);
                    border: 1px solid var(--slate-200); border-radius: 12px;
                    max-height: 200px; overflow-y: auto; z-index: 1000;
                    box-shadow: var(--shadow-deep); margin-top: 0.5rem;
                }
                .search-results.hidden { display: none; }
                .search-item {
                    padding: 0.8rem 1rem; cursor: pointer; border-bottom: 1px solid var(--slate-50);
                    display: flex; flex-direction: column; transition: var(--transition);
                }
                .search-item:hover { background: var(--bg-main); padding-left: 1.5rem; }
                .search-item .name { font-weight: 700; color: var(--slate-900); font-size: 13px; }
                .search-item .sub { font-size: 8px; color: var(--slate-400); text-transform: uppercase; margin-top: 2px; }

                .deadline-row {
                    display: grid; grid-template-columns: 180px 1fr 180px 48px; gap: 0.9rem; align-items: start;
                    background: var(--input-bg); border: 1px solid var(--slate-100); padding: 0.85rem; border-radius: 12px;
                }
                .btn-remove { background: none; border: none; color: var(--rose-500); cursor: pointer; padding: 5px; border-radius: 8px; }
                .btn-remove:hover { background: var(--rose-50); }
                .hidden { display: none !important; }
                .extract-event-menu.hidden { display: none !important; }
                .deadline-menu.hidden { display: none !important; }
                .extract-event-action:hover { background: var(--slate-50) !important; }
                .deadline-action:hover { background: var(--slate-50) !important; }
            </style>
        `;

        const form = container.querySelector('#process-form-element');
        const deadlineContainer = container.querySelector('#deadline-container');
        const btnAddDeadline = container.querySelector('#btn-add-deadline');

        const renderDeadlineRows = () => {
            const reference = form.querySelector('input[name="numeroTitulo"]')?.value || formData.numeroTitulo || '—';
            if (!Array.isArray(formData.deadlines)) formData.deadlines = [];
            deadlineContainer.innerHTML = '';
            if (formData.deadlines.length === 0) {
                deadlineContainer.innerHTML = `<p class="label-tech" style="padding:1.25rem; text-align:center; color:var(--slate-400); border:1px dashed var(--slate-200); border-radius:12px;">SEM PRAZOS NO EXTRATO</p>`;
                return;
            }

            formData.deadlines.forEach((item, index) => {
                const row = document.createElement('div');
                row.className = 'deadline-row';
                row.innerHTML = `
                    <div>
                        <p class="label-tech" style="margin-bottom:0.25rem;">REFERÊNCIA</p>
                        <input type="text" class="deadline-input-ref" data-index="${index}" value="${escapeHtml(item.reference || reference || '—')}" style="padding:0.65rem; font-size:0.82rem;">
                    </div>
                    <div>
                        <p class="label-tech" style="margin-bottom:0.25rem;">DESCRIÇÃO</p>
                        <input type="text" class="deadline-input-desc" data-index="${index}" value="${escapeHtml(item.desc || '')}" style="padding:0.65rem; font-size:0.85rem;">
                    </div>
                    <div>
                        <p class="label-tech" style="margin-bottom:0.25rem;">DATA LIMITE</p>
                        <input type="date" class="deadline-input-date" data-index="${index}" value="${escapeHtml(item.date || '')}" style="padding:0.65rem; font-size:0.82rem;">
                    </div>
                    <div style="display:flex; justify-content:flex-end;">
                        <button type="button" class="deadline-remove-row-btn" data-index="${index}" style="background:none; border:none; color:var(--rose-500); cursor:pointer; font-size:0.95rem; font-weight:800; align-self:center;">x</button>
                    </div>
                `;
                deadlineContainer.appendChild(row);
            });

            deadlineContainer.querySelectorAll('.deadline-input-ref').forEach((input) => {
                input.oninput = () => {
                    const idx = Number(input.dataset.index);
                    if (!formData.deadlines[idx]) return;
                    formData.deadlines[idx].reference = input.value;
                };
            });

            deadlineContainer.querySelectorAll('.deadline-input-desc').forEach((input) => {
                input.oninput = () => {
                    const idx = Number(input.dataset.index);
                    if (!formData.deadlines[idx]) return;
                    formData.deadlines[idx].desc = input.value;
                };
            });

            deadlineContainer.querySelectorAll('.deadline-input-date').forEach((input) => {
                input.oninput = () => {
                    const idx = Number(input.dataset.index);
                    if (!formData.deadlines[idx]) return;
                    formData.deadlines[idx].date = input.value;
                };
            });

            deadlineContainer.querySelectorAll('.deadline-remove-row-btn').forEach((btn) => {
                btn.onclick = () => {
                    const idx = Number(btn.dataset.index);
                    formData.deadlines.splice(idx, 1);
                    renderDeadlineRows();
                };
            });
        };

        if (!Array.isArray(formData.deadlines)) formData.deadlines = [];
        renderDeadlineRows();
        btnAddDeadline.onclick = () => {
            formData.deadlines.push({
                id: `deadline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                status: 'pending',
                reference: form.querySelector('input[name="numeroTitulo"]')?.value || formData.numeroTitulo || '',
                desc: '',
                date: ''
            });
            renderDeadlineRows();
        };
        const getDaysDiff = (startDateStr, endDateStr) => {
            if (!startDateStr || !endDateStr) return null;
            const start = new Date(`${startDateStr}T00:00:00`);
            const end = new Date(`${endDateStr}T00:00:00`);
            return Math.round((end - start) / (1000 * 60 * 60 * 24));
        };
        const updateValidityPreview = () => {
            const label = container.querySelector('#validity-days-label');
            const input = container.querySelector('#validity-days-value');
            const numeroTitulo = String(form.querySelector('input[name="numeroTitulo"]')?.value || '').trim();
            const dataProtocolo = String(form.querySelector('input[name="dataProtocolo"]')?.value || '');
            const dataValidade = String(form.querySelector('input[name="dataValidade"]')?.value || '');
            const todayIso = new Date().toISOString().slice(0, 10);
            const isTitulo = numeroTitulo !== '';
            if (!label || !input) return;
            label.textContent = isTitulo ? 'DIAS ATÉ O VENCIMENTO' : 'DIAS PROTOCOLADOS';
            const diff = isTitulo ? getDaysDiff(todayIso, dataValidade) : getDaysDiff(dataProtocolo, todayIso);
            input.value = diff === null ? '—' : `${Math.max(0, diff)} dias`;
        };
        const numeroTituloInput = form.querySelector('input[name="numeroTitulo"]');
        const phasePreviewInput = container.querySelector('#process-phase-preview');
        if (numeroTituloInput) {
            numeroTituloInput.oninput = () => {
                if (phasePreviewInput) {
                    phasePreviewInput.value = String(numeroTituloInput.value || '').trim() ? 'Título' : 'Requerimento';
                }
                updateValidityPreview();
                renderDeadlineRows();
            };
        }
        const dataProtocoloInput = form.querySelector('input[name="dataProtocolo"]');
        const dataValidadeInput = form.querySelector('input[name="dataValidade"]');
        if (dataProtocoloInput) dataProtocoloInput.oninput = updateValidityPreview;
        if (dataValidadeInput) dataValidadeInput.oninput = updateValidityPreview;
        updateValidityPreview();

        // Autocomplete setup helper
        const setupAutocomplete = (inputId, resultsId, memoryField, hiddenId = null, onSelect = null) => {
            const input = container.querySelector(`#${inputId}`);
            const results = container.querySelector(`#${resultsId}`);
            const hidden = hiddenId ? container.querySelector(`#${hiddenId}`) : null;

            input.onfocus = () => {
                const val = input.value.toLowerCase().trim();
                const items = memoryField === 'clients' ? clients : 
                             memoryField === 'projects' ? processStore.getProjectsByClient(Number(container.querySelector('#client-id-hidden').value)) :
                             processStore.getUniqueFieldValues(memoryField);
                
                renderResults(items, val);
            };

            input.oninput = (e) => {
                const val = e.target.value.toLowerCase().trim();
                const items = memoryField === 'clients' ? clients : 
                             memoryField === 'projects' ? processStore.getProjectsByClient(Number(container.querySelector('#client-id-hidden').value)) :
                             processStore.getUniqueFieldValues(memoryField);
                
                if (hidden) hidden.value = ''; // Reset ID if user types
                if (memoryField === 'clients') {
                    const metaA = container.querySelector('#client-meta-a');
                    const metaB = container.querySelector('#client-meta-b');
                    const metaLabelA = container.querySelector('#client-meta-label-a');
                    const metaLabelB = container.querySelector('#client-meta-label-b');
                    if (metaA && metaB && metaLabelA && metaLabelB) {
                        metaLabelA.textContent = 'NOME EMPRESARIAL (SE PJ)';
                        metaLabelB.textContent = 'CPF / CNPJ';
                        metaA.value = '';
                        metaB.value = '';
                    }
                }
                renderResults(items, val);
            };

            const renderResults = (items, filter) => {
                const matches = items.filter(item => {
                    const text = typeof item === 'string' ? item : (item.name || item.nome || item.nomeFantasia || '');
                    return text.toLowerCase().includes(filter);
                });

                if (matches.length > 0) {
                    results.innerHTML = matches.map((item, index) => {
                        const name = typeof item === 'string' ? item : (item.name || item.nome || item.nomeFantasia || '');
                        const sub = typeof item === 'string' ? '' : (item.cpf || item.cnpj || '');
                        return `
                            <div class="search-item" data-index="${index}">
                                <span class="name">${escapeHtml(name)}</span>
                                ${sub ? `<span class="sub">${escapeHtml(sub)}</span>` : ''}
                            </div>
                        `;
                    }).join('');
                    results.classList.remove('hidden');

                    results.querySelectorAll('.search-item').forEach(el => {
                        el.onclick = () => {
                            const item = matches[Number(el.dataset.index)];
                            const selectedId = typeof item === 'string' ? item : item.id;
                            const selectedName = typeof item === 'string' ? item : (item.name || item.nome || item.nomeFantasia || '');
                            input.value = selectedName;
                            if (hidden) hidden.value = selectedId;
                            results.classList.add('hidden');
                            if (onSelect) onSelect(String(selectedId));
                        };
                    });
                } else {
                    results.classList.add('hidden');
                }
            };
        };

        const clientMetaLabelA = container.querySelector('#client-meta-label-a');
        const clientMetaInputA = container.querySelector('#client-meta-a');
        const clientMetaLabelB = container.querySelector('#client-meta-label-b');
        const clientMetaInputB = container.querySelector('#client-meta-b');

        const updateClientMeta = (clientId) => {
            const selected = clients.find((c) => String(c.id) === String(clientId));
            if (!selected) {
                clientMetaLabelA.textContent = 'NOME EMPRESARIAL (SE PJ)';
                clientMetaInputA.value = '';
                clientMetaLabelB.textContent = 'CPF / CNPJ';
                clientMetaInputB.value = '';
                return;
            }
            if (selected.type === 'PF') {
                clientMetaLabelA.textContent = 'NOME EMPRESARIAL (SE PJ)';
                clientMetaInputA.value = '—';
                clientMetaLabelB.textContent = 'CPF';
                clientMetaInputB.value = selected.cpf || '';
            } else {
                clientMetaLabelA.textContent = 'NOME EMPRESARIAL';
                clientMetaInputA.value = selected.nomeEmpresarial || '';
                clientMetaLabelB.textContent = 'CNPJ';
                clientMetaInputB.value = selected.cnpj || '';
            }
        };
        updateClientMeta(formData.clientId);

        const formatAreaHectares = (raw) => {
            const normalized = String(raw || '')
                .toLowerCase()
                .replace(/hectares?/g, '')
                .trim();
            if (!normalized) return '';
            const numericRaw = normalized
                .replace(/\./g, '')
                .replace(',', '.')
                .replace(/[^\d.-]/g, '');
            const parsed = Number(numericRaw);
            if (Number.isNaN(parsed)) return String(raw || '').trim();
            return `${parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} hectares`;
        };

        const btnAddExtractEvent = container.querySelector('#btn-add-extract-event');
        if (btnAddExtractEvent) {
            btnAddExtractEvent.onclick = () => {
                formData.events.push({
                    id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    type: 'movimentacao',
                    description: '',
                    date: '',
                    isInitial: false,
                    usesProcessDocument: false,
                    documents: []
                });
                render();
            };
        }

        container.querySelectorAll('.extract-event-input-date').forEach((input) => {
            input.oninput = () => {
                const idx = Number(input.dataset.index);
                if (!formData.events[idx]) return;
                formData.events[idx].date = input.value;
            };
        });

        container.querySelectorAll('.extract-event-input-desc').forEach((input) => {
            input.oninput = () => {
                const idx = Number(input.dataset.index);
                if (!formData.events[idx]) return;
                formData.events[idx].description = input.value;
            };
        });

        container.querySelectorAll('.extract-remove-row-btn').forEach((btn) => {
            btn.onclick = () => {
                const idx = Number(btn.dataset.index);
                formData.events.splice(idx, 1);
                render();
            };
        });

        container.querySelectorAll('.btn-add-file-inline').forEach((btn) => {
            btn.onclick = () => {
                const idx = Number(btn.dataset.index);
                const input = container.querySelector(`.extract-event-file-input[data-index="${idx}"]`);
                if (input) input.click();
            };
        });

        container.querySelectorAll('.extract-event-file-input').forEach((input) => {
            input.onchange = async () => {
                const idx = Number(input.dataset.index);
                const file = input.files?.[0];
                if (!file || !formData.events[idx]) return;
                
                try {
                    const doc = await uploadDocumentFile(file, 'eventos', formData.clientId || 'temp');
                    const event = formData.events[idx];
                    if (isInitialEvent(event)) {
                        formData.docBase64 = '';
                        formData.docStoragePath = doc.storagePath || '';
                        formData.docSize = doc.size || 0;
                        formData.docName = doc.name;
                        formData.docType = doc.type;
                    } else {
                        event.documents = [doc];
                    }
                    render();
                } catch (error) {
                    console.error('Erro no upload do evento:', error);
                    showNoticeModal('Falha no upload', 'Não foi possível enviar o arquivo do evento.');
                }
            };
        });

        container.querySelectorAll('.extract-remove-file-btn').forEach((btn) => {
            btn.onclick = () => {
                const idx = Number(btn.dataset.index);
                const docId = String(btn.dataset.docId || '');
                const event = formData.events[idx];
                if (!event) return;
                if (isInitialEvent(event)) {
                    formData.docBase64 = '';
                    formData.docStoragePath = '';
                    formData.docName = '';
                    formData.docType = '';
                } else {
                    event.documents = (event.documents || []).filter((doc) => String(doc.id) !== docId);
                }
                render();
            };
        });

        // Initialize all autocompletes
        setupAutocomplete('client-search-input', 'client-results', 'clients', 'client-id-hidden', (id) => {
            // Reset project when client changes
            container.querySelector('#project-search-input').value = '';
            container.querySelector('#project-id-hidden').value = '';
            updateClientMeta(id);
        });
        
        setupAutocomplete('project-search-input', 'project-results', 'projects', 'project-id-hidden');
        setupAutocomplete('input-tipo', 'results-tipo', 'tipo');
        setupAutocomplete('input-tipo-sigla', 'results-tipo-sigla', 'tipoSigla');
        setupAutocomplete('input-tipologia', 'results-tipologia', 'tipologia');
        setupAutocomplete('input-orgao-sigla', 'results-orgao', 'orgaoSigla');

        const inputOrgaoNome = form.querySelector('input[name="orgaoNomeCompleto"]');
        const inputOrgaoSigla = form.querySelector('input[name="orgaoSigla"]');
        if (inputOrgaoNome && inputOrgaoSigla) {
            inputOrgaoNome.addEventListener('blur', () => {
                const learnedSigla = processStore.getLearnedOrgaoSigla(inputOrgaoNome.value);
                if (learnedSigla && !String(inputOrgaoSigla.value || '').trim()) {
                    inputOrgaoSigla.value = learnedSigla;
                }
            });
        }

        const inputTipo = form.querySelector('input[name="tipo"]');
        const inputTipoSigla = form.querySelector('input[name="tipoSigla"]');
        if (inputTipo && inputTipoSigla) {
            inputTipo.addEventListener('blur', () => {
                const learnedSigla = processStore.getLearnedTipoSigla(inputTipo.value);
                if (learnedSigla && !String(inputTipoSigla.value || '').trim()) {
                    inputTipoSigla.value = learnedSigla;
                }
            });
        }

        const areaInput = container.querySelector('#input-area-processo');
        if (areaInput) {
            areaInput.addEventListener('blur', () => {
                areaInput.value = formatAreaHectares(areaInput.value);
            });
        }

        // Global click to close results
        container.onclick = (e) => {
            container.querySelectorAll('.search-results').forEach(res => {
                const id = res.id.replace('-results', '-search-input').replace('results-', 'input-');
                const input = container.querySelector(`#${id}`) || container.querySelector(`#${res.id.replace('-results', '-search-input')}`);
                if (input && !input.contains(e.target) && !res.contains(e.target)) {
                    res.classList.add('hidden');
                }
            });
            container.querySelectorAll('.extract-event-menu').forEach((menu) => {
                if (!menu.contains(e.target) && !e.target.closest('.extract-event-menu-btn')) {
                    menu.classList.add('hidden');
                }
            });
            container.querySelectorAll('.deadline-menu').forEach((menu) => {
                if (!menu.contains(e.target) && !e.target.closest('.deadline-menu-btn')) {
                    menu.classList.add('hidden');
                }
            });
        };

        container.querySelector('#btn-cancel').onclick = () => onCancel();

        form.onsubmit = async (e) => {
            e.preventDefault();
            const clientId = container.querySelector('#client-id-hidden').value;
            if (!clientId) {
                showNoticeModal('Validação', 'Por favor, selecione um titular cadastrado.');
                return;
            }

            const data = Object.fromEntries(new FormData(form).entries());
            
            // Collect deadlines
            data.deadlines = (formData.deadlines || []).map((item) => ({
                reference: item.reference || '',
                desc: item.desc || '',
                date: item.date || '',
                id: item.id || null,
                status: item.status || 'pending'
            }));

            // Project handling
            data.projectId = container.querySelector('#project-id-hidden').value || null;
            data.projectName = container.querySelector('#project-search-input').value || null;
            data.orgao = data.orgaoNomeCompleto
                ? `${data.orgaoNomeCompleto}${data.orgaoSigla ? ` - ${data.orgaoSigla}` : ''}`
                : (data.orgaoSigla || '');
            data.fase = String(data.numeroTitulo || '').trim() ? 'Título' : 'Requerimento';
            data.area = formatAreaHectares(data.area);

            // Merge document data
            data.docBase64 = formData.docBase64 || '';
            data.docStoragePath = formData.docStoragePath || '';
            data.docSize = formData.docSize || 0;
            data.docName = formData.docName || '';
            data.docType = formData.docType || '';
            data.events = formData.events || [];

            onSave(data);
        };
    };

    render();
}

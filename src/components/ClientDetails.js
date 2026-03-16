import { showNoticeModal } from './NoticeModal.js';
import { escapeHtml } from '../utils/sanitize.js';

// Client Details Component
export function renderClientDetails(container, client, onBack) {
    const isPF = client.type === 'PF';
    
    const dataFields = isPF ? [
        { label: 'NOME COMPLETO', value: client.nome },
        { label: 'CPF', value: client.cpf }
    ] : [
        { label: 'NOME FANTASIA', value: client.nomeFantasia },
        { label: 'CNPJ', value: client.cnpj },
        { label: 'RAZÃO SOCIAL', value: client.nomeEmpresarial }
    ];

    const contactFields = [
        { label: 'EMAIL', value: client.email },
        { label: 'TELEFONE', value: client.telefone }
    ];

    const addressFields = [
        { label: 'LOGRADOURO', value: `${client.logradouro}, ${client.numero}` },
        { label: 'BAIRRO', value: client.bairro },
        { label: 'CIDADE / UF', value: `${client.cidade} - ${client.uf}` },
        { label: 'CEP', value: client.cep }
    ];

    container.innerHTML = `
        <div class="animate-fade-in">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2.5rem;">
                <div>
                    <button id="btn-back" class="label-tech" style="background: none; border: none; color: var(--primary); cursor: pointer; padding: 0; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                        VOLTAR PARA LISTA
                    </button>
                    <h2 class="font-black" style="font-size: 2.5rem;">${escapeHtml(isPF ? client.nome : client.nomeFantasia)}</h2>
                    <p class="label-tech" style="margin-top: 0.2rem;">DETALHES DO CADASTRO / ID #${client.id}</p>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem;">
                <!-- Main Columns: Data -->
                <div style="display: flex; flex-direction: column; gap: 2rem;">
                    
                    <div class="glass-card">
                        <h4 class="label-tech" style="margin-bottom: 2rem; color: var(--slate-900);">INFORMAÇÕES DE REGISTRO</h4>
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 2rem;">
                            ${dataFields.map(field => `
                                <div>
                                    <label class="label-tech">${field.label}</label>
                                    <div class="copyable-field">
                                        <span class="font-black">${escapeHtml(field.value || '-')}</span>
                                        ${field.value ? `
                                            <button class="btn-copy" data-value="${encodeURIComponent(field.value)}">
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                            </button>
                                        ` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                        <div class="glass-card">
                            <h4 class="label-tech" style="margin-bottom: 2rem; color: var(--slate-900);">CONTATO</h4>
                            <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                                ${contactFields.map(field => `
                                    <div>
                                        <label class="label-tech">${field.label}</label>
                                        <div class="copyable-field">
                                            <span class="font-black">${escapeHtml(field.value || '-')}</span>
                                            ${field.value ? `
                                                <button class="btn-copy" data-value="${encodeURIComponent(field.value)}">
                                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                                </button>
                                            ` : ''}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="glass-card">
                            <h4 class="label-tech" style="margin-bottom: 2rem; color: var(--slate-900);">ENDEREÇO</h4>
                            <div style="display: flex; flex-direction: column; gap: 1rem;">
                                ${addressFields.map(field => `
                                    <div>
                                        <label class="label-tech">${field.label}</label>
                                        <div class="copyable-field">
                                            <span class="font-black" style="font-size: 0.9rem;">${escapeHtml(field.value || '-')}</span>
                                            ${field.value && field.value !== ', ' && field.value !== ' - ' ? `
                                                <button class="btn-copy" data-value="${encodeURIComponent(field.value)}">
                                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                                </button>
                                            ` : ''}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Side Column: Documents -->
                <div class="glass-card" style="height: fit-content;">
                    <h4 class="label-tech" style="margin-bottom: 2rem; color: var(--slate-900);">DOCUMENTOS ANEXADOS</h4>
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        ${client.documents && client.documents.length > 0 ? client.documents.map(doc => `
                            <div class="doc-item">
                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                    <div style="background: var(--slate-100); padding: 0.5rem; border-radius: 8px;">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                                    </div>
                                    <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                        <p class="font-black" style="font-size: 0.8rem;">${escapeHtml(doc)}</p>
                                    </div>
                                    <button class="btn-download" title="Baixar Arquivo">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                                    </button>
                                </div>
                            </div>
                        `).join('') : `
                            <p class="label-tech" style="text-align: center; padding: 2rem; color: var(--slate-400);">SEM DOCUMENTOS</p>
                        `}
                    </div>
                </div>
            </div>
        </div>

        <style>
            .copyable-field { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.4rem; }
            .btn-copy, .btn-download { 
                background: none; border: none; cursor: pointer; color: var(--slate-400); 
                padding: 4px; border-radius: 6px; transition: var(--transition);
                display: flex; align-items: center; justify-content: center;
            }
            .btn-copy:hover, .btn-download:hover { background: var(--slate-100); color: var(--primary); }
            .doc-item { padding: 1rem; border: 1px solid var(--slate-100); border-radius: 12px; transition: var(--transition); }
            .doc-item:hover { border-color: var(--primary); background: var(--bg-main); }
        </style>
    `;

    container.querySelector('#btn-back').onclick = onBack;
    
    container.querySelectorAll('.btn-copy').forEach(btn => {
        btn.onclick = () => {
            const rawValue = decodeURIComponent(btn.dataset.value || '');
            navigator.clipboard.writeText(rawValue);
            const originalColor = btn.style.color;
            btn.style.color = 'var(--primary)';
            setTimeout(() => btn.style.color = originalColor, 1000);
        };
    });

    container.querySelectorAll('.btn-download').forEach(btn => {
        btn.onclick = () => showNoticeModal('Download', 'A simulação de download foi iniciada para o arquivo.');
    });
}

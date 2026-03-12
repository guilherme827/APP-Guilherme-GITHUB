import { showNoticeModal } from './NoticeModal.js';
import { escapeHtml } from '../utils/sanitize.js';

// Client Form Component (Dynamic PF/PJ)
export function renderClientForm(container, onSave, onCancel, editData = null) {
    let clientType = editData ? editData.type : 'PF';
    let uploadedFiles = editData ? editData.documents || [] : [];

    const renderFormContent = () => {
        const isPF = clientType === 'PF';
        return `
            <div class="glass-card animate-fade-in client-form-shell" style="width: 100%; margin: 0 auto; padding: 4rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3rem;">
                    <div>
                        <h2 class="font-black" style="font-size: 2rem;">${editData ? 'Editar Titular' : 'Novo Titular'}</h2>
                        <p class="label-tech" style="margin-top: 0.5rem;">CADASTRO DE TITULAR NO CONTROL.</p>
                    </div>
                    <div class="type-switch rounded-full">
                        <button class="btn-pill ${isPF ? 'btn-black' : ''}" id="btn-set-pf">PESSOA FÍSICA</button>
                        <button class="btn-pill ${!isPF ? 'btn-black' : ''}" id="btn-set-pj">PESSOA JURÍDICA</button>
                    </div>
                </div>

                <form id="client-form-element">
                    <!-- Identification Section -->
                    <div class="form-section">
                        <h4 class="label-tech" style="margin-bottom: 1.5rem; color: var(--slate-900);">01. Identificação (Obrigatório)</h4>
                        <div class="grid-2">
                            ${isPF ? `
                                <div class="form-group">
                                    <label class="label-tech">NOME COMPLETO</label>
                                    <div class="field-shell"><input type="text" name="nome" value="${escapeHtml(editData?.nome || '')}" required placeholder="Ex: João Silva"></div>
                                </div>
                                <div class="form-group">
                                    <label class="label-tech">CPF</label>
                                    <div class="field-shell"><input type="text" name="cpf" value="${escapeHtml(editData?.cpf || '')}" required placeholder="000.000.000-00"></div>
                                </div>
                            ` : `
                                <div class="form-group">
                                    <label class="label-tech">NOME FANTASIA</label>
                                    <div class="field-shell"><input type="text" name="nomeFantasia" value="${escapeHtml(editData?.nomeFantasia || '')}" required placeholder="Ex: Geoconsult"></div>
                                </div>
                                <div class="form-group" style="grid-column: span 1;">
                                    <label class="label-tech">CNPJ</label>
                                    <div class="field-shell"><input type="text" name="cnpj" value="${escapeHtml(editData?.cnpj || '')}" required placeholder="00.000.000/0000-00"></div>
                                </div>
                                <div class="form-group" style="grid-column: span 2;">
                                    <label class="label-tech">NOME EMPRESARIAL / RAZÃO SOCIAL</label>
                                    <div class="field-shell"><input type="text" name="nomeEmpresarial" value="${escapeHtml(editData?.nomeEmpresarial || '')}" required placeholder="Ex: Geoconsult Gestão LTDA"></div>
                                </div>
                            `}
                        </div>
                    </div>

                    <!-- Contact Section -->
                    <div class="form-section" style="margin-top: 3rem;">
                        <h4 class="label-tech" style="margin-bottom: 1.5rem;">02. Contato (Opcional)</h4>
                        <div class="grid-2">
                            <div class="form-group">
                                <label class="label-tech">EMAIL</label>
                                <div class="field-shell"><input type="email" name="email" value="${escapeHtml(editData?.email || '')}" placeholder="email@exemplo.com"></div>
                            </div>
                            <div class="form-group">
                                <label class="label-tech">TELEFONE</label>
                                <div class="field-shell"><input type="text" name="telefone" value="${escapeHtml(editData?.telefone || '')}" placeholder="(00) 00000-0000"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Address Section -->
                    <div class="form-section" style="margin-top: 3rem;">
                        <h4 class="label-tech" style="margin-bottom: 1.5rem;">03. Endereço (Opcional)</h4>
                        <div class="grid-address">
                            <div class="form-group" style="grid-column: span 3;">
                                <label class="label-tech">LOGRADOURO</label>
                                <div class="field-shell"><input type="text" name="logradouro" value="${escapeHtml(editData?.logradouro || '')}" placeholder="Rua, Avenida, etc."></div>
                            </div>
                            <div class="form-group">
                                <label class="label-tech">NÚMERO</label>
                                <div class="field-shell"><input type="text" name="numero" value="${escapeHtml(editData?.numero || '')}" placeholder="123"></div>
                            </div>
                            <div class="form-group">
                                <label class="label-tech">BAIRRO</label>
                                <div class="field-shell"><input type="text" name="bairro" value="${escapeHtml(editData?.bairro || '')}" placeholder="Centro"></div>
                            </div>
                            <div class="form-group">
                                <label class="label-tech">CIDADE</label>
                                <div class="field-shell"><input type="text" name="cidade" value="${escapeHtml(editData?.cidade || '')}" placeholder="São Paulo"></div>
                            </div>
                            <div class="form-group">
                                <label class="label-tech">UF</label>
                                <div class="field-shell"><input type="text" name="uf" value="${escapeHtml(editData?.uf || '')}" placeholder="SP" maxlength="2"></div>
                            </div>
                            <div class="form-group">
                                <label class="label-tech">CEP</label>
                                <div class="field-shell"><input type="text" name="cep" value="${escapeHtml(editData?.cep || '')}" placeholder="00000-000"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Documents Section -->
                    <div class="form-section" style="margin-top: 3rem;">
                        <h4 class="label-tech" style="margin-bottom: 1.5rem;">04. Documentos</h4>
                        <div class="upload-zone rounded-3xl" id="upload-zone">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                            <p class="label-tech" style="margin-top: 1rem;">CARREGAR DOCUMENTOS (PDF, JPG, PNG)</p>
                            <input type="file" id="file-input" multiple style="display: none;">
                        </div>
                        <div id="file-list" style="margin-top: 2rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;">
                            ${uploadedFiles.map((f, idx) => `
                                <div class="file-card glass-card" style="padding: 1rem; position: relative; border-radius: 16px;">
                                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                                        <div style="background: var(--slate-100); padding: 0.5rem; border-radius: 8px;">
                                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                                        </div>
                                        <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                            <p class="font-black" style="font-size: 0.8rem;">${escapeHtml(f)}</p>
                                            <p class="label-tech" style="font-size: 8px;">DOCUMENTO</p>
                                        </div>
                                    </div>
                                    <button type="button" class="btn-delete-file" data-index="${idx}" style="position: absolute; top: 0.5rem; right: 0.5rem; background: none; border: none; color: var(--rose-500); cursor: pointer;">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 4rem; padding-top: 2rem; border-top: 1px solid var(--slate-200);">
                        <button type="button" class="btn-pill" id="btn-cancel" style="background: transparent; color: var(--slate-400);">CANCELAR</button>
                        <button type="submit" class="btn-pill btn-black">SALVAR TITULAR</button>
                    </div>
                </form>
            </div>

            <style>
                .type-switch { background: var(--slate-200); padding: 0.3rem; display: flex; gap: 0.2rem; }
                .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
                .grid-address { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; }
                .form-section { border-left: 2px solid var(--slate-200); padding-left: 2rem; }
                .client-form-shell .form-group label { display: block; margin-bottom: 0.75rem; }
                .client-form-shell .field-shell {
                    background: rgba(255, 255, 255, 0.78);
                    border-radius: 14px;
                    padding: 0.1rem 0.95rem 0;
                    border: none;
                    box-shadow: inset 0 -1px 0 var(--slate-200);
                    transition: var(--transition);
                }
                .client-form-shell .field-shell:focus-within {
                    background: rgba(255, 255, 255, 0.94);
                    box-shadow: inset 0 -2px 0 var(--primary), 0 0 0 4px rgba(16, 185, 129, 0.08);
                }
                .client-form-shell .field-shell input {
                    width: 100%;
                    padding: 0.95rem 0 0.9rem;
                    border: none;
                    outline: none;
                    background: transparent;
                    font-family: inherit;
                    color: var(--slate-950);
                }
                .client-form-shell .field-shell input::placeholder {
                    color: var(--slate-400);
                }
                .upload-zone { 
                    border: 2px dashed var(--slate-200); 
                    padding: 3rem; 
                    text-align: center; 
                    cursor: pointer; 
                    transition: var(--transition);
                }
                .upload-zone:hover { border-color: var(--primary); background: rgba(16, 185, 129, 0.05); }
                .grid-address .form-group:nth-child(1) { grid-column: span 2; }
                .file-card { transition: var(--transition); border-color: var(--slate-200) !important; box-shadow: none !important; }
                .file-card:hover { transform: translateY(-3px); border-color: var(--primary) !important; }
            </style>
        `;
    };

    const setupEventListeners = () => {
        const form = container.querySelector('#client-form-element');
        
        container.querySelector('#btn-set-pf').onclick = () => { clientType = 'PF'; refresh(); };
        container.querySelector('#btn-set-pj').onclick = () => { clientType = 'PJ'; refresh(); };
        container.querySelector('#btn-cancel').onclick = onCancel;

        // Masking Logic
        const masks = {
            cpf: (v) => v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').replace(/(-\d{2})\d+?$/, '$1'),
            cnpj: (v) => v.replace(/\D/g, '').replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2').replace(/(-\d{2})\d+?$/, '$1'),
            telefone: (v) => v.replace(/\D/g, '').replace(/^(\d{2})(\d)/g, '($1) $2').replace(/(\d)(\d{4})$/, '$1-$2'),
            cep: (v) => v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').replace(/(-\d{3})\d+?$/, '$1')
        };

        const applyMask = (name, maskFn) => {
            const input = form.querySelector(`input[name="${name}"]`);
            if (input) {
                input.spellcheck = true; 
                input.oninput = (e) => {
                    e.target.value = maskFn(e.target.value);
                };
            }
        };

        if (clientType === 'PF') applyMask('cpf', masks.cpf);
        else applyMask('cnpj', masks.cnpj);
        applyMask('telefone', masks.telefone);
        applyMask('cep', masks.cep);
        
        form.querySelectorAll('input').forEach(input => input.spellcheck = true);
        
        const uploadZone = container.querySelector('#upload-zone');
        const fileInput = container.querySelector('#file-input');
        uploadZone.onclick = () => fileInput.click();
        
        fileInput.onchange = (e) => {
            const files = Array.from(e.target.files).map(f => f.name);
            uploadedFiles = [...uploadedFiles, ...files];
            refresh();
        };

        container.querySelectorAll('.btn-delete-file').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const idx = Number(btn.dataset.index);
                uploadedFiles.splice(idx, 1);
                refresh();
            };
        });

        form.onsubmit = (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            data.type = clientType;
            data.documents = uploadedFiles;
            
            try {
                onSave(data);
            } catch (err) {
                showNoticeModal('Não foi possível salvar', err.message);
            }
        };
    };

    const refresh = () => {
        container.innerHTML = renderFormContent();
        setupEventListeners();
    };

    refresh();
}

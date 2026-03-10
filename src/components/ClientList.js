import { clientStore } from '../utils/ClientStore.js';
import { showConfirmModal } from './ConfirmModal.js';
import { showNoticeModal } from './NoticeModal.js';
import { escapeHtml } from '../utils/sanitize.js';

export function renderClientList(container, actionsContainer, onEdit, onAdd, onView) {
    const clients = clientStore.getClients();

    actionsContainer.innerHTML = `
        <button id="btn-add-client" class="btn-pill btn-black" style="padding: 0.8rem 1.8rem;">+ ADICIONAR TITULAR</button>
    `;

    container.innerHTML = `
        <div class="animate-fade-in">
            <div class="glass-card" style="padding: 1rem;">
                ${clients.length === 0 ? `
                    <div style="padding: 4rem; text-align: center;">
                        <p class="label-tech">NENHUM TITULAR ENCONTRADO</p>
                        <p style="color: var(--slate-500); margin-top: 1rem;">Comece adicionando seu primeiro titular ao sistema.</p>
                    </div>
                ` : `
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th class="label-tech">IDENTIFICAÇÃO / NOME</th>
                                <th class="label-tech">DOCUMENTO (CPF/CNPJ)</th>
                                <th style="width: 40px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${clients.map(client => `
                                <tr>
                                    <td>
                                        <div class="client-link" data-id="${client.id}" style="display: flex; flex-direction: column; cursor: pointer;">
                                            <span class="font-black" style="font-size: 1rem; color: var(--slate-950);">${escapeHtml(client.type === 'PF' ? client.nome : client.nomeFantasia)}</span>
                                            ${client.type === 'PJ' ? `<span class="label-tech" style="font-size: 8px; margin-top: 4px;">${escapeHtml(client.nomeEmpresarial)}</span>` : ''}
                                        </div>
                                    </td>
                                    <td>
                                        <span class="label-tech">${escapeHtml(client.type === 'PF' ? client.cpf : client.cnpj)}</span>
                                    </td>
                                    <td style="text-align: right;">
                                        <div class="actions-wrapper">
                                            <button class="btn-actions" data-id="${client.id}">
                                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                                            </button>
                                            <div class="actions-dropdown hidden" id="dropdown-${client.id}">
                                                <button class="edit-link" data-id="${client.id}">Editar</button>
                                                <button class="delete-link" data-id="${client.id}" style="color: var(--rose-500);">Excluir</button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `}
            </div>
        </div>

        <style>
            .client-link { transition: var(--transition); width: fit-content; }
            .client-link:hover span.font-black { color: var(--primary) !important; transform: translateX(5px); }
            .actions-wrapper { position: relative; display: inline-block; }
            .btn-actions { background: none; border: none; cursor: pointer; color: var(--slate-400); padding: 0.5rem; border-radius: 8px; transition: var(--transition); }
            .btn-actions:hover { background: var(--slate-200); color: var(--slate-950); }
            .actions-dropdown { 
                position: absolute; right: 0; top: 100%; background: white; 
                border: 1px solid var(--slate-200); border-radius: 12px; 
                overflow: hidden; z-index: 100; box-shadow: var(--shadow-deep);
                width: 140px;
            }
            .actions-dropdown.hidden { display: none; }
            .actions-dropdown button { 
                display: block; width: 100%; padding: 0.75rem 1rem; text-align: left; 
                background: none; border: none; cursor: pointer; font-size: 12px; font-weight: 600;
                transition: var(--transition);
            }
            .actions-dropdown button:hover { background: var(--bg-main); }
        </style>
    `;

    // Event Listeners
    actionsContainer.querySelector('#btn-add-client').onclick = onAdd;

    container.querySelectorAll('.client-link').forEach(link => {
        link.onclick = () => onView(clients.find(c => c.id == link.dataset.id));
    });

    container.querySelectorAll('.btn-actions').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const dropdown = container.querySelector(`#dropdown-${id}`);
            container.querySelectorAll('.actions-dropdown').forEach(d => { if(d !== dropdown) d.classList.add('hidden'); });
            dropdown.classList.toggle('hidden');
        };
    });

    container.querySelectorAll('.edit-link').forEach(link => {
        link.onclick = () => {
            const client = clients.find(c => c.id == link.dataset.id);
            onEdit(client);
        };
    });

    container.querySelectorAll('.delete-link').forEach(link => {
        link.onclick = () => {
            const id = link.dataset.id;
            const client = clients.find(c => c.id == id);
            const name = client.type === 'PF' ? client.nome : client.nomeFantasia;
            
            showConfirmModal(
                'Excluir Titular',
                `Deseja realmente excluir o titular "${name}"? Esta ação removerá todos os dados do titular e não pode ser desfeita.`,
                () => {
                    try {
                        clientStore.deleteClient(Number(id));
                        renderClientList(container, actionsContainer, onEdit, onAdd, onView);
                    } catch (err) {
                        showNoticeModal('Não foi possível excluir', err.message);
                    }
                }
            );
        };
    });

    container.onclick = () => {
        container.querySelectorAll('.actions-dropdown').forEach(d => d.classList.add('hidden'));
    };
}

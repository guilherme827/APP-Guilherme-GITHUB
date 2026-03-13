import { processStore } from '../utils/ProcessStore.js';
import { clientStore } from '../utils/ClientStore.js';
import { escapeHtml } from '../utils/sanitize.js';

export function renderDeadlineDashboard(container, options = {}) {
    const canEdit = options.canEdit !== false;
    const render = (view = 'dashboard', selectedCategory = 'pending') => {
        container.innerHTML = '';
        
        const allDeadlines = [];
        processStore.processes.forEach(p => {
            (p.deadlines || []).forEach(d => {
                allDeadlines.push({ 
                    ...d, 
                    processId: p.id, 
                    processTipo: p.tipo, 
                    processNum: p.numeroTitulo || p.numeroProcesso, 
                    clientId: p.clientId 
                });
            });
        });

        if (view === 'dashboard') {
            renderMainDashboard(container, allDeadlines, (cat) => render('list', cat));
        } else {
            renderDeadlineList(container, allDeadlines, selectedCategory, () => render('dashboard'), render, canEdit);
        }
    };

    render();
}

function renderMainDashboard(container, allDeadlines, onSelectCategory) {
    const pending = allDeadlines.filter(d => d.status === 'pending');
    const completed = allDeadlines.filter(d => d.status === 'completed');
    const archived = allDeadlines.filter(d => d.status === 'archived');

    const daysDiff = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(dateStr + 'T00:00:00');
        const today = new Date();
        today.setHours(0,0,0,0);
        return Math.round((d - today) / (1000 * 60 * 60 * 24));
    };

    const expiredCount = pending.filter(d => {
        const diff = daysDiff(d.date);
        return diff !== null && diff < 0;
    }).length;

    const upcomingCount = pending.filter(d => {
        const diff = daysDiff(d.date);
        return diff !== null && diff >= 0 && diff <= 7;
    }).length;

    container.innerHTML = `
        <div class="animate-fade-in" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; margin-top: 1rem;">
            <!-- Pending Card -->
            <div class="glass-card deadline-card-premium" id="card-pending" style="cursor: pointer; padding: 3rem; border: 1px solid var(--slate-100); transition: var(--transition);">
                <div style="display: flex; flex-direction: column; gap: 2rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="background: #ecfdf5; color: var(--primary); width: 56px; height: 56px; border-radius: 18px; display: flex; align-items: center; justify-content: center;">
                            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        </div>
                        <span class="label-tech" style="background: var(--primary); color: white; padding: 4px 12px; border-radius: 20px;">${pending.length} ATIVOS</span>
                    </div>
                    <div>
                        <h3 class="font-black" style="font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--slate-900);">PRAZOS EM ABERTO</h3>
                        <div style="display: flex; gap: 1rem; align-items: center;">
                            ${expiredCount > 0 ? `<span style="font-size: 10px; font-weight: 800; color: var(--rose-500);">${expiredCount} VENCIDOS</span>` : ''}
                            ${upcomingCount > 0 ? `<span style="font-size: 10px; font-weight: 800; color: #f59e0b;">${upcomingCount} ESSA SEMANA</span>` : ''}
                            ${expiredCount === 0 && upcomingCount === 0 ? `<span style="font-size: 10px; font-weight: 800; color: var(--slate-400);">TUDO SOB CONTROLE</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Completed Card -->
            <div class="glass-card deadline-card-premium" id="card-completed" style="cursor: pointer; padding: 3rem; border: 1px solid var(--slate-100); transition: var(--transition);">
                <div style="display: flex; flex-direction: column; gap: 2rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="background: #eff6ff; color: #2563eb; width: 56px; height: 56px; border-radius: 18px; display: flex; align-items: center; justify-content: center;">
                            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        </div>
                        <span class="label-tech" style="background: #2563eb; color: white; padding: 4px 12px; border-radius: 20px;">${completed.length} FEITOS</span>
                    </div>
                    <div>
                        <h3 class="font-black" style="font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--slate-900);">PRAZOS CUMPRIDOS</h3>
                        <p class="label-tech" style="color: var(--slate-400);">HISTÓRICO DE ENTREGAS</p>
                    </div>
                </div>
            </div>

            <!-- Archived Card -->
            <div class="glass-card deadline-card-premium" id="card-archived" style="cursor: pointer; padding: 3rem; border: 1px solid var(--slate-100); transition: var(--transition);">
                <div style="display: flex; flex-direction: column; gap: 2rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="background: #f1f5f9; color: #475569; width: 56px; height: 56px; border-radius: 18px; display: flex; align-items: center; justify-content: center;">
                            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>
                        </div>
                        <span class="label-tech" style="background: #475569; color: white; padding: 4px 12px; border-radius: 20px;">${archived.length} ITENS</span>
                    </div>
                    <div>
                        <h3 class="font-black" style="font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--slate-900);">PRAZOS ARQUIVADOS</h3>
                        <p class="label-tech" style="color: var(--slate-400);">REGISTROS ANTIGOS</p>
                    </div>
                </div>
            </div>
        </div>

        <style>
            .deadline-card-premium:hover {
                transform: translateY(-10px) scale(1.02);
                border-color: var(--primary) !important;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.1);
            }
            .deadline-card-premium:hover h3 { color: var(--primary) !important; }
        </style>
    `;

    container.querySelector('#card-pending').onclick = () => onSelectCategory('pending');
    container.querySelector('#card-completed').onclick = () => onSelectCategory('completed');
    container.querySelector('#card-archived').onclick = () => onSelectCategory('archived');
}

function renderDeadlineList(container, allDeadlines, category, onBack, onRefresh, canEdit) {
    const list = allDeadlines.filter(d => d.status === category);
    
    // Sort logic
    const daysDiff = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(dateStr + 'T00:00:00');
        const today = new Date();
        today.setHours(0,0,0,0);
        return Math.round((d - today) / (1000 * 60 * 60 * 24));
    };

    if (category === 'pending') {
        list.sort((a, b) => {
            const da = daysDiff(a.date);
            const db = daysDiff(b.date);
            if (da === null) return 1;
            if (db === null) return -1;
            return da - db;
        });
    }

    const catInfo = {
        pending: { title: 'PRAZOS EM ABERTO', color: 'var(--primary)', icon: 'circle' },
        completed: { title: 'PRAZOS CUMPRIDOS', color: '#2563eb', icon: 'check-circle' },
        archived: { title: 'PRAZOS ARQUIVADOS', color: '#475569', icon: 'archive' }
    }[category];

    container.innerHTML = `
        <div class="animate-fade-in" style="margin-top: 1rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <button id="btn-back-dashboard" style="background: var(--card-bg); border: 1px solid var(--slate-200); cursor: pointer; width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: var(--slate-600); transition: var(--transition); box-shadow: var(--shadow-sm);">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <div>
                        <h3 class="font-black" style="font-size: 1.5rem; color: var(--slate-900); display: flex; align-items: center; gap: 0.75rem;">
                            ${catInfo.title}
                            <span style="font-size: 10px; background: ${catInfo.color}; color: white; padding: 2px 10px; border-radius: 20px;">${list.length}</span>
                        </h3>
                        <p class="label-tech" style="font-size: 9px; margin-top: 2px; color: var(--slate-400);">CONTROLE CENTRALIZADO DE PRAZOS</p>
                    </div>
                </div>
            </div>

            <div class="glass-card" style="padding: 1rem; border-radius: 16px; border: 1px solid var(--slate-100);">
                ${list.length === 0 ? `
                    <div style="padding: 6rem 0; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 1.5rem;">
                        <div style="background: var(--input-bg); width: 80px; height: 80px; border-radius: 16px; display: flex; align-items: center; justify-content: center; color: var(--slate-200);">
                            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4l3 3"></path></svg>
                        </div>
                        <div>
                            <p class="label-tech" style="color: var(--slate-500); font-weight: 800;">NENHUM PRAZO ENCONTRADO</p>
                            <p style="color: var(--slate-400); font-size: 0.9rem; margin-top: 0.5rem;">Tudo limpo nesta categoria por enquanto.</p>
                        </div>
                    </div>
                ` : `
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th class="label-tech">PROCESSO / TITULAR</th>
                                <th class="label-tech">DESCRIÇÃO DO PRAZO</th>
                                <th class="label-tech" style="text-align: center;">DATA LIMITE</th>
                                <th class="label-tech" style="text-align: right;">AÇÕES</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${list.map(d => {
                                const client = clientStore.clients.find(c => c.id == d.clientId);
                                const diff = daysDiff(d.date);
                                let dColor = 'var(--slate-900)';
                                let dBadge = '';
                                
                                if (category === 'pending' && diff !== null) {
                                    if (diff < 0) { 
                                        dColor = 'var(--rose-500)'; 
                                        dBadge = `<span style="font-size: 9px; color: var(--rose-500); font-weight: 800; display: block;">VENCIDO</span>`; 
                                    } else if (diff <= 30) { 
                                        dColor = '#f97316'; // Orange
                                        dBadge = `<span style="font-size: 9px; color: #f97316; font-weight: 800; display: block;">FALTAM ${diff} DIAS</span>`; 
                                    } else if (diff <= 90) { 
                                        dColor = '#eab308'; // Yellow
                                        dBadge = `<span style="font-size: 9px; color: #eab308; font-weight: 800; display: block;">FALTAM ${diff} DIAS</span>`; 
                                    } else { 
                                        dColor = '#10b981'; // Green
                                        dBadge = `<span style="font-size: 9px; color: #10b981; font-weight: 800; display: block;">FALTAM ${diff} DIAS</span>`; 
                                    }
                                }

                                return `
                                <tr>
                                    <td>
                                        <div style="display: flex; flex-direction: column;">
                                            <span class="font-black" style="font-size: 0.9rem;">${escapeHtml(d.processTipo || 'Processo')} ${escapeHtml(d.processNum || '')}</span>
                                            <span class="label-tech" style="font-size: 8px; color: var(--slate-400);">${escapeHtml(client?.type === 'PF' ? client.nome : client?.nomeFantasia || 'Titular')}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span style="font-weight: 600; font-size: 0.95rem; color: var(--slate-800);">${escapeHtml(d.desc || '')}</span>
                                    </td>
                                    <td style="text-align: center;">
                                        <div style="display: flex; flex-direction: column; align-items: center;">
                                            <span class="font-black" style="font-size: 0.9rem; color: ${dColor};">${d.date ? new Date(d.date + 'T00:00:00').toLocaleDateString('pt-BR') : '–'}</span>
                                            ${dBadge}
                                        </div>
                                    </td>
                                    <td style="text-align: right;">
                                        <div style="display: flex; justify-content: flex-end; gap: 0.6rem;">
                                            ${canEdit && category === 'pending' ? `
                                                <button class="btn-action-status btn-pill" data-pid="${d.processId}" data-did="${d.id}" data-status="completed" style="background: var(--bg-main); color: var(--primary); font-size: 9px; padding: 8px 16px;">CONCLUIR</button>
                                            ` : ''}
                                            ${canEdit && category === 'completed' ? `
                                                <button class="btn-action-status btn-pill" data-pid="${d.processId}" data-did="${d.id}" data-status="pending" style="background: var(--bg-main); color: #f59e0b; font-size: 9px; padding: 8px 16px;">REABRIR</button>
                                                <button class="btn-action-status btn-pill" data-pid="${d.processId}" data-did="${d.id}" data-status="archived" style="background: var(--bg-main); color: var(--slate-500); font-size: 9px; padding: 8px 16px;">ARQUIVAR</button>
                                            ` : ''}
                                            ${canEdit && category === 'archived' ? `
                                                <button class="btn-action-status btn-pill" data-pid="${d.processId}" data-did="${d.id}" data-status="pending" style="background: var(--bg-main); color: var(--primary); font-size: 9px; padding: 8px 16px;">RESTAURAR</button>
                                            ` : ''}
                                        </div>
                                    </td>
                                </tr>
                            `;}).join('')}
                        </tbody>
                    </table>
                `}
            </div>
        </div>

        <style>
            .btn-action-status:hover { background: var(--slate-100) !important; transform: scale(1.05); }
        </style>
    `;

    container.querySelector('#btn-back-dashboard').onclick = onBack;
    
    container.querySelectorAll('.btn-action-status').forEach(btn => {
        btn.onclick = async () => {
            const { pid, did, status } = btn.dataset;
            await processStore.updateDeadlineStatus(Number(pid), did, status);
            onRefresh('list', category);
        };
    });
}

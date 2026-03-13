// Modal Component (Premium Refactor)
export function initModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'modal-root';
    backdrop.innerHTML = `
        <div class="modal-content glass-card rounded-3xl animate-fade-in shadow-2xl">
            <div class="modal-header" style="margin-bottom: 2rem;">
                <h3 class="font-black" style="font-size: 1.5rem;">Novo Registro</h3>
                <p class="label-tech">ADICIONAR AO SISTEMA</p>
            </div>
            
            <form id="data-form">
                <div class="form-group">
                    <label class="label-tech">TÍTULO DO REGISTRO</label>
                    <input type="text" placeholder="Ex: Relatório Semanal de Vendas" required>
                </div>
                
                <div class="form-group">
                    <label class="label-tech">CATEGORIA / STATUS</label>
                    <div class="select-wrapper">
                        <select class="label-tech">
                            <option>PENDENTE</option>
                            <option>PROCESSO</option>
                            <option>CONCLUÍDO</option>
                        </select>
                    </div>
                </div>

                <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 3rem;">
                    <button type="button" class="btn-pill" id="close-modal" style="background: transparent; color: var(--slate-400);">CANCELAR</button>
                    <button type="submit" class="btn-pill btn-black">SALVAR REGISTRO</button>
                </div>
            </form>
        </div>

        <style>
            .modal-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(15, 23, 42, 0.4);
                backdrop-filter: blur(8px);
                display: none;
                justify-content: center;
                align-items: center;
                z-index: 2000;
            }

            .modal-content {
                width: 500px;
                border: 1px solid var(--slate-200);
            }

            .form-group {
                margin-bottom: 2rem;
            }

            .form-group label {
                margin-bottom: 0.75rem;
                display: block;
            }

            .form-group input, .form-group select {
                width: 100%;
                padding: 1rem 1.25rem;
                border-radius: 16px;
                border: 1px solid var(--input-border);
                background: var(--input-bg);
                color: var(--slate-900);
                font-family: inherit;
                font-size: 0.95rem;
                transition: var(--transition);
                outline: none;
            }

            .form-group input:focus {
                border-color: color-mix(in srgb, var(--primary) 58%, transparent);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
            }

            .select-wrapper select {
                appearance: none;
                cursor: pointer;
            }
        </style>
    `;
    document.body.appendChild(backdrop);

    const closeModal = () => backdrop.style.display = 'none';
    backdrop.querySelector('#close-modal').onclick = closeModal;
    backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };

    return {
        show: () => backdrop.style.display = 'flex',
        hide: closeModal
    };
}

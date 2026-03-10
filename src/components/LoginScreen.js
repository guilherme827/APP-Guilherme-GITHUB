export function renderLoginScreen(container, onLogin) {
    const state = {
        loading: false,
        error: '',
        email: ''
    };

    const render = () => {
        container.innerHTML = `
            <section class="login-shell">
                <div class="login-aurora aurora-a"></div>
                <div class="login-aurora aurora-b"></div>
                <div class="login-grid"></div>

                <div class="login-panel animate-fade-in">
                    <div class="login-card glass-card">
                        <div class="login-card-brand-surface">
                            <div class="login-logo-pill">
                                <img src="/geoconsult-logo.png" alt="GEOCONSULT" class="login-brand-logo" />
                            </div>
                        </div>

                        <div class="login-card-header">
                            <p class="label-tech">PAINEL PROTEGIDO</p>
                            <h1 class="font-black">Entrar no sistema</h1>
                            <p class="login-card-subtitle">Use seu e-mail e senha cadastrados no Supabase.</p>
                        </div>

                        <form id="login-form" class="login-form">
                            <label class="login-field">
                                <span class="label-tech">E-mail</span>
                                <input type="email" name="email" value="${escapeAttribute(state.email)}" placeholder="voce@empresa.com" required autocomplete="email" />
                            </label>

                            <label class="login-field">
                                <span class="label-tech">Senha</span>
                                <input type="password" name="password" placeholder="Digite sua senha" required autocomplete="current-password" />
                            </label>

                            ${state.error ? `<p class="login-error">${escapeHtml(state.error)}</p>` : ''}

                            <button type="submit" class="login-submit" ${state.loading ? 'disabled' : ''}>
                                ${state.loading ? 'Acessando...' : 'Acessar'}
                            </button>
                        </form>
                    </div>
                </div>
            </section>
        `;

        const form = container.querySelector('#login-form');
        container.querySelector('input[name="email"]')?.focus();
        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const email = String(formData.get('email') || '').trim();
            const password = String(formData.get('password') || '');

            state.email = email;
            state.loading = true;
            state.error = '';
            render();

            try {
                await onLogin(email, password);
            } catch (error) {
                state.loading = false;
                state.error = error?.message || 'Não foi possível iniciar a sessão.';
                render();
            }
        });
    };

    render();
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
    return escapeHtml(value);
}

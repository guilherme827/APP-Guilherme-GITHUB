import { loginSupportService } from '../utils/LoginSupportService.js';

const LOGIN_SCREEN_STYLE_ID = 'geoconsult-login-screen-styles';
const MIN_LOADING_MS = 900;

export function renderLoginScreen(container, onLogin) {
    ensureLoginScreenStyles();

    const state = {
        view: 'login',
        loading: false,
        error: '',
        success: '',
        loginEmail: '',
        loginPassword: '',
        forgotEmail: '',
        requestEmail: '',
        requestPhone: '',
        requestReason: '',
        showPassword: false
    };

    const headings = {
        login: {
            title: 'Acesse sua conta',
            subtitle: 'Entre com seu email e senha'
        },
        forgot: {
            title: 'Recuperar senha',
            subtitle: 'Enviaremos as instrucoes para o seu e-mail cadastrado'
        },
        request: {
            title: 'Solicitar acesso',
            subtitle: 'Preencha seus dados. O administrador avaliara o seu pedido.'
        }
    };

    const renderFeedback = () => `
        ${state.error ? `<p class="geo-login-error">${escapeHtml(state.error)}</p>` : ''}
        ${state.success ? `<p class="geo-login-success">${escapeHtml(state.success)}</p>` : ''}
    `;

    const renderLoginFields = () => `
        <label class="geo-login-field">
            <span class="geo-login-label">Email</span>
            <span class="geo-login-input-wrap">
                <input
                    type="email"
                    name="email"
                    value="${escapeAttribute(state.loginEmail)}"
                    placeholder="voce@geoconsult.com"
                    autocomplete="email"
                    inputmode="email"
                    required
                />
            </span>
        </label>

        <label class="geo-login-field">
            <span class="geo-login-label">Senha</span>
            <span class="geo-login-input-wrap">
                <input
                    type="${state.showPassword ? 'text' : 'password'}"
                    name="password"
                    value="${escapeAttribute(state.loginPassword)}"
                    placeholder="Digite sua senha"
                    autocomplete="current-password"
                    required
                />
                <button
                    type="button"
                    class="geo-login-visibility"
                    data-action="toggle-password"
                    aria-label="${state.showPassword ? 'Ocultar senha' : 'Mostrar senha'}"
                    aria-pressed="${state.showPassword ? 'true' : 'false'}"
                >
                    ${iconSvg(state.showPassword ? 'eye-off' : 'eye')}
                </button>
            </span>
        </label>

        ${renderFeedback()}

        <button type="submit" class="geo-login-submit" ${state.loading ? 'disabled' : ''}>
            <span>${state.loading ? 'Entrando...' : 'Entrar'}</span>
        </button>

        <div class="geo-login-actions">
            <button type="button" class="geo-login-link geo-login-link-primary" data-action="go-forgot">
                Esqueci minha senha
            </button>
            <div class="geo-login-divider" aria-hidden="true"></div>
            <div class="geo-login-signup">
                <span>Ainda nao tem uma conta?</span>
                <button type="button" class="geo-login-link geo-login-link-secondary" data-action="go-request">
                    Solicite acesso a Geoconsult
                </button>
            </div>
        </div>
    `;

    const renderForgotFields = () => `
        <label class="geo-login-field">
            <span class="geo-login-label">E-mail</span>
            <span class="geo-login-input-wrap">
                <input
                    type="email"
                    name="forgotEmail"
                    value="${escapeAttribute(state.forgotEmail)}"
                    placeholder="voce@geoconsult.com"
                    autocomplete="email"
                    inputmode="email"
                    required
                />
            </span>
        </label>

        ${renderFeedback()}

        <button type="submit" class="geo-login-submit" ${state.loading ? 'disabled' : ''}>
            <span>${state.loading ? 'Enviando...' : 'Enviar recuperacao'}</span>
        </button>

        <button type="button" class="geo-login-back" data-action="go-login">Voltar</button>
    `;

    const renderRequestFields = () => `
        <label class="geo-login-field">
            <span class="geo-login-label">E-mail corporativo</span>
            <span class="geo-login-input-wrap">
                <input
                    type="email"
                    name="requestEmail"
                    value="${escapeAttribute(state.requestEmail)}"
                    placeholder="nome@empresa.com"
                    autocomplete="email"
                    inputmode="email"
                    required
                />
            </span>
        </label>

        <label class="geo-login-field">
            <span class="geo-login-label">Telefone / WhatsApp</span>
            <span class="geo-login-input-wrap">
                <input
                    type="text"
                    name="requestPhone"
                    value="${escapeAttribute(state.requestPhone)}"
                    placeholder="(00) 00000-0000"
                    autocomplete="tel"
                    required
                />
            </span>
        </label>

        <label class="geo-login-field">
            <span class="geo-login-label">Por que voce deseja acessar o sistema?</span>
            <span class="geo-login-input-wrap">
                <textarea
                    name="requestReason"
                    rows="4"
                    placeholder="Descreva o motivo ou a empresa que representa..."
                    required
                >${escapeHtml(state.requestReason)}</textarea>
            </span>
        </label>

        ${renderFeedback()}

        <button type="submit" class="geo-login-submit" ${state.loading ? 'disabled' : ''}>
            <span>${state.loading ? 'Enviando...' : 'Enviar solicitacao'}</span>
        </button>

        <button type="button" class="geo-login-back" data-action="go-login">Voltar</button>
    `;

    const renderFormBody = () => {
        if (state.view === 'forgot') return renderForgotFields();
        if (state.view === 'request') return renderRequestFields();
        return renderLoginFields();
    };

    const resetFeedback = () => {
        state.error = '';
        state.success = '';
    };

    const setView = (view) => {
        state.view = view;
        state.loading = false;
        resetFeedback();
        render();
    };

    const withLoading = async (task, options = {}) => {
        const { renderOnSuccess = true } = options;
        state.loading = true;
        resetFeedback();
        render();
        const startedAt = Date.now();

        try {
            await task();
        } catch (error) {
            const elapsed = Date.now() - startedAt;
            if (elapsed < MIN_LOADING_MS) {
                await delay(MIN_LOADING_MS - elapsed);
            }
            state.loading = false;
            state.error = error?.message || 'Nao foi possivel processar a solicitacao.';
            render();
            return;
        }

        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_LOADING_MS) {
            await delay(MIN_LOADING_MS - elapsed);
        }
        state.loading = false;
        if (renderOnSuccess) {
            render();
        }
    };

    const render = () => {
        const heading = headings[state.view] || headings.login;

        container.innerHTML = `
            <section class="geo-login-shell">
                <div class="geo-login-glow geo-login-glow-a"></div>
                <div class="geo-login-glow geo-login-glow-b"></div>

                <div class="geo-login-frame">
                    <div class="geo-login-brand">
                        <div class="geo-login-wordmark" aria-label="GEOCONSULT">
                            <span class="geo-login-wordmark-text">GEOC</span>
                            <span class="geo-login-globe" aria-hidden="true">
                                <span class="geo-login-globe-track">
                                    <img src="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg" alt="" />
                                    <img src="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg" alt="" />
                                </span>
                                <span class="geo-login-globe-shade"></span>
                            </span>
                            <span class="geo-login-wordmark-text">NSULT</span>
                        </div>
                        <div class="geo-login-tagline-pill">
                            SISTEMA DE GESTAO INTELIGENTE
                        </div>
                    </div>

                    <div class="geo-login-card" role="presentation">
                        <form id="login-form" class="geo-login-form">
                            <div class="geo-login-heading">
                                <h1>${escapeHtml(heading.title)}</h1>
                                <p class="geo-login-subtitle">${escapeHtml(heading.subtitle)}</p>
                            </div>
                            ${renderFormBody()}
                        </form>
                    </div>

                    <div class="geo-login-footer">
                        <div class="geo-login-security-pill">
                            <span class="geo-login-security-icon" aria-hidden="true">${iconSvg('shield-check')}</span>
                            <span>Ambiente Seguro</span>
                        </div>
                        <p class="geo-login-copyright">© 2026 GEOCONSULT</p>
                    </div>
                </div>
            </section>
        `;

        const form = container.querySelector('#login-form');
        const toggleButton = container.querySelector('[data-action="toggle-password"]');
        const goForgotButton = container.querySelector('[data-action="go-forgot"]');
        const goRequestButton = container.querySelector('[data-action="go-request"]');
        const goLoginButton = container.querySelector('[data-action="go-login"]');
        const firstFocusable = container.querySelector(
            state.view === 'login' ? 'input[name="email"]' : state.view === 'forgot' ? 'input[name="forgotEmail"]' : 'input[name="requestEmail"]'
        );

        if (!state.loading && document.activeElement === document.body) {
            firstFocusable?.focus();
        }

        toggleButton?.addEventListener('click', () => {
            const passwordInput = container.querySelector('input[name="password"]');
            state.loginEmail = String(container.querySelector('input[name="email"]')?.value || '').trim();
            state.loginPassword = String(passwordInput?.value || '');
            state.showPassword = !state.showPassword;
            render();
            const nextPasswordInput = container.querySelector('input[name="password"]');
            nextPasswordInput?.focus();
            nextPasswordInput?.setSelectionRange(state.loginPassword.length, state.loginPassword.length);
        });

        goForgotButton?.addEventListener('click', () => setView('forgot'));
        goRequestButton?.addEventListener('click', () => setView('request'));
        goLoginButton?.addEventListener('click', () => setView('login'));

        form?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(form);

            if (state.view === 'forgot') {
                state.forgotEmail = String(formData.get('forgotEmail') || '').trim();
                await withLoading(async () => {
                    await loginSupportService.sendPasswordRecovery(state.forgotEmail);
                    state.success = 'Se o e-mail existir, um link de recuperacao foi enviado.';
                });
                return;
            }

            if (state.view === 'request') {
                state.requestEmail = String(formData.get('requestEmail') || '').trim();
                state.requestPhone = String(formData.get('requestPhone') || '').trim();
                state.requestReason = String(formData.get('requestReason') || '').trim();

                await withLoading(async () => {
                    const response = await loginSupportService.sendAccessRequest({
                        email: state.requestEmail,
                        phone: state.requestPhone,
                        reason: state.requestReason
                    });
                    state.success = response?.data?.message || response?.message || 'Sua solicitacao foi enviada para analise do administrador. Entraremos em contato.';
                    state.requestPhone = '';
                    state.requestReason = '';
                });
                return;
            }

            state.loginEmail = String(formData.get('email') || '').trim();
            state.loginPassword = String(formData.get('password') || '');
            await withLoading(async () => {
                await onLogin(state.loginEmail, state.loginPassword);
            }, { renderOnSuccess: false });
        });
    };

    render();
}

function ensureLoginScreenStyles() {
    if (document.getElementById(LOGIN_SCREEN_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = LOGIN_SCREEN_STYLE_ID;
    style.textContent = `
        .geo-login-shell {
            position: relative;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            background: #020617;
            padding: 32px 20px;
            isolation: isolate;
        }

        .geo-login-glow {
            position: absolute;
            width: 520px;
            height: 520px;
            border-radius: 9999px;
            filter: blur(120px);
            pointer-events: none;
            animation: geoLoginPulse 6s ease-in-out infinite;
        }

        .geo-login-glow-a {
            top: -10%;
            left: -10%;
            background: rgba(37, 99, 235, 0.2);
        }

        .geo-login-glow-b {
            right: -10%;
            bottom: -10%;
            background: rgba(6, 182, 212, 0.1);
            animation-delay: -3s;
        }

        .geo-login-frame {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 420px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 24px;
        }

        .geo-login-brand {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 14px;
        }

        .geo-login-wordmark {
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            text-align: center;
        }

        .geo-login-wordmark-text {
            font-size: clamp(2.25rem, 7vw, 3rem);
            line-height: 1;
            font-weight: 900;
            letter-spacing: -0.05em;
        }

        .geo-login-globe {
            position: relative;
            width: 40px;
            height: 40px;
            margin: 0 4px;
            overflow: hidden;
            border-radius: 9999px;
            border: 1px solid rgba(96, 165, 250, 0.2);
            background: #00102a;
            box-shadow: 0 12px 40px rgba(2, 6, 23, 0.45);
            flex: 0 0 auto;
        }

        .geo-login-globe-track {
            display: flex;
            width: 200%;
            height: 100%;
            animation: geoEarthSpin 20s linear infinite;
        }

        .geo-login-globe-track img {
            width: 50%;
            height: 100%;
            object-fit: cover;
            flex: 0 0 50%;
        }

        .geo-login-globe-shade {
            position: absolute;
            inset: 0;
            border-radius: 9999px;
            pointer-events: none;
            box-shadow: inset -4px -4px 8px rgba(0, 0, 0, 0.6), inset 2px 2px 6px rgba(255, 255, 255, 0.3);
        }

        .geo-login-tagline-pill {
            padding: 6px 16px;
            border-radius: 9999px;
            border: 1px solid rgba(51, 65, 85, 0.5);
            background: rgba(30, 41, 59, 0.4);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            color: #cbd5e1;
            font-size: clamp(8px, 2vw, 9px);
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            text-align: center;
        }

        .geo-login-card {
            width: 100%;
            min-height: 490px;
            padding: 32px;
            border-radius: 24px;
            border: 1px solid rgba(255, 255, 255, 0.05);
            background: rgba(15, 23, 42, 0.8);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            box-shadow:
                0 32px 80px rgba(2, 6, 23, 0.55),
                inset 0 1px 0 rgba(255, 255, 255, 0.05);
            animation: geoLoginEnter 700ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        .geo-login-form {
            display: flex;
            flex-direction: column;
            gap: 16px;
            min-height: 100%;
        }

        .geo-login-heading {
            display: flex;
            flex-direction: column;
            gap: 4px;
            align-items: center;
            text-align: center;
            margin-bottom: 2px;
        }

        .geo-login-label {
            font-size: 13px;
            font-weight: 500;
            color: #e2e8f0;
            margin-left: 4px;
        }

        .geo-login-heading h1 {
            margin: 0;
            color: #ffffff;
            font-size: 22px;
            font-weight: 700;
            letter-spacing: -0.02em;
        }

        .geo-login-subtitle {
            color: #94a3b8;
            font-size: 14px;
            line-height: 1.5;
        }

        .geo-login-field {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .geo-login-input-wrap {
            position: relative;
            display: flex;
            align-items: center;
        }

        .geo-login-input-wrap input,
        .geo-login-input-wrap textarea {
            width: 100%;
            min-height: 54px;
            padding: 0 48px 0 16px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.05);
            background: rgba(30, 41, 59, 0.6);
            color: #ffffff;
            font: inherit;
            outline: none;
            transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }

        .geo-login-input-wrap textarea {
            min-height: 108px;
            padding-top: 14px;
            padding-right: 16px;
            resize: vertical;
        }

        .geo-login-input-wrap input::placeholder,
        .geo-login-input-wrap textarea::placeholder {
            color: #475569;
        }

        .geo-login-input-wrap input:focus,
        .geo-login-input-wrap textarea:focus {
            border-color: rgba(59, 130, 246, 0.5);
            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
            background: rgba(2, 6, 23, 0.72);
        }

        .geo-login-visibility,
        .geo-login-security-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .geo-login-visibility {
            position: absolute;
            right: 14px;
            width: 36px;
            height: 36px;
            border: none;
            border-radius: 9999px;
            background: transparent;
            color: #94a3b8;
            cursor: pointer;
            transition: color 180ms ease, background 180ms ease;
        }

        .geo-login-visibility:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.05);
        }

        .geo-login-error,
        .geo-login-success {
            margin: -2px 0 2px;
            font-size: 0.84rem;
            line-height: 1.5;
            text-align: center;
        }

        .geo-login-error {
            color: #fda4af;
        }

        .geo-login-success {
            color: #7dd3fc;
        }

        .geo-login-submit {
            min-height: 54px;
            border: none;
            border-radius: 12px;
            background: linear-gradient(90deg, #38bdf8 0%, #3b82f6 100%);
            color: #ffffff;
            font-size: 15px;
            font-weight: 700;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 180ms ease, opacity 180ms ease, box-shadow 180ms ease;
            box-shadow: 0 18px 40px rgba(59, 130, 246, 0.2);
        }

        .geo-login-submit:hover:not(:disabled) {
            opacity: 0.9;
            transform: translateY(-1px);
            box-shadow: 0 20px 44px rgba(59, 130, 246, 0.24);
        }

        .geo-login-submit:disabled {
            cursor: wait;
            opacity: 0.8;
        }

        .geo-login-actions {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 14px;
            padding-top: 2px;
            margin-top: auto;
        }

        .geo-login-link,
        .geo-login-back {
            border: none;
            background: transparent;
            padding: 0;
            cursor: pointer;
            font: inherit;
        }

        .geo-login-link-primary,
        .geo-login-back {
            color: #94a3b8;
            font-size: 13px;
            font-weight: 400;
            transition: color 180ms ease;
            text-align: center;
        }

        .geo-login-link-primary:hover,
        .geo-login-back:hover {
            color: #ffffff;
        }

        .geo-login-back {
            margin-top: auto;
        }

        .geo-login-divider {
            width: 100%;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .geo-login-link-secondary {
            color: #38bdf8;
            font-size: 13px;
            font-weight: 500;
            transition: color 180ms ease;
        }

        .geo-login-link-secondary:hover {
            color: #67e8f9;
        }

        .geo-login-signup {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            gap: 4px;
            text-align: center;
            color: #64748b;
            font-size: 13px;
        }

        .geo-login-footer {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
        }

        .geo-login-security-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 14px;
            border-radius: 9999px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(15, 23, 42, 0.48);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            color: #94a3b8;
            font-size: 10px;
            font-weight: 500;
        }

        .geo-login-security-icon {
            color: #60a5fa;
        }

        .geo-login-copyright {
            color: #475569;
            font-size: 8px;
            font-weight: 700;
            letter-spacing: 0.2em;
            text-transform: uppercase;
        }

        @keyframes geoEarthSpin {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
        }

        @keyframes geoLoginPulse {
            0%, 100% { opacity: 0.7; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.06); }
        }

        @keyframes geoLoginEnter {
            from {
                opacity: 0;
                transform: scale(0.95) translateY(10px);
            }
            to {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
        }

        @media (min-width: 640px) {
            .geo-login-globe {
                width: 48px;
                height: 48px;
                margin: 0 6px;
            }
        }

        @media (max-width: 480px) {
            .geo-login-card {
                min-height: 0;
                padding: 24px;
                border-radius: 28px;
            }

            .geo-login-heading h1 {
                font-size: 1.7rem;
            }

            .geo-login-wordmark-text {
                letter-spacing: -0.06em;
            }
        }
    `;

    document.head.appendChild(style);
}

function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function iconSvg(name) {
    const common = 'width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    const icons = {
        eye: `<svg ${common}><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
        'eye-off': `<svg ${common}><path d="M10.733 5.076A10.744 10.744 0 0 1 12 5c4.136 0 7.715 2.355 9.938 7a10.717 10.717 0 0 1-1.441 2.497"></path><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"></path><path d="M17.479 17.499A10.75 10.75 0 0 1 12 19c-4.136 0-7.715-2.355-9.938-7a10.75 10.75 0 0 1 4.446-5.143"></path><path d="m2 2 20 20"></path></svg>`,
        'shield-check': `<svg ${common}><path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6l8-4 8 4z"></path><path d="m9 12 2 2 4-4"></path></svg>`
    };

    return icons[name] || '';
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

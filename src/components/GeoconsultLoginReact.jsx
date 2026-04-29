import { useMemo, useState } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import earthTexture from '../assets/login-globe-texture.svg';

export default function GeoconsultLoginReact() {
    const [viewState, setViewState] = useState('login');
    const [showPassword, setShowPassword] = useState(false);
    const [loginForm, setLoginForm] = useState({ email: '', password: '' });
    const [forgotEmail, setForgotEmail] = useState('');
    const [requestForm, setRequestForm] = useState({
        email: '',
        phone: '',
        reason: ''
    });

    const header = useMemo(() => {
        if (viewState === 'forgot') {
            return {
                title: 'Recuperar Senha',
                subtitle: 'Enviaremos as instrucoes para o seu e-mail cadastrado'
            };
        }

        if (viewState === 'request') {
            return {
                title: 'Solicitar Acesso',
                subtitle: 'Preencha seus dados. O administrador avaliara o seu pedido.'
            };
        }

        return {
            title: 'Acesse sua conta',
            subtitle: 'Entre com seu email e senha'
        };
    }, [viewState]);

    const inputClassName = 'w-full rounded-xl border border-white/5 bg-[#1e293b]/60 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/20';
    const labelClassName = 'mb-2 ml-1 block text-[13px] font-medium text-slate-200';
    const primaryButtonClassName = 'w-full rounded-xl bg-gradient-to-r from-[#38bdf8] to-[#3b82f6] py-3.5 text-[15px] font-bold text-white shadow-lg shadow-blue-500/20 transition hover:opacity-90';

    return (
        <div className="min-h-screen overflow-hidden bg-[#020617] px-5 py-8 text-white">
            <style>{`
                @keyframes geoconsult-earth-spin {
                    from { transform: translateX(0); }
                    to { transform: translateX(-50%); }
                }
            `}</style>

            <div className="relative flex min-h-screen items-center justify-center">
                <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[32rem] w-[32rem] rounded-full bg-blue-600/20 blur-[120px]" />
                <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] h-[32rem] w-[32rem] rounded-full bg-cyan-500/10 blur-[120px]" />

                <div className="relative z-10 flex w-full max-w-[420px] flex-col items-center gap-6">
                    <div className="flex flex-col items-center gap-3">
                        <div className="flex items-center justify-center">
                            <span className="text-4xl font-black tracking-tight text-white sm:text-5xl">GEOC</span>
                            <div className="relative mx-1 h-10 w-10 overflow-hidden rounded-full border border-blue-400/20 bg-[#00102a] sm:h-12 sm:w-12">
                                <div
                                    className="flex h-full w-[200%]"
                                    style={{ animation: 'geoconsult-earth-spin 20s linear infinite' }}
                                >
                                    <img src={earthTexture} alt="" className="h-full w-1/2 object-cover" />
                                    <img src={earthTexture} alt="" className="h-full w-1/2 object-cover" />
                                </div>
                                <div
                                    className="pointer-events-none absolute inset-0 rounded-full"
                                    style={{
                                        boxShadow: 'inset -4px -4px 8px rgba(0,0,0,0.6), inset 2px 2px 6px rgba(255,255,255,0.3)'
                                    }}
                                />
                            </div>
                            <span className="text-4xl font-black tracking-tight text-white sm:text-5xl">NSULT</span>
                        </div>

                        <div className="rounded-full border border-slate-700/50 bg-slate-800/40 px-4 py-1.5 text-center text-[8px] font-semibold uppercase tracking-[0.2em] text-slate-300 backdrop-blur-sm sm:text-[9px]">
                            SISTEMA DE GESTAO INTELIGENTE
                        </div>
                    </div>

                    <div className="w-full rounded-[24px] border border-white/5 bg-[#0f172a]/80 p-8 shadow-2xl shadow-black/30 backdrop-blur-xl">
                        <div className="mb-6 text-center">
                            <h1 className="mb-2 text-[22px] font-bold tracking-tight text-white">{header.title}</h1>
                            <p className="text-[14px] text-slate-400">{header.subtitle}</p>
                        </div>

                        {viewState === 'login' && (
                            <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
                                <div>
                                    <label className={labelClassName}>Email</label>
                                    <input
                                        type="email"
                                        value={loginForm.email}
                                        onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                                        className={inputClassName}
                                        placeholder="voce@geoconsult.com"
                                    />
                                </div>

                                <div>
                                    <label className={labelClassName}>Senha</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={loginForm.password}
                                            onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                                            className={`${inputClassName} pr-12`}
                                            placeholder="Digite sua senha"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((current) => !current)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
                                            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>

                                <button type="submit" className={primaryButtonClassName}>
                                    Entrar
                                </button>

                                <div className="space-y-4 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setViewState('forgot')}
                                        className="block w-full text-center text-[13px] text-slate-400 transition hover:text-white"
                                    >
                                        Esqueci minha senha
                                    </button>

                                    <div className="border-t border-white/5 pt-4 text-center text-[13px] text-slate-400">
                                        Ainda nao tem uma conta?{' '}
                                        <button
                                            type="button"
                                            onClick={() => setViewState('request')}
                                            className="font-medium text-[#38bdf8] transition hover:text-cyan-300"
                                        >
                                            Solicite acesso a Geoconsult
                                        </button>
                                    </div>
                                </div>
                            </form>
                        )}

                        {viewState === 'forgot' && (
                            <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
                                <div>
                                    <label className={labelClassName}>Email</label>
                                    <input
                                        type="email"
                                        value={forgotEmail}
                                        onChange={(event) => setForgotEmail(event.target.value)}
                                        className={inputClassName}
                                        placeholder="voce@geoconsult.com"
                                    />
                                </div>

                                <button type="submit" className={primaryButtonClassName}>
                                    Enviar link de recuperacao
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setViewState('login')}
                                    className="block w-full text-center text-[13px] text-slate-400 transition hover:text-white"
                                >
                                    Voltar para o login
                                </button>
                            </form>
                        )}

                        {viewState === 'request' && (
                            <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
                                <div>
                                    <label className={labelClassName}>Email corporativo</label>
                                    <input
                                        type="email"
                                        value={requestForm.email}
                                        onChange={(event) => setRequestForm((current) => ({ ...current, email: event.target.value }))}
                                        className={inputClassName}
                                        placeholder="nome@empresa.com"
                                    />
                                </div>

                                <div>
                                    <label className={labelClassName}>WhatsApp / Telefone</label>
                                    <input
                                        type="text"
                                        value={requestForm.phone}
                                        onChange={(event) => setRequestForm((current) => ({ ...current, phone: event.target.value }))}
                                        className={inputClassName}
                                        placeholder="(00) 00000-0000"
                                    />
                                </div>

                                <div>
                                    <label className={labelClassName}>Por que precisa de acesso ao sistema?</label>
                                    <textarea
                                        rows={4}
                                        value={requestForm.reason}
                                        onChange={(event) => setRequestForm((current) => ({ ...current, reason: event.target.value }))}
                                        className={`${inputClassName} min-h-[110px] resize-none`}
                                        placeholder="Descreva o motivo ou a empresa que representa..."
                                    />
                                </div>

                                <button type="submit" className={primaryButtonClassName}>
                                    Enviar Solicitacao
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setViewState('login')}
                                    className="block w-full text-center text-[13px] text-slate-400 transition hover:text-white"
                                >
                                    Voltar para o login
                                </button>
                            </form>
                        )}
                    </div>

                    <div className="flex flex-col items-center gap-3">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/5 bg-slate-900/50 px-4 py-2 backdrop-blur-sm">
                            <ShieldCheck size={14} className="text-blue-400" />
                            <span className="text-[10px] font-medium text-slate-400">Ambiente Seguro</span>
                        </div>
                        <p className="text-[9px] tracking-wide text-slate-600">© 2026 GEOCONSULT</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

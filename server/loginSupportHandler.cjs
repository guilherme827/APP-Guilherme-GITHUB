const { createClient } = require('@supabase/supabase-js');

function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => {
            raw += String(chunk || '');
        });
        req.on('end', () => {
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

function getClients(env) {
    const supabaseUrl = String(env.VITE_SUPABASE_URL || '').trim();
    const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY || '').trim();
    const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
        throw new Error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY precisam estar configuradas no servidor.');
    }

    return {
        anonClient: createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } }),
        serviceClient: createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    };
}

async function handleForgotPassword(body, env, res) {
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) {
        sendJson(res, 400, { error: 'E-mail é obrigatório.' });
        return;
    }

    const { anonClient, serviceClient } = getClients(env);
    const { data, error } = await serviceClient
        .from('profiles')
        .select('id')
        .eq('email', email)
        .limit(1);

    if (error) {
        sendJson(res, 500, { error: error.message || 'Não foi possível verificar o usuário.' });
        return;
    }

    const exists = Array.isArray(data) && data.length > 0;
    if (exists) {
        const redirectTo = String(env.PASSWORD_RESET_REDIRECT_TO || env.APP_URL || '').trim() || undefined;
        const { error: resetError } = await anonClient.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : {});
        if (resetError) {
            sendJson(res, 500, { error: resetError.message || 'Não foi possível enviar o e-mail de recuperação.' });
            return;
        }
    }

    sendJson(res, 200, {
        data: {
            sent: exists,
            message: 'Se o e-mail existir, um link de recuperação foi enviado.'
        }
    });
}

async function sendRequestAccessEmail(body, env) {
    const adminEmail = String(env.ACCESS_REQUEST_ADMIN_EMAIL || '').trim();
    const fromEmail = String(env.ACCESS_REQUEST_FROM_EMAIL || '').trim();
    const resendApiKey = String(env.RESEND_API_KEY || '').trim();

    if (!adminEmail || !fromEmail || !resendApiKey) {
        throw new Error('ACCESS_REQUEST_ADMIN_EMAIL, ACCESS_REQUEST_FROM_EMAIL e RESEND_API_KEY precisam estar configuradas.');
    }

    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const reason = String(body.reason || '').trim();
    const subject = 'Nova solicitação de acesso';
    const text = `Nova solicitação de acesso - Email: ${email}, WhatsApp: ${phone}, Motivo: ${reason}`;

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: fromEmail,
            to: [adminEmail],
            subject,
            text
        })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message || payload?.error || 'Não foi possível enviar a solicitação de acesso.');
    }
}

async function handleRequestAccess(body, env, res) {
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const reason = String(body.reason || '').trim();

    if (!email || !phone || !reason) {
        sendJson(res, 400, { error: 'E-mail corporativo, WhatsApp e motivo são obrigatórios.' });
        return;
    }

    try {
        await sendRequestAccessEmail({ email, phone, reason }, env);
    } catch (error) {
        sendJson(res, 500, { error: error?.message || 'Não foi possível enviar a solicitação de acesso.' });
        return;
    }

    sendJson(res, 200, {
        data: {
            message: 'Sua solicitação foi enviada para análise do administrador. Entraremos em contato.'
        }
    });
}

module.exports = async function loginSupportHandler(req, res, env = process.env) {
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Método não suportado.' });
        return;
    }

    let body;
    try {
        body = await parseBody(req);
    } catch {
        sendJson(res, 400, { error: 'Payload inválido.' });
        return;
    }

    const action = String(body.action || '').trim();
    if (action === 'forgot-password') {
        await handleForgotPassword(body, env, res);
        return;
    }

    if (action === 'request-access') {
        await handleRequestAccess(body, env, res);
        return;
    }

    sendJson(res, 400, { error: 'Ação inválida.' });
};

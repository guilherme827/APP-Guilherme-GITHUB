import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
readFileSync('.env', 'utf-8').split('\n').forEach(l => {
    const i = l.indexOf('=');
    if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});

const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function verify() {
    console.log('--- AUDITORIA DE EXCLUSÃO ---');
    
    // 1. Verifica Lixeira
    const { data: trash, error: te } = await sb.from('trash').select('id, item_label, item_type');
    console.log('LIXEIRA: ' + (trash?.length === 0 ? '✅ Vazia (0 itens)' : '⚠️ ' + (trash?.length || '?') + ' itens encontrados'));
    if (trash?.length) trash.forEach(i => console.log('  -', i.item_type, '|', i.item_label));

    // 2. Verifica Storage
    async function checkStorage(path) {
        const { data } = await sb.storage.from('documentos').list(path, { limit: 200 });
        if (!data) return 0;
        let total = 0;
        for (const item of data) {
            if (item.id === null) {
                total += await checkStorage((path ? path + '/' : '') + item.name);
            } else {
                console.log('  ARQUIVO FÍSICO ENCONTRADO:', path + '/' + item.name);
                total++;
            }
        }
        return total;
    }
    
    console.log('\nAnalisando Storage da ORG...');
    const count = await checkStorage('geoconsult-para');
    console.log('STORAGE: ' + count + ' arquivo(s) físicos encontrados totais.');

    // 3. Verifica processos
    const { count: procCount } = await sb.from('processes').select('*', { count: 'exact', head: true });
    console.log('\nPROCESSOS ATIVOS NO BANCO: ' + procCount);
}

verify().catch(console.error);

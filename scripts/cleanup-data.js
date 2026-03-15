
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function run() {
    const envContent = fs.readFileSync('.env', 'utf8');
    const env = Object.fromEntries(envContent.split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim())));
    const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('[Cleanup] Excluindo registros legados...');
    
    // Deletar processos
    const { count: pCount, error: pErr } = await supabase
        .from('processes')
        .delete({ count: 'exact' })
        .not('id', 'is', null); // Deletar tudo
        
    if (pErr) console.error('[Cleanup] Erro ao deletar processos:', pErr);
    else console.log(`[Cleanup] Processos deletados: ${pCount}`);

    // Deletar clientes
    const { count: cCount, error: cErr } = await supabase
        .from('clients')
        .delete({ count: 'exact' })
        .not('id', 'is', null);
        
    if (cErr) console.error('[Cleanup] Erro ao deletar clientes:', cErr);
    else console.log(`[Cleanup] Clientes deletados: ${cCount}`);
    
    console.log('[Cleanup] Limpeza concluída.');
}

run().catch(console.error);

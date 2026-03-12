import fs from 'node:fs';
import { ZipFile } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';

const XLSX_PATH = '/Users/guilhermeaggens/Desktop/titulares.xlsx';
const ENV_PATH = '.env';

function parseEnv(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const env = {};
    raw.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const idx = trimmed.indexOf('=');
        if (idx <= 0) return;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        env[key] = value;
    });
    return env;
}

function readXlsxRows(filePath) {
    const data = fs.readFileSync(filePath);
    const zip = new ZipFile(data);
    const entries = new Map(zip.entries().map((entry) => [entry.filename, entry]));

    const sharedStrings = readSharedStrings(entries);
    const workbookXml = entries.get('xl/workbook.xml')?.getData().toString('utf8') || '';
    const sheetRelId = workbookXml.match(/<sheet[^>]*r:id="([^"]+)"/)?.[1];
    if (!sheetRelId) throw new Error('Nao foi possivel localizar a planilha principal.');

    const relsXml = entries.get('xl/_rels/workbook.xml.rels')?.getData().toString('utf8') || '';
    const relRegex = new RegExp(`<Relationship[^>]*Id="${sheetRelId}"[^>]*Target="([^"]+)"`, 'i');
    const relMatch = relsXml.match(relRegex);
    if (!relMatch) throw new Error('Nao foi possivel resolver o arquivo da planilha.');

    const sheetPath = relMatch[1].startsWith('xl/') ? relMatch[1] : `xl/${relMatch[1]}`;
    const sheetXml = entries.get(sheetPath)?.getData().toString('utf8') || '';
    if (!sheetXml) throw new Error('Nao foi possivel ler o conteudo da planilha.');

    const rowBlocks = [...sheetXml.matchAll(/<row\b[\s\S]*?<\/row>/g)].map((m) => m[0]);
    return rowBlocks.map((block) => parseRowBlock(block, sharedStrings));
}

function readSharedStrings(entries) {
    const xml = entries.get('xl/sharedStrings.xml')?.getData().toString('utf8') || '';
    if (!xml) return [];
    return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((siMatch) => {
        const si = siMatch[1];
        const texts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
        return texts.join('');
    });
}

function parseRowBlock(block, sharedStrings) {
    const row = {};
    const cells = [...block.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)];

    cells.forEach((cellMatch) => {
        const attrsRaw = cellMatch[1] || cellMatch[3] || '';
        const body = cellMatch[2] || '';
        const ref = attrsRaw.match(/\br="([A-Z]+)\d+"/)?.[1];
        if (!ref) return;
        const type = attrsRaw.match(/\bt="([^"]+)"/)?.[1] || '';
        const valueRaw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '';
        let value = decodeXml(valueRaw);
        if (type === 's') {
            const index = Number(valueRaw);
            value = Number.isFinite(index) ? (sharedStrings[index] || '') : '';
        }
        row[ref] = String(value || '').trim();
    });

    return row;
}

function decodeXml(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function normalizeName(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizeDoc(doc) {
    return String(doc || '').replace(/\D/g, '');
}

function splitPessoaJuridica(nome, nomeEmpresarial) {
    const baseName = String(nome || '').trim();
    const baseCorp = String(nomeEmpresarial || '').trim();
    if (baseCorp) return { nomeFantasia: baseName || baseCorp, nomeEmpresarial: baseCorp };

    const separators = [' - ', ' – ', ' — '];
    for (const sep of separators) {
        if (!baseName.includes(sep)) continue;
        const [leftRaw, rightRaw] = baseName.split(sep, 2);
        const left = leftRaw.trim();
        const right = rightRaw.trim();
        const leftStartsCoop = left.toLowerCase().startsWith('cooperativa');
        const rightStartsCoop = right.toLowerCase().startsWith('cooperativa');
        if (left && right) {
            if (leftStartsCoop && !rightStartsCoop) return { nomeFantasia: right, nomeEmpresarial: left };
            if (rightStartsCoop && !leftStartsCoop) return { nomeFantasia: left, nomeEmpresarial: right };
            return { nomeFantasia: left, nomeEmpresarial: right };
        }
    }

    return { nomeFantasia: baseName, nomeEmpresarial: baseName };
}

function buildModelFromRow(row) {
    const nome = String(row.A || '').trim();
    const documento = String(row.B || '').trim();
    const tipoPessoa = String(row.C || '').trim().toUpperCase();
    const email = String(row.D || '').trim();
    const telefone = String(row.E || '').trim();
    const nomeEmpresarialRaw = String(row.F || '').trim();

    if (!nome || !documento || !tipoPessoa) return null;

    if (tipoPessoa === 'FISICA') {
        return {
            type: 'PF',
            nome,
            cpf: documento,
            nomeFantasia: '',
            cnpj: '',
            nomeEmpresarial: '',
            email,
            telefone,
            logradouro: '',
            numero: '',
            bairro: '',
            cidade: '',
            uf: '',
            cep: '',
            documents: []
        };
    }

    const pj = splitPessoaJuridica(nome, nomeEmpresarialRaw);
    return {
        type: 'PJ',
        nome: '',
        cpf: '',
        nomeFantasia: pj.nomeFantasia,
        cnpj: documento,
        nomeEmpresarial: pj.nomeEmpresarial,
        email,
        telefone,
        logradouro: '',
        numero: '',
        bairro: '',
        cidade: '',
        uf: '',
        cep: '',
        documents: []
    };
}

function modelToRow(model) {
    return {
        type: model.type,
        nome: model.type === 'PF' ? model.nome : '',
        cpf: model.type === 'PF' ? model.cpf : '',
        nome_fantasia: model.type === 'PJ' ? model.nomeFantasia : '',
        cnpj: model.type === 'PJ' ? model.cnpj : '',
        nome_empresarial: model.type === 'PJ' ? model.nomeEmpresarial : '',
        email: model.email || '',
        telefone: model.telefone || '',
        logradouro: model.logradouro || '',
        numero: model.numero || '',
        bairro: model.bairro || '',
        cidade: model.cidade || '',
        uf: model.uf || '',
        cep: model.cep || '',
        documents: model.documents || []
    };
}

async function main() {
    const env = parseEnv(ENV_PATH);
    const supabaseUrl = env.VITE_SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
        throw new Error('VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios no .env');
    }

    const rows = readXlsxRows(XLSX_PATH);
    const models = rows.slice(1).map(buildModelFromRow).filter(Boolean);

    const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: existingRows, error: existingError } = await supabase
        .from('clients')
        .select('id, type, nome, cpf, nome_fantasia, cnpj');

    if (existingError) throw new Error(existingError.message || 'Falha ao carregar titulares existentes.');

    const existingByDoc = new Set();
    const existingByName = new Set();
    for (const row of existingRows || []) {
        const doc = normalizeDoc(row.type === 'PF' ? row.cpf : row.cnpj);
        const name = normalizeName(row.type === 'PF' ? row.nome : row.nome_fantasia);
        if (doc) existingByDoc.add(doc);
        if (name) existingByName.add(`${row.type}:${name}`);
    }

    const seenInSheetDoc = new Set();
    const seenInSheetName = new Set();
    const toInsert = [];
    let skippedSheetDup = 0;
    let skippedExisting = 0;

    for (const model of models) {
        const doc = normalizeDoc(model.type === 'PF' ? model.cpf : model.cnpj);
        const name = normalizeName(model.type === 'PF' ? model.nome : model.nomeFantasia);
        const nameKey = `${model.type}:${name}`;
        const sheetDocDup = doc && seenInSheetDoc.has(doc);
        const sheetNameDup = name && seenInSheetName.has(nameKey);
        if (sheetDocDup || sheetNameDup) {
            skippedSheetDup += 1;
            continue;
        }

        if ((doc && existingByDoc.has(doc)) || (name && existingByName.has(nameKey))) {
            skippedExisting += 1;
            continue;
        }

        if (doc) seenInSheetDoc.add(doc);
        if (name) seenInSheetName.add(nameKey);
        toInsert.push(modelToRow(model));
    }

    let inserted = 0;
    const chunkSize = 100;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error } = await supabase.from('clients').insert(chunk);
        if (error) throw new Error(error.message || 'Falha ao inserir titulares.');
        inserted += chunk.length;
    }

    console.log(JSON.stringify({
        parsedFromSheet: models.length,
        scheduledInsert: toInsert.length,
        inserted,
        skippedDuplicatedInsideSheet: skippedSheetDup,
        skippedAlreadyInDatabase: skippedExisting
    }, null, 2));
}

main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
});

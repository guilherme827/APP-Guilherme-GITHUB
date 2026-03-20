import { supabaseStorage } from './SupabaseStorage.js';
import { getActiveOrganizationSlug } from '../app/organizationContext.js';

/**
 * Utilitário de ponte para gerenciar documentos.
 * Migrado de Base64 para Supabase Storage.
 */

export async function uploadDocumentFile(file, category = 'geral', itemId = 'temp') {
    if (!file) return { id: null, name: 'documento', type: 'application/octet-stream', size: 0, storagePath: '', base64: '' };

    const organizationSlug = getActiveOrganizationSlug() || 'default';
    
    try {
        const result = await supabaseStorage.uploadFile(file, {
            organizationSlug,
            category,
            itemId
        });

        return {
            id: `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name: result.name,
            type: result.type,
            size: result.size,
            storagePath: result.path,
            base64: '' // Base64 depreciado
        };
    } catch (error) {
        console.error('Falha no uploadDocumentFile:', error);
        throw error;
    }
}

export async function getDocumentAccessUrl(doc) {
    if (!doc) return null;
    if (doc.storagePath) {
        return await supabaseStorage.getPublicUrl(doc.storagePath);
    }
    return doc.base64 || null;
}

export async function deleteDocumentFile(path) {
    if (!path) return false;
    await supabaseStorage.deleteFile(path);
    return true;
}

export async function deleteDocumentFiles(paths = []) {
    const uniquePaths = [...new Set((Array.isArray(paths) ? paths : []).filter(Boolean))];
    if (uniquePaths.length === 0) return 0;
    await Promise.all(uniquePaths.map((path) => deleteDocumentFile(path)));
    return uniquePaths.length;
}

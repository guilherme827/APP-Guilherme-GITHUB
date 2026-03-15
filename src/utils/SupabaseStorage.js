import { supabase } from '../lib/supabaseClient.js';

/**
 * Serviço para gerenciar o armazenamento de documentos no Supabase Storage
 * Estrutura: {org_slug}/{categoria}/{item_id}/{filename}
 */
export const supabaseStorage = {
    BUCKET_NAME: 'documentos',

    async uploadFile(file, { organizationSlug, category, itemId }) {
        if (!file) return null;

        const cleanSlug = organizationSlug.replace(/[^\w-]/g, '');
        const cleanCategory = category.replace(/[^\w-]/g, '');
        const cleanItemId = String(itemId).replace(/[^\w-]/g, '');
        const fileName = `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
        
        const path = `${cleanSlug}/${cleanCategory}/${cleanItemId}/${fileName}`;

        const { data, error } = await supabase.storage
            .from(this.BUCKET_NAME)
            .upload(path, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            throw new Error(`Erro no upload: ${error.message}`);
        }

        return {
            path: data.path,
            name: file.name,
            size: file.size,
            type: file.type
        };
    },

    async getPublicUrl(path) {
        if (!path) return null;
        const { data } = supabase.storage
            .from(this.BUCKET_NAME)
            .getPublicUrl(path);
        return data.publicUrl;
    },

    async downloadFile(path) {
        const { data, error } = await supabase.storage
            .from(this.BUCKET_NAME)
            .download(path);
        
        if (error) throw error;
        return data;
    },

    async deleteFile(path) {
        const { error } = await supabase.storage
            .from(this.BUCKET_NAME)
            .remove([path]);
        
        if (error) throw error;
        return true;
    }
};

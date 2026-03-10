function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export async function uploadDocumentFile(file) {
    const docBase = {
        id: `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file?.name || 'documento',
        type: file?.type || 'application/octet-stream'
    };

    if (!file) return { ...docBase, base64: '', storagePath: '' };

    const base64 = await fileToBase64(file);
    return {
        ...docBase,
        base64,
        storagePath: ''
    };
}

export async function getDocumentAccessUrl(doc) {
    if (!doc) return null;
    return doc.base64 || null;
}

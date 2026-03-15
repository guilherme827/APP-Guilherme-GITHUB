export function renderStorageUsageCard(container, usageData) {
    const { totalBytes, fileCount, limitBytes = 5 * 1024 * 1024 * 1024 } = usageData; // Default 5GB
    
    const formatSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const percent = Math.min(100, (totalBytes / limitBytes) * 100);
    const isCritical = percent > 90;

    container.innerHTML = `
        <div class="storage-card glass-card" style="padding: 2rem; border-radius: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                <div>
                    <h3 class="font-black" style="font-size: 1.25rem;">Armazenamento</h3>
                    <p class="label-tech" style="color: var(--slate-400);">USO POR ORGANIZAÇÃO</p>
                </div>
                <div style="text-align: right;">
                    <p class="font-black" style="font-size: 1.5rem; color: ${isCritical ? 'var(--rose-500)' : 'var(--primary)'};">${percent.toFixed(1)}%</p>
                    <p class="label-tech" style="font-size: 10px;">DE ${formatSize(limitBytes)}</p>
                </div>
            </div>

            <div class="storage-bar-bg" style="width: 100%; height: 12px; background: var(--slate-100); border-radius: 6px; overflow: hidden; margin-bottom: 1.5rem;">
                <div class="storage-bar-fill" style="width: ${percent}%; height: 100%; background: ${isCritical ? 'var(--rose-500)' : 'var(--primary)'}; transition: width 1s ease-out;"></div>
            </div>

            <div class="grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                <div class="usage-stat">
                    <p class="label-tech" style="margin-bottom: 0.5rem;">ESPAÇO UTILIZADO</p>
                    <p class="font-black" style="font-size: 1.1rem;">${formatSize(totalBytes)}</p>
                </div>
                <div class="usage-stat">
                    <p class="label-tech" style="margin-bottom: 0.5rem;">TOTAL DE ARQUIVOS</p>
                    <p class="font-black" style="font-size: 1.1rem;">${fileCount} itens</p>
                </div>
            </div>

            <div style="margin-top: 2rem; padding: 1.5rem; background: var(--bg-main); border-radius: 16px; border: 1px solid var(--slate-100);">
                <p class="label-tech" style="font-size: 10px; color: var(--slate-500); line-height: 1.5;">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    Este volume de dados é usado como base para o faturamento da organização. Arquivos deletados liberam espaço instantaneamente.
                </p>
            </div>
        </div>
    `;
}

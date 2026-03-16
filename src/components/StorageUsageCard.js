export function renderStorageUsageCard(container, usageData) {
    const {
        totalBytes = 0,
        fileCount = 0,
        breakdown = [],
        limitBytes = 5 * 1024 * 1024 * 1024 // 5 GB padrão
    } = usageData;

    const formatSize = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const totalPercent = Math.min(100, (totalBytes / limitBytes) * 100);
    const isCritical = totalPercent > 90;

    // Barra segmentada: cada categoria ocupa uma fatia proporcional ao seu count
    const totalCount = breakdown.reduce((sum, b) => sum + (b.count || 0), 0);

    const buildSegmentedBar = () => {
        if (!breakdown.length || totalCount === 0) {
            // se não há dados por contagem, usa bytes
            const pct = totalPercent.toFixed(2);
            return `<div style="width:${pct}%;height:100%;background:var(--primary);border-radius:6px;transition:width 1s ease-out;"></div>`;
        }
        return breakdown.map(b => {
            const pct = ((b.count / totalCount) * 100).toFixed(2);
            if (pct <= 0) return '';
            return `<div title="${b.label}: ${b.count} arquivo(s)" style="width:${pct}%;height:100%;background:${b.color};transition:width 1s ease-out;flex-shrink:0;"></div>`;
        }).join('');
    };

    const buildLegend = () => {
        if (!breakdown.length) return '';
        return `
            <div style="display:flex;flex-wrap:wrap;gap:0.75rem 1.5rem;margin-top:1.5rem;">
                ${breakdown.map(b => `
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <div style="width:10px;height:10px;border-radius:3px;background:${b.color};flex-shrink:0;"></div>
                        <span class="label-tech" style="font-size:10px;color:var(--slate-600);">
                            ${b.label}
                        </span>
                        <span style="font-size:11px;font-weight:700;color:var(--slate-800);">
                            ${b.count} arquivo(s)${b.bytes > 0 ? ' · ' + formatSize(b.bytes) : ''}
                        </span>
                    </div>
                `).join('')}
            </div>
        `;
    };

    container.innerHTML = `
        <div class="storage-card glass-card" style="padding: 2rem; border-radius: 24px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <div>
                    <h3 class="font-black" style="font-size:1.25rem;">Armazenamento</h3>
                    <p class="label-tech" style="color:var(--slate-400);">USO POR ORGANIZAÇÃO</p>
                </div>
                <div style="text-align:right;">
                    <p class="font-black" style="font-size:1.5rem;color:${isCritical ? 'var(--rose-500,#f43f5e)' : 'var(--primary)'};">
                        ${totalPercent.toFixed(1)}%
                    </p>
                    <p class="label-tech" style="font-size:10px;">DE ${formatSize(limitBytes)}</p>
                </div>
            </div>

            <!-- Barra geral de uso total -->
            <div style="width:100%;height:12px;background:var(--slate-100);border-radius:6px;overflow:hidden;margin-bottom:0.75rem;">
                <div style="width:${totalPercent}%;height:100%;background:${isCritical ? 'var(--rose-500,#f43f5e)' : 'var(--primary)'};transition:width 1s ease-out;border-radius:6px;"></div>
            </div>
            <p class="label-tech" style="font-size:10px;color:var(--slate-400);margin-bottom:1.5rem;">CAPACIDADE TOTAL UTILIZADA</p>

            <!-- Barra segmentada por categoria -->
            <p class="label-tech" style="font-size:10px;color:var(--slate-500);margin-bottom:0.5rem;">DISTRIBUIÇÃO POR CATEGORIA</p>
            <div style="width:100%;height:16px;background:var(--slate-100);border-radius:8px;overflow:hidden;display:flex;">
                ${buildSegmentedBar()}
            </div>
            ${buildLegend()}

            <!-- Stats gerais -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-top:1.5rem;">
                <div>
                    <p class="label-tech" style="margin-bottom:0.5rem;">ESPAÇO UTILIZADO</p>
                    <p class="font-black" style="font-size:1.1rem;">${formatSize(totalBytes) || '—'}</p>
                </div>
                <div>
                    <p class="label-tech" style="margin-bottom:0.5rem;">TOTAL DE ARQUIVOS</p>
                    <p class="font-black" style="font-size:1.1rem;">${fileCount} itens</p>
                </div>
            </div>

            <div style="margin-top:1.5rem;padding:1.25rem 1.5rem;background:var(--bg-main);border-radius:16px;border:1px solid var(--slate-100);">
                <p class="label-tech" style="font-size:10px;color:var(--slate-500);line-height:1.5;">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    Arquivos na lixeira ainda ocupam espaço. Esvazie a lixeira para liberar armazenamento definitivamente.
                </p>
            </div>
        </div>
    `;
}

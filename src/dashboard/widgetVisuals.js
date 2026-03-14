export function iconMoreDots() {
    return `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="6.5" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="17.5" r="1.5" fill="currentColor"/>
        </svg>
    `;
}

export function iconPlusWidget() {
    return `
        <svg width="22" height="18" viewBox="0 0 28 24" fill="none" aria-hidden="true">
            <rect x="2.5" y="3" width="6.5" height="6.5" stroke="currentColor" stroke-width="2"/>
            <rect x="11.75" y="3" width="6.5" height="6.5" stroke="currentColor" stroke-width="2"/>
            <rect x="11.75" y="12.25" width="6.5" height="6.5" stroke="currentColor" stroke-width="2"/>
            <rect x="2.5" y="12.25" width="6.5" height="6.5" stroke="currentColor" stroke-width="2"/>
            <path d="M23 8.5v7" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
            <path d="M19.5 12h7" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
        </svg>
    `;
}

export function renderWidgetTypePreview(type) {
    if (type === 'resumo') {
        return `
            <span class="widget-type-preview widget-type-preview--summary">
                <span class="widget-type-preview-kicker"></span>
                <span class="widget-type-preview-grid">
                    <span></span>
                    <span></span>
                    <span class="is-wide"></span>
                </span>
            </span>
        `;
    }

    if (type === 'relogio') {
        return `
            <span class="widget-type-preview widget-type-preview--clock">
                <span class="widget-type-preview-clock-face"></span>
                <span class="widget-type-preview-clock-hand is-hour"></span>
                <span class="widget-type-preview-clock-hand is-minute"></span>
            </span>
        `;
    }

    if (type === 'calendario') {
        return `
            <span class="widget-type-preview widget-type-preview--calendar">
                <span class="widget-type-preview-calendar-head"></span>
                <span class="widget-type-preview-calendar-grid">
                    <i></i><i></i><i></i><i></i><i></i><i></i><i></i>
                    <i></i><i></i><i></i><i></i><i></i><i></i><i class="is-today"></i>
                </span>
            </span>
        `;
    }

    if (type === 'meta_mes') {
        return `
            <span class="widget-type-preview widget-type-preview--goal">
                <span class="widget-type-preview-goal-kicker"></span>
                <span class="widget-type-preview-goal-value"></span>
                <span class="widget-type-preview-goal-copy"></span>
            </span>
        `;
    }

    if (type === 'pauta') {
        return `
            <span class="widget-type-preview widget-type-preview--tasks">
                <span class="widget-type-preview-row"><i></i><span></span><strong></strong></span>
                <span class="widget-type-preview-row"><i></i><span></span><strong></strong></span>
                <span class="widget-type-preview-row"><i></i><span></span><strong></strong></span>
            </span>
        `;
    }

    if (type === 'lista') {
        return `
            <span class="widget-type-preview widget-type-preview--list">
                <span class="widget-type-preview-row"><i></i><span></span></span>
                <span class="widget-type-preview-row"><i></i><span></span></span>
                <span class="widget-type-preview-row"><i></i><span></span></span>
            </span>
        `;
    }

    return '';
}

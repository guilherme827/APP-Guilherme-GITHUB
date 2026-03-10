const THEME_OPTIONS = [
    {
        id: 'light',
        title: 'Claro',
        description: 'Visual limpo com foco em contraste suave.'
    },
    {
        id: 'dark',
        title: 'Escuro',
        description: 'Interface noturna para reduzir brilho e fadiga.'
    },
    {
        id: 'ocean',
        title: 'Oceano',
        description: 'Tons azul-petróleo com destaque frio e profissional.'
    },
    {
        id: 'sunset',
        title: 'Sunset',
        description: 'Paleta quente com laranja e coral para alto destaque.'
    }
];

export function renderSettings(container, currentTheme, onThemeChange) {
    const persistenceLabel = 'Modo Local com Mock Data';
    const persistenceDescription = 'O app esta rodando sem integracoes externas. Os dados exibidos sao locais e servem para restaurar o fluxo visual no localhost.';

    container.innerHTML = `
        <div class="glass-card animate-fade-in" style="max-width: 900px; margin: 0 auto;">
            <div style="margin-bottom: 1.5rem;">
                <p class="label-tech">PERSONALIZACAO</p>
                <h2 class="font-black" style="font-size: 1.5rem; margin-top: 0.25rem;">Tema da Interface</h2>
                <p style="color: var(--slate-500); margin-top: 0.5rem;">Selecione o visual que melhor combina com seu fluxo de trabalho.</p>
            </div>

            <div style="margin-bottom: 1.5rem; padding: 1rem 1.25rem; border-radius: 20px; background: var(--bg-main); border: 1px solid var(--slate-200);">
                <p class="label-tech">ARMAZENAMENTO</p>
                <p class="font-black" style="font-size: 1rem; margin-top: 0.35rem;">${persistenceLabel}</p>
                <p style="color: var(--slate-500); margin-top: 0.35rem; line-height: 1.6;">${persistenceDescription}</p>
            </div>

            <div class="theme-grid">
                ${THEME_OPTIONS.map((theme) => `
                    <button
                        type="button"
                        class="theme-option ${theme.id === currentTheme ? 'is-active' : ''}"
                        data-theme-id="${theme.id}"
                    >
                        <div class="theme-preview theme-preview-${theme.id}"></div>
                        <div style="text-align: left;">
                            <p class="font-black" style="font-size: 1rem;">${theme.title}</p>
                            <p class="label-tech" style="margin-top: 0.25rem; line-height: 1.4; text-transform: none; letter-spacing: 0.03em;">${theme.description}</p>
                        </div>
                    </button>
                `).join('')}
            </div>
        </div>
    `;

    container.querySelectorAll('[data-theme-id]').forEach((button) => {
        button.addEventListener('click', () => {
            const selectedTheme = button.dataset.themeId;
            if (!selectedTheme || selectedTheme === currentTheme) {
                return;
            }

            onThemeChange(selectedTheme);
            renderSettings(container, selectedTheme, onThemeChange);
        });
    });
}

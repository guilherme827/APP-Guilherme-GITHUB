// DataTable Component (Premium Refactor)
export function renderDataTable(container, data) {
    const tableHTML = `
        <div class="table-container animate-fade-in">
            <table class="premium-table">
                <thead>
                    <tr>
                        <th class="label-tech">REFERÊNCIA</th>
                        <th class="label-tech">DESCRITIVO</th>
                        <th class="label-tech">STATUS</th>
                        <th class="label-tech">DATA</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(item => `
                        <tr>
                            <td class="ref-cell font-black">#${item.id}</td>
                            <td class="name-cell">${item.name}</td>
                            <td><span class="badge ${item.status.toLowerCase()}">${item.status}</span></td>
                            <td class="date-cell">${item.date}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <style>
            .premium-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 1rem;
            }

            .premium-table th {
                text-align: left;
                padding: 1.5rem 1rem;
                border-bottom: 1px solid var(--slate-200);
            }

            .premium-table td {
                padding: 1.5rem 1rem;
                border-bottom: 1px solid var(--slate-200);
                font-size: 0.95rem;
                color: var(--slate-900);
            }

            .premium-table tr:last-child td {
                border-bottom: none;
            }

            .ref-cell { color: var(--slate-950); font-size: 0.85rem; }
            .name-cell { font-weight: 600; }
            .date-cell { color: var(--slate-400); font-size: 0.85rem; }

            .badge {
                padding: 0.4rem 1rem;
                border-radius: 9999px;
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .badge.concluído { background: #ECFDF5; color: #059669; }
            .badge.pendente { background: #FFFBEB; color: #D97706; }
            .badge.processando { background: #EFF6FF; color: #2563EB; }

            .premium-table tr {
                transition: var(--transition);
            }

            .premium-table tr:hover td {
                background: #F8FAFC;
            }
        </style>
    `;
    container.innerHTML = tableHTML;
}

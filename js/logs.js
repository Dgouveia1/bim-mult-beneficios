import { _supabase } from './supabase.js';

/**
 * Carrega os dados de log do Supabase e os renderiza na tabela.
 */
async function loadLogsData() {
    const tableBody = document.getElementById('logsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="4">Carregando logs...</td></tr>';

    try {
        const { data: logs, error } = await _supabase
            .from('action_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200); // Limita aos 200 logs mais recentes para performance

        if (error) throw error;

        if (logs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Nenhum registro de log encontrado.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        logs.forEach(log => {
            const row = document.createElement('tr');
            const formattedDate = new Date(log.created_at).toLocaleString('pt-BR');
            const detailsString = JSON.stringify(log.details, null, 2);

            row.innerHTML = `
                <td data-label="Data">${formattedDate}</td>
                <td data-label="Usuário">${log.user_email || 'N/A'}</td>
                <td data-label="Ação"><span class="log-action">${log.action}</span></td>
                <td data-label="Detalhes"><pre><code>${detailsString}</code></pre></td>
            `;
            tableBody.appendChild(row);
        });

    } catch (error) {
        console.error('Erro ao carregar logs:', error);
        tableBody.innerHTML = `<tr><td colspan="4" style="color:red;">Erro ao carregar os logs: ${error.message}</td></tr>`;
    }
}

export { loadLogsData };

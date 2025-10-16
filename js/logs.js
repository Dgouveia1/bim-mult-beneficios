import { _supabase } from './supabase.js';

/**
 * Exibe a mensagem inicial na página de logs, instruindo o usuário a selecionar um período.
 */
function setupLogsPage() {
    const tableBody = document.getElementById('logsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4">Por favor, selecione um período no filtro acima para carregar os logs.</td></tr>';
}


/**
 * Carrega os dados de log do Supabase e os renderiza na tabela, com base em um filtro de data obrigatório.
 * @param {string} startDate - Data de início no formato YYYY-MM-DD.
 * @param {string} endDate - Data de fim no formato YYYY-MM-DD.
 */
async function loadLogsData(startDate, endDate) {
    const tableBody = document.getElementById('logsTableBody');
    if (!tableBody) return;

    // Validação para garantir que ambas as datas foram fornecidas
    if (!startDate || !endDate) {
        alert('Por favor, selecione a data de início e a data de fim para filtrar.');
        return;
    }

    tableBody.innerHTML = '<tr><td colspan="4">Carregando logs...</td></tr>';

    try {
        let query = _supabase
            .from('action_logs')
            .select('*')
            .order('created_at', { ascending: false });

        // Adiciona filtros de data à query
        query = query.gte('created_at', `${startDate}T00:00:00`);
        query = query.lte('created_at', `${endDate}T23:59:59`);
        
        const { data: logs, error } = await query;

        if (error) throw error;

        if (logs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Nenhum registro de log encontrado para o período selecionado.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        logs.forEach(log => {
            const row = document.createElement('tr');
            const formattedDate = new Date(log.created_at).toLocaleString('pt-BR');
            // Formata o JSON para melhor visualização
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

export { loadLogsData, setupLogsPage };

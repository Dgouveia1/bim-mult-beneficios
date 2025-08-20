import { _supabase } from './supabase.js';

/**
 * Lida com o envio do formulário de exportação.
 * Coleta os filtros, busca os dados no Supabase e gera um arquivo CSV.
 * @param {Event} event - O evento de submit do formulário.
 */
async function handleGenerateCSV(event) {
    event.preventDefault();
    const submitButton = event.target.querySelector('button[type="submit"]');
    const resultDiv = document.getElementById('exportResult');
    
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
    resultDiv.textContent = '';

    try {
        // 1. Coletar valores dos filtros
        const plano = document.getElementById('filterPlano').value;
        const status = document.getElementById('filterStatus').value;
        const sexo = document.getElementById('filterSexo').value;
        const idadeMin = parseInt(document.getElementById('filterIdadeMin').value, 10);
        const idadeMax = parseInt(document.getElementById('filterIdadeMax').value, 10);
        const apenasTitular = document.getElementById('filterApenasTitular').checked;

        // 2. Construir a query no Supabase
        let query = _supabase.from('clients').select('*, dependents(*)');
        
        // CORREÇÃO: Usa 'eq' para correspondência exata do dropdown
        if (plano) query = query.eq('plano', plano);
        if (status) query = query.eq('status', status);
        if (sexo) query = query.eq('sexo', sexo);

        // =================================================================
        //  DEBUG: Mostra a query que será executada no console do navegador
        // =================================================================
        console.log("Query Supabase sendo executada:", query);
        // =================================================================

        const { data: clients, error } = await query;
        if (error) throw error;

        // 3. Processar e filtrar os dados (lógica de idade e dependentes)
        const finalContacts = [];
        const currentYear = new Date().getFullYear();

        const processPerson = (person, clientData) => {
            if (person.data_nascimento) {
                const birthYearParts = person.data_nascimento.split(/[\/-]/);
                const birthYear = parseInt(birthYearParts[birthYearParts.length - 1], 10);
                if (birthYear > 1000) { // Validação simples do ano
                    const age = currentYear - birthYear;
                    if ((!isNaN(idadeMin) && age < idadeMin) || (!isNaN(idadeMax) && age > idadeMax)) {
                        return; 
                    }
                }
            } else if (!isNaN(idadeMin) || !isNaN(idadeMax)) {
                 return;
            }

            if (person.telefone) {
                finalContacts.push({
                    nome: `${person.nome || ''} ${person.sobrenome || ''}`.trim(),
                    telefone: person.telefone.replace(/\D/g, '')
                });
            }
        };

        clients.forEach(client => {
            processPerson(client);
            if (!apenasTitular && client.dependents) {
                client.dependents.forEach(dependent => {
                    let dependentMatches = true;
                    if (sexo && dependent.sexo !== sexo) dependentMatches = false;
                    
                    if(dependentMatches) processPerson(dependent);
                });
            }
        });
        
        if (finalContacts.length === 0) {
            resultDiv.textContent = 'Nenhum contato encontrado com os filtros selecionados.';
            return;
        }

        // 4. Gerar e baixar o arquivo CSV
        downloadCSV(finalContacts);
        resultDiv.textContent = `${finalContacts.length} contatos exportados com sucesso!`;

    } catch (error) {
        resultDiv.textContent = `Erro ao gerar arquivo: ${error.message}`;
        console.error(error);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-file-csv"></i> Gerar Arquivo CSV';
    }
}

/**
 * Converte um array de objetos em um arquivo CSV e inicia o download.
 * @param {Array<Object>} data - Os dados a serem convertidos.
 */
function downloadCSV(data) {
    const csvRows = [];
    const headers = ['Nome', 'Telefone'];
    csvRows.push(headers.join(','));

    for (const row of data) {
        const values = headers.map(header => row[header.toLowerCase()]);
        csvRows.push(values.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'contatos_exportados.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}


export { handleGenerateCSV };
import { _supabase } from './supabase.js';

/**
 * Lida com o envio do formulário de exportação.
 * Coleta os filtros, busca os dados no Supabase e gera um arquivo CSV.
 * @param {Event} event - O evento de submit do formulário.
 */
async function handleGenerateCSV(event) {
    event.preventDefault();
    
    // Verificar se os elementos existem antes de acessá-los
    const submitButton = event.target.querySelector('button[type="submit"]');
    const resultDiv = document.getElementById('exportResult');
    
    if (!submitButton || !resultDiv) {
        console.error('Elementos do formulário não encontrados!');
        return;
    }
    
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
    resultDiv.textContent = '';

    try {
        // 1. Coletar valores dos filtros - verificar se cada elemento existe
        const filterPlano = document.getElementById('filterPlano');
        const filterStatus = document.getElementById('filterStatus');
        const filterSexo = document.getElementById('filterSexo');
        const filterIdadeMin = document.getElementById('filterIdadeMin');
        const filterIdadeMax = document.getElementById('filterIdadeMax');
        const filterApenasTitular = document.getElementById('filterApenasTitular');
        const filterMunicipio = document.getElementById('filterMunicipio');
        
        if (!filterPlano || !filterStatus || !filterSexo || !filterIdadeMin || 
            !filterIdadeMax || !filterApenasTitular || !filterMunicipio) {
            throw new Error('Elementos de filtro não encontrados no DOM');
        }

        const plano = filterPlano.value;
        const status = filterStatus.value;
        const sexo = filterSexo.value;
        const idadeMin = parseInt(filterIdadeMin.value, 10);
        const idadeMax = parseInt(filterIdadeMax.value, 10);
        const apenasTitular = filterApenasTitular.checked;
        const municipio = filterMunicipio.value;

        // 2. Construir a query no Supabase
        let query = _supabase.from('clients').select('*, dependents(*)');
        
        // Aplicar filtros na query do Supabase
        if (plano) query = query.eq('plano', plano);
        if (status) query = query.eq('status', status);
        if (sexo) query = query.eq('sexo', sexo);
        if (municipio && municipio !== '') query = query.eq('municipio', municipio);

        console.log("Query Supabase sendo executada:", query);

        const { data: clients, error } = await query;
        if (error) throw error;

        // 3. Processar e filtrar os dados (lógica de idade e dependentes)
        const finalContacts = [];
        const currentYear = new Date().getFullYear();

        const processPerson = (person, clientData) => {
            // Filtro de idade
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

            // Filtro de telefone
            if (person.telefone) {
                finalContacts.push({
                    nome: `${person.nome || ''} ${person.sobrenome || ''}`.trim(),
                    telefone: '55' + person.telefone.replace(/\D/g, '')
                });
            }
        };

        clients.forEach(client => {
            // O filtro de município já foi aplicado na query, então todos os clients já estão filtrados
            processPerson(client);
            
            if (!apenasTitular && client.dependents) {
                client.dependents.forEach(dependent => {
                    let dependentMatches = true;
                    
                    // Aplicar filtro de sexo nos dependentes (já que não foi aplicado na query)
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

/**
 * Carrega os municípios do banco de dados para preencher o filtro
 */
async function loadMunicipios() {
    try {
        const selectElement = document.getElementById('filterMunicipio');
        if (!selectElement) {
            console.warn('Elemento filterMunicipio não encontrado no DOM');
            return;
        }

        const { data, error } = await _supabase
            .from('clients')
            .select('municipio')
            .not('municipio', 'is', null)
            .order('municipio');

        if (error) throw error;

        // Extrair municípios únicos
        const municipiosUnicos = [...new Set(data.map(item => item.municipio))].filter(Boolean);
        
        // Limpar opções existentes (exceto a primeira)
        while (selectElement.options.length > 1) {
            selectElement.remove(1);
        }
        
        // Adicionar opções ao select
        municipiosUnicos.forEach(municipio => {
            const option = document.createElement('option');
            option.value = municipio;
            option.textContent = municipio;
            selectElement.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar municípios:', error);
    }
}


export { handleGenerateCSV, loadMunicipios };
import { _supabase } from './supabase.js';
import { validateCPF, validateEmail, validatePhone } from './utils.js';
import { logAction } from './logger.js';
import { showToast } from './utils.js';
// NOVO: Importar para pegar o usuário logado
import { getCurrentUserProfile } from './auth.js';
// IMPORTAÇÃO DA FUNÇÃO DE CONTRATO
import { generateContractPDF } from './vendas.js';

// --- ELEMENTOS DO DOM ---
const clientsTableBody = document.getElementById('clientsTableBody');
const newClientModal = document.getElementById('newClientModal');
const detailsClientModal = document.getElementById('detailsClientModal');
const dependentesContainer = document.getElementById('dependentesContainer');
const detailsDependentesContainer = document.getElementById('detailsDependentesContainer');
let dependenteCount = 0;
let dependenteDetailsCount = 0;

// --- VARIÁVEL GLOBAL PARA ARMAZENAR TODAS AS PESSOAS (TITULARES E DEPENDENTES) ---
let allPeople = [];

function formatDateForSupabase(dateString) {
    if (!dateString || !dateString.includes('/')) return null;
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;
    // Garante que o ano tenha 4 dígitos
    let year = parts[2];
    if (year.length === 2) {
        year = parseInt(year) > 50 ? `19${year}` : `20${year}`; // Ajuste simples para anos de 2 dígitos
    }
    return `${year}-${parts[1]}-${parts[0]}`;
}

function formatDateForInput(dateString) {
    if (!dateString || !dateString.includes('-')) return '';
    const parts = dateString.split('-'); // Formato YYYY-MM-DD
    if (parts.length !== 3) return '';
    return `${parts[2]}/${parts[1]}/${parts[0]}`; // Formato DD/MM/YYYY
}


// --- FUNÇÕES DE CRIAÇÃO ---

function addDependenteField(container, counterVar) {
    if (window[counterVar] >= 6) {
        showToast("É permitido no máximo 6 dependentes.");
        return;
    }
    window[counterVar]++;
    const id = window[counterVar];

    const html = `
        <div class="dependente-form-group" data-dependente-new-id="${id}">
            <hr>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4>Novo Dependente ${id}</h4>
                <button type="button" class="btn btn-danger btn-small remove-dependente-btn">Remover</button>
            </div>
            <div class="form-row">
                <input type="hidden" name="dependente_novo_${id}" value="true">
                <div class="form-group"><label>Nome</label><input type="text" name="dependente_nome_${id}" required></div>
                <div class="form-group"><label>Sobrenome</label><input type="text" name="dependente_sobrenome_${id}" required></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>CPF</label><input type="text" name="dependente_cpf_${id}" maxlength="14"></div>
                <div class="form-group"><label>Telefone</label><input type="text" name="dependente_telefone_${id}" maxlength="15"></div>
            </div>
            <!-- CORREÇÃO (Ponto 1): Adicionando data de nascimento para dependentes -->
            <div class="form-row">
                <div class="form-group"><label>Data de Nascimento</label><input type="text" name="dependente_data_nascimento_${id}" placeholder="dd/mm/aaaa"></div>
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', html);
}

// --- FUNÇÕES DE LEITURA, RENDERIZAÇÃO E FILTRO ---

async function loadClientsData(searchTerm = null) {
    if (!clientsTableBody) return;
    clientsTableBody.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';
    try {
        let finalClients = [];

        // Se um termo de busca com pelo menos 3 caracteres for fornecido, executa a busca no servidor
        if (searchTerm && searchTerm.length >= 3) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            // CORREÇÃO (Ponto 2): Divide o termo de busca em palavras
            const searchWords = lowerSearchTerm.split(' ').filter(w => w.length > 0);

            // --- Query de Clientes ---
            let clientQuery = _supabase.from('clients').select('id');
            // Constrói um filtro AND para cada palavra no nome/sobrenome
            const clientNameFilter = searchWords.map(word => `or(nome.ilike.%${word}%,sobrenome.ilike.%${word}%)`).join(',');
            // Constrói um filtro OR para CPF/Telefone (usando o termo completo)
            const clientOrFilters = `and(${clientNameFilter}),cpf.ilike.%${lowerSearchTerm}%,telefone.ilike.%${lowerSearchTerm}%`;
            clientQuery = clientQuery.or(clientOrFilters);

            // --- Query de Dependentes ---
            let dependentQuery = _supabase.from('dependents').select('titular_id');
            const dependentNameFilter = searchWords.map(word => `or(nome.ilike.%${word}%,sobrenome.ilike.%${word}%)`).join(',');
            // Constrói um filtro OR para CPF (usando o termo completo)
            const dependentOrFilters = `and(${dependentNameFilter}),cpf.ilike.%${lowerSearchTerm}%`;
            dependentQuery = dependentQuery.or(dependentOrFilters);
            
            // Executa ambas as queries em paralelo
            const [clientResults, dependentResults] = await Promise.all([
                clientQuery,
                dependentQuery
            ]);

            if (clientResults.error) throw clientResults.error;
            if (dependentResults.error) throw dependentResults.error;

            // Combina os IDs dos titulares encontrados
            const clientIdsFromDirectMatch = clientResults.data.map(c => c.id);
            const clientIdsFromDependentMatch = dependentResults.data.map(d => d.titular_id);
            const allMatchingClientIds = [...new Set([...clientIdsFromDirectMatch, ...clientIdsFromDependentMatch])];

            // Busca os dados completos dos clientes correspondentes
            if (allMatchingClientIds.length > 0) {
                const { data: clients, error: clientsError } = await _supabase
                    .from('clients')
                    .select('*, dependents(*)')
                    .in('id', allMatchingClientIds)
                    .order('created_at', { ascending: false });
                
                if (clientsError) throw clientsError;
                finalClients = clients;
            }
        } else {
            // Carregamento inicial: busca os 25 clientes mais recentes
            const { data: clients, error } = await _supabase
                .from('clients')
                .select('*, dependents(*)')
                .order('created_at', { ascending: false })
                .limit(25);
            if (error) throw error;
            finalClients = clients;
        }

        // Processa os clientes para a lista de exibição
        const peopleList = [];
        finalClients.forEach(client => {
            peopleList.push({
                titular_id: client.id,
                nome: `${client.nome || ''} ${client.sobrenome || ''}`.trim(),
                cpf: client.cpf,
                telefone: client.telefone,
                plano: client.plano,
                status: client.status,
                tipo: 'Titular'
            });

            if (client.dependents) {
                client.dependents.forEach(dep => {
                    peopleList.push({
                        titular_id: client.id,
                        nome: `${dep.nome || ''} ${dep.sobrenome || ''}`.trim(),
                        cpf: dep.cpf,
                        telefone: dep.telefone || client.telefone, // Pega o tel do dependente, se não tiver, usa o do titular
                        plano: client.plano,
                        status: client.status,
                        tipo: 'Dependente'
                    });
                });
            }
        });

        allPeople = peopleList; // Atualiza a variável global
        renderClientsTable(allPeople);

    } catch (error) {
        clientsTableBody.innerHTML = `<tr><td colspan="6" style="color:red;">Erro ao carregar os dados: ${error.message}</td></tr>`;
        allPeople = [];
    }
}


function renderClientsTable(people) {
    if (!clientsTableBody) return;
    clientsTableBody.innerHTML = '';
    
    document.getElementById('resultsCount').textContent = people.length;
    // CORREÇÃO (Ponto 4): A contagem total não é mais relevante da mesma forma
    // Vamos mostrar o total de resultados *encontrados*
    document.getElementById('totalResults').textContent = people.length;

    if (people.length === 0) {
        clientsTableBody.innerHTML = '<tr><td colspan="6">Nenhuma pessoa encontrada.</td></tr>';
        return;
    }

    people.forEach(person => {
        const row = document.createElement('tr');
        
        // --- LÓGICA DO BOTÃO WHATSAPP ---
        const phone = person.telefone;
        const cleanedPhone = phone ? phone.replace(/\D/g, '') : '';
        let whatsappButton = '';

        // Verifica se o telefone limpo tem 10 (fixo+ddd) ou 11 (celular+ddd) dígitos
        if (cleanedPhone && (cleanedPhone.length === 10 || cleanedPhone.length === 11)) {
            const whatsappLink = `https://wa.me/55${cleanedPhone}`;
            // Adiciona um botão verde (btn-success) com o ícone do WhatsApp
            whatsappButton = `
                <a href="${whatsappLink}" target="_blank" class="btn btn-success btn-small whatsapp-btn" title="Abrir WhatsApp" style="padding: 8px 10px; font-size: 14px; line-height: 1;">
                    <i class="fab fa-whatsapp"></i>
                </a>
            `;
        }
        // --- FIM DA LÓGICA WHATSAPP ---

        // --- NOVO: BOTÃO DE CONTRATO (Apenas para titulares) ---
        let contractButton = '';
        if (person.tipo === 'Titular') {
            contractButton = `
                <button class="btn btn-secondary btn-small generate-contract-btn" data-titular-id="${person.titular_id}" title="Gerar Contrato" style="padding: 8px 10px; font-size: 14px; line-height: 1;">
                    <i class="fas fa-file-contract"></i>
                </button>
            `;
        }

        // --- NOVO: BOTÃO DE CARNÊ (Regra: Apenas Titular e Plano Bim Familiar) ---
        let financeButton = '';
        if (person.tipo === 'Titular' && person.plano === 'Bim Familiar') {
            // Usamos data-cpf para buscar o financeiro
            financeButton = `
                <button class="btn btn-primary btn-small emit-carne-btn" data-cpf="${person.cpf}" data-name="${person.nome}" title="Ver Financeiro / Emitir Carnê" style="padding: 8px 10px; font-size: 14px; line-height: 1; background-color: var(--secondary-dark);">
                    <i class="fas fa-dollar-sign"></i>
                </button>
            `;
        }

        row.innerHTML = `
            <td data-label="Nome">${person.nome || 'N/A'} (${person.tipo})</td>
            <td data-label="CPF">${person.cpf || 'N/A'}</td>
            <td data-label="Telefone">${person.telefone || 'N/A'}</td>
            <td data-label="Plano">${person.plano || 'N/A'}</td>
            <td data-label="Status"><span class="status status-${person.status === 'ATIVO' ? 'active' : 'inactive'}">${person.status}</span></td>
            <td class="actions" style="display: flex; gap: 8px; align-items: center;">
                <button class="btn btn-secondary btn-small view-details-btn" data-titular-id="${person.titular_id}">Ver Detalhes</button>
                ${contractButton}
                ${financeButton}
                ${whatsappButton} 
            </td>
        `;
        clientsTableBody.appendChild(row);
    });
}

// Esta função agora é local, pois a busca é feita no servidor
function filterAndRenderClients() {
    const searchTerm = document.getElementById('clientsSearchInput').value;
    // Dispara a busca no servidor
    loadClientsData(searchTerm);
}

// --- FUNÇÃO PARA GERAR O CONTRATO NOVAMENTE ---
async function handleGenerateContract(titularId) {
    // Busca o botão específico para mostrar feedback visual
    const btn = document.querySelector(`.generate-contract-btn[data-titular-id="${titularId}"]`);
    const originalContent = btn ? btn.innerHTML : '';
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        // Busca os dados completos do cliente e dependentes
        const { data: client, error: clientError } = await _supabase
            .from('clients')
            .select('*, dependents(*)')
            .eq('id', titularId)
            .single();

        if (clientError) throw clientError;

        // Garante que dependentes é um array
        const dependents = client.dependents || [];

        // Chama a função importada de vendas.js
        await generateContractPDF(client, dependents);
        
        showToast('Contrato gerado com sucesso!');

    } catch (error) {
        console.error(error);
        showToast('Erro ao gerar contrato: ' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}

// --- FUNÇÕES DE SUBMISSÃO (CREATE/UPDATE) ---

async function handleNewClientSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');

    const titularFormData = new FormData(form);
    const titularFormProps = Object.fromEntries(titularFormData);
    
    if (titularFormProps.cpf && !validateCPF(titularFormProps.cpf)) {
        showToast('O CPF do titular é inválido!');
        return;
    }
    if (titularFormProps.email && !validateEmail(titularFormProps.email)) {
        showToast('O Email do titular é inválido!');
        return;
    }
     if (titularFormProps.telefone && !validatePhone(titularFormProps.telefone)) {
        showToast('O Telefone do titular parece inválido! Deve ter 10 ou 11 dígitos.');
        return;
    }

    // ALTERAÇÃO: Clientes criados fora da aba de vendas recebem tag específica
    // Em vez de usar o nome do usuário logado, usamos 'fora_aba_vendas'
    const vendedorName = 'fora_aba_vendas';

    const titularData = {
        nome: titularFormProps.nome,
        sobrenome: titularFormProps.sobrenome,
        telefone: titularFormProps.telefone,
        cpf: titularFormProps.cpf,
        email: titularFormProps.email,
        data_nascimento: titularFormProps.data_nascimento,
        plano: titularFormProps.plano,
        status: titularFormProps.status,
        cep: titularFormProps.cep,
        endereco: titularFormProps.endereco,
        municipio: titularFormProps.municipio,
        observacao: titularFormProps.observacao,
        vendedor: vendedorName // Campo alterado para tag fixa
    };
    
    const dependentesData = [];
    const dependenteGroups = form.querySelectorAll('.dependente-form-group');

    for (const group of dependenteGroups) {
        const id = group.dataset.dependenteNewId;
        const dependente = {
            nome: group.querySelector(`[name="dependente_nome_${id}"]`).value,
            sobrenome: group.querySelector(`[name="dependente_sobrenome_${id}"]`).value,
            cpf: group.querySelector(`[name="dependente_cpf_${id}"]`).value,
            telefone: group.querySelector(`[name="dependente_telefone_${id}"]`).value,
            // CORREÇÃO (Ponto 1): Capturando data de nascimento
            data_nascimento: group.querySelector(`[name="dependente_data_nascimento_${id}"]`).value,
        };

        if (dependente.cpf && !validateCPF(dependente.cpf)) {
            showToast(`O CPF do dependente ${dependente.nome} é inválido!`);
            return;
        }
        if (dependente.telefone && !validatePhone(dependente.telefone)) {
            showToast(`O Telefone do dependente ${dependente.nome} parece inválido!`);
            return;
        }
        dependentesData.push(dependente);
    }
    
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    
    titularData.data_nascimento = formatDateForSupabase(titularData.data_nascimento);

    try {
        const { data: newTitular, error: titularError } = await _supabase
            .from('clients')
            .insert(titularData)
            .select()
            .single();

        if (titularError) throw titularError;
        
        await logAction('CREATE_CLIENT', { clientId: newTitular.id, clientName: `${newTitular.nome} ${newTitular.sobrenome}`, vendedor: vendedorName });

        const titularId = newTitular.id;

        if (dependentesData.length > 0) {
            const dependentesParaSalvar = dependentesData.map(dep => {
                return { 
                    ...dep, 
                    titular_id: titularId,
                    // CORREÇÃO (Ponto 1): Formatando data de nascimento do dependente
                    data_nascimento: formatDateForSupabase(dep.data_nascimento)
                };
            });

            const { error: dependentesError } = await _supabase
                .from('dependents')
                .insert(dependentesParaSalvar);

            if (dependentesError) throw dependentesError;
        }

        showToast('Cliente e dependentes cadastrados com sucesso!');
        closeModal(newClientModal);
        form.reset();
        document.getElementById('dependentesContainer').innerHTML = '';
        dependenteCount = 0;
        loadClientsData(); // Recarrega os dados

    } catch (error) {
        showToast('Erro ao salvar cliente: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Salvar';
    }
}


// --- FUNÇÕES DE DETALHES E ATUALIZAÇÃO ---

async function openDetailsModal(clientId) {
    const form = document.getElementById('detailsClientForm');
    form.reset();
    detailsDependentesContainer.innerHTML = '';
    dependenteDetailsCount = 0;

    try {
        const { data: client, error: clientError } = await _supabase.from('clients').select('*').eq('id', clientId).single();
        if (clientError) throw clientError;

        const { data: dependents, error: dependentsError } = await _supabase.from('dependents').select('*').eq('titular_id', clientId);
        if (dependentsError) throw dependentsError;

        populateDetailsForm(client, dependents);
        openModal(detailsClientModal);
    } catch (error) {
        showToast('Não foi possível carregar os detalhes do cliente.');
    }
}

function populateDetailsForm(client, dependents) {
    document.getElementById('detailsClientId').value = client.id;
    document.getElementById('details_nome').value = client.nome || '';
    document.getElementById('details_sobrenome').value = client.sobrenome || '';
    document.getElementById('details_telefone').value = client.telefone || '';
    document.getElementById('details_cpf').value = client.cpf || '';
    document.getElementById('details_email').value = client.email || '';
    // CORREÇÃO: Formata data do titular
    document.getElementById('details_data_nascimento').value = formatDateForInput(client.data_nascimento);
    
    document.getElementById('details_plano').value = client.plano || '';
    document.getElementById('details_status').value = client.status || 'ATIVO';
    document.getElementById('details_cep').value = client.cep || '';
    document.getElementById('details_endereco').value = client.endereco || '';
    document.getElementById('details_municipio').value = client.municipio || '';
    document.getElementById('details_observacao').value = client.observacao || '';
    
    if (dependents && dependents.length > 0) {
        dependents.forEach(dep => {
            // CORREÇÃO (Ponto 1): Formata data de nascimento do dependente
            const dataNascimentoFormatada = formatDateForInput(dep.data_nascimento);

            const depHTML = `
                <div class="dependente-form-group" data-dependente-id="${dep.id}">
                    <hr>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h4>Dependente</h4>
                        <button type="button" class="btn btn-danger btn-small remove-dependente-btn">Remover</button>
                    </div>
                    <div class="form-row">
                        <input type="hidden" name="dependente_id_${dep.id}" value="${dep.id}">
                        <div class="form-group"><label>Nome</label><input type="text" name="dependente_nome_${dep.id}" value="${dep.nome || ''}"></div>
                        <div class="form-group"><label>Sobrenome</label><input type="text" name="dependente_sobrenome_${dep.id}" value="${dep.sobrenome || ''}"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>CPF</label><input type="text" name="dependente_cpf_${dep.id}" value="${dep.cpf || ''}" maxlength="14"></div>
                        <div class="form-group"><label>Telefone</label><input type="text" name="dependente_telefone_${dep.id}" value="${dep.telefone || ''}" maxlength="15"></div>
                    </div>
                    <!-- CORREÇÃO (Ponto 1): Adiciona campo de data de nascimento preenchido -->
                    <div class="form-row">
                         <div class="form-group"><label>Data de Nascimento</label><input type="text" name="dependente_data_nascimento_${dep.id}" value="${dataNascimentoFormatada}" placeholder="dd/mm/aaaa"></div>
                    </div>
                </div>`;
            detailsDependentesContainer.insertAdjacentHTML('beforeend', depHTML);
        });
        dependenteDetailsCount = dependents.length;
    }
}

async function handleUpdateClient(event) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');

    const formData = new FormData(form);
    const formProps = Object.fromEntries(formData);
    
    // CORREÇÃO: Validação usando os 'name' corretos
    if (formProps.details_cpf && !validateCPF(formProps.details_cpf)) {
        showToast('O CPF do titular é inválido!');
        return;
    }
    if (formProps.details_email && !validateEmail(formProps.details_email)) {
        showToast('O Email do titular é inválido!');
        return;
    }
     if (formProps.details_telefone && !validatePhone(formProps.details_telefone)) {
        showToast('O Telefone do titular parece inválido! Deve ter 10 ou 11 dígitos.');
        return;
    }
    
    const titularId = formProps.id;
    const titularData = {
        // CORREÇÃO: Lendo os 'name' corretos do formProps
        nome: formProps.details_nome,
        sobrenome: formProps.details_sobrenome,
        telefone: formProps.details_telefone,
        cpf: formProps.details_cpf,
        email: formProps.details_email,
        data_nascimento: formatDateForSupabase(formProps.details_data_nascimento),
        plano: formProps.details_plano,
        status: formProps.details_status,
        cep: formProps.details_cep,
        endereco: formProps.details_endereco,
        municipio: formProps.details_municipio,
        observacao: formProps.details_observacao
    };
    
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        const { error: titularError } = await _supabase.from('clients').update(titularData).eq('id', titularId);
        if (titularError) throw titularError;

        await logAction('UPDATE_CLIENT', { clientId: titularId, clientName: `${titularData.nome} ${titularData.sobrenome}` });

        const dependentesUpsert = [];
        const novosDependentes = [];
        const dependentesParaDeletar = [];
        const allDependenteGroups = form.querySelectorAll('.dependente-form-group');

        for (const group of allDependenteGroups) {
            const id = group.dataset.dependenteId;
            const newId = group.dataset.dependenteNewId;

            if (id && group.querySelector(`[name="dependente_delete_${id}"]`)) {
                dependentesParaDeletar.push(id);
                continue;
            }
            
            let dependente = {};
            // CORREÇÃO (Ponto 1): Captura data de nascimento em ambos os casos (novo e existente)
            if (id) {
                dependente = {
                    id: id,
                    titular_id: titularId,
                    nome: group.querySelector(`[name="dependente_nome_${id}"]`).value,
                    sobrenome: group.querySelector(`[name="dependente_sobrenome_${id}"]`).value,
                    cpf: group.querySelector(`[name="dependente_cpf_${id}"]`).value,
                    telefone: group.querySelector(`[name="dependente_telefone_${id}"]`).value,
                    data_nascimento: formatDateForSupabase(group.querySelector(`[name="dependente_data_nascimento_${id}"]`).value),
                };
                 if (dependente.cpf && !validateCPF(dependente.cpf)) { throw new Error(`CPF do dependente ${dependente.nome} é inválido.`); }
                 if (dependente.telefone && !validatePhone(dependente.telefone)) { throw new Error(`Telefone do dependente ${dependente.nome} é inválido.`); }
                dependentesUpsert.push(dependente);
            } else if (newId) {
                dependente = {
                    titular_id: titularId,
                    nome: group.querySelector(`[name="dependente_nome_${newId}"]`).value,
                    sobrenome: group.querySelector(`[name="dependente_sobrenome_${newId}"]`).value,
                    cpf: group.querySelector(`[name="dependente_cpf_${newId}"]`).value,
                    telefone: group.querySelector(`[name="dependente_telefone_${newId}"]`).value,
                    data_nascimento: formatDateForSupabase(group.querySelector(`[name="dependente_data_nascimento_${newId}"]`).value),
                };
                 if (dependente.cpf && !validateCPF(dependente.cpf)) { throw new Error(`CPF do dependente ${dependente.nome} é inválido.`); }
                 if (dependente.telefone && !validatePhone(dependente.telefone)) { throw new Error(`Telefone do dependente ${dependente.nome} é inválido.`); }
                novosDependentes.push(dependente);
            }
        }

        if (dependentesUpsert.length > 0) {
            const { error: upsertError } = await _supabase.from('dependents').upsert(dependentesUpsert);
            if (upsertError) throw upsertError;
        }

        if (novosDependentes.length > 0) {
            const { error: insertError } = await _supabase.from('dependents').insert(novosDependentes);
            if (insertError) throw insertError;
        }

        if (dependentesParaDeletar.length > 0) {
            const { error: deleteError } = await _supabase.from('dependents').delete().in('id', dependentesParaDeletar);
            if (deleteError) throw deleteError;

            dependentesParaDeletar.forEach(async (depId) => {
                await logAction('DELETE_DEPENDENT', { dependentId: depId, titularId: titularId });
            });
        }

        showToast('Cliente atualizado com sucesso!');
        closeModal(detailsClientModal);
        loadClientsData(); // Recarrega os dados

    } catch (error) {
        showToast('Erro ao atualizar cliente: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Salvar Alterações';
    }
}

// --- FUNÇÕES AUXILIARES ---
function openModal(modalElement) {
    if (modalElement) modalElement.style.display = 'flex';
}

function closeModal(modalElement) {
    if (modalElement) modalElement.style.display = 'none';
}

// --- FUNÇÃO DE EXPORTAÇÃO ---
function exportToExcel() {
    if (allPeople.length === 0) {
        showToast("Não há dados para exportar (baseado na busca/filtro atual).");
        return;
    }
    const dataToExport = allPeople.map(person => ({
        "Nome": person.nome,
        "Tipo": person.tipo,
        "CPF": person.cpf,
        "Telefone": person.telefone,
        "Plano": person.plano,
        "Status": person.status
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes_e_Dependentes");
    XLSX.writeFile(workbook, "Todos_Beneficiarios.xlsx");
}

// --- EXPORTAÇÕES ---
export { loadClientsData, handleNewClientSubmit, openModal, closeModal, addDependenteField, openDetailsModal, handleUpdateClient, filterAndRenderClients, exportToExcel, allPeople, handleGenerateContract };
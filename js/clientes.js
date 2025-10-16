import { _supabase } from './supabase.js';
import { validateCPF, validateEmail, validatePhone } from './utils.js';
import { logAction } from './logger.js';

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
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

// --- FUNÇÕES DE CRIAÇÃO ---

function addDependenteField(container, counterVar) {
    if (window[counterVar] >= 6) {
        alert("É permitido no máximo 6 dependentes.");
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

            // Busca por titulares e dependentes que correspondem ao termo de busca
            const [clientResults, dependentResults] = await Promise.all([
                _supabase.from('clients').select('id').or(`nome.ilike.%${lowerSearchTerm}%,sobrenome.ilike.%${lowerSearchTerm}%,cpf.ilike.%${lowerSearchTerm}%,telefone.ilike.%${lowerSearchTerm}%`),
                _supabase.from('dependents').select('titular_id').or(`nome.ilike.%${lowerSearchTerm}%,sobrenome.ilike.%${lowerSearchTerm}%,cpf.ilike.%${lowerSearchTerm}%`)
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
                        telefone: dep.telefone,
                        plano: client.plano,
                        status: client.status,
                        tipo: 'Dependente'
                    });
                });
            }
        });

        allPeople = peopleList; // Atualiza a variável global para compatibilidade
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
    document.getElementById('totalResults').textContent = allPeople.length;

    if (people.length === 0) {
        clientsTableBody.innerHTML = '<tr><td colspan="6">Nenhuma pessoa encontrada.</td></tr>';
        return;
    }

    people.forEach(person => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${person.nome || 'N/A'} (${person.tipo})</td>
            <td>${person.cpf || 'N/A'}</td>
            <td>${person.telefone || 'N/A'}</td>
            <td>${person.plano || 'N/A'}</td>
            <td><span class="status status-${person.status === 'ATIVO' ? 'active' : 'inactive'}">${person.status}</span></td>
            <td class="actions">
                <button class="btn btn-secondary btn-small" data-titular-id="${person.titular_id}">Ver Detalhes</button>
            </td>
        `;
        clientsTableBody.appendChild(row);
    });
}

function filterAndRenderClients() {
    const searchTerm = document.getElementById('clientsSearchInput').value.toLowerCase();
    
    if (!searchTerm) {
        renderClientsTable(allPeople);
        return;
    }

    const filteredPeople = allPeople.filter(person => {
        const nome = person.nome ? person.nome.toLowerCase() : '';
        const cpf = person.cpf ? person.cpf.toString().replace(/\D/g, '') : '';
        const telefone = person.telefone ? person.telefone.toString().replace(/\D/g, '') : '';

        return nome.includes(searchTerm) ||
               cpf.includes(searchTerm) ||
               telefone.includes(searchTerm);
    });

    renderClientsTable(filteredPeople);
}

// --- FUNÇÕES DE SUBMISSÃO (CREATE/UPDATE) ---

async function handleNewClientSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');

    const titularFormData = new FormData(form);
    const titularFormProps = Object.fromEntries(titularFormData);
    
    if (!validateCPF(titularFormProps.cpf)) {
        alert('O CPF do titular é inválido!');
        return;
    }
    if (!validateEmail(titularFormProps.email)) {
        alert('O Email do titular é inválido!');
        return;
    }
     if (!validatePhone(titularFormProps.telefone)) {
        alert('O Telefone do titular parece inválido! Deve ter 10 ou 11 dígitos.');
        return;
    }

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
        };

        if (dependente.cpf && !validateCPF(dependente.cpf)) {
            alert(`O CPF do dependente ${dependente.nome} é inválido!`);
            return;
        }
        if (dependente.telefone && !validatePhone(dependente.telefone)) {
            alert(`O Telefone do dependente ${dependente.nome} parece inválido!`);
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
        
        await logAction('CREATE_CLIENT', { clientId: newTitular.id, clientName: `${newTitular.nome} ${newTitular.sobrenome}` });

        const titularId = newTitular.id;

        if (dependentesData.length > 0) {
            const dependentesParaSalvar = dependentesData.map(dep => {
                return { ...dep, titular_id: titularId };
            });

            const { error: dependentesError } = await _supabase
                .from('dependents')
                .insert(dependentesParaSalvar);

            if (dependentesError) throw dependentesError;
        }

        alert('Cliente e dependentes cadastrados com sucesso!');
        closeModal(newClientModal);
        form.reset();
        document.getElementById('dependentesContainer').innerHTML = '';
        dependenteCount = 0;
        loadClientsData();

    } catch (error) {
        alert('Erro ao salvar cliente: ' + error.message);
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
        alert('Não foi possível carregar os detalhes do cliente.');
    }
}

function populateDetailsForm(client, dependents) {
    document.getElementById('detailsClientId').value = client.id;
    document.getElementById('details_nome').value = client.nome || '';
    document.getElementById('details_sobrenome').value = client.sobrenome || '';
    document.getElementById('details_telefone').value = client.telefone || '';
    document.getElementById('details_cpf').value = client.cpf || '';
    document.getElementById('details_email').value = client.email || '';
    if (client.data_nascimento) {
        const [year, month, day] = client.data_nascimento.split('-');
        document.getElementById('details_data_nascimento').value = `${day}/${month}/${year}`;
    }
    document.getElementById('details_plano').value = client.plano || '';
    document.getElementById('details_status').value = client.status || 'ATIVO';
    document.getElementById('details_cep').value = client.cep || '';
    document.getElementById('details_endereco').value = client.endereco || '';
    document.getElementById('details_municipio').value = client.municipio || '';
    
    if (dependents && dependents.length > 0) {
        dependents.forEach(dep => {
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
    
    if (!validateCPF(formProps.cpf)) {
        alert('O CPF do titular é inválido!');
        return;
    }
    if (!validateEmail(formProps.email)) {
        alert('O Email do titular é inválido!');
        return;
    }
     if (!validatePhone(formProps.telefone)) {
        alert('O Telefone do titular parece inválido! Deve ter 10 ou 11 dígitos.');
        return;
    }
    
    const titularId = formProps.id;
    const titularData = {
        nome: formProps.details_nome,
        sobrenome: formProps.details_sobrenome,
        telefone: formProps.telefone,
        cpf: formProps.cpf,
        email: formProps.email,
        data_nascimento: formatDateForSupabase(formProps.details_data_nascimento),
        plano: formProps.plano,
        status: formProps.status,
        cep: formProps.cep,
        endereco: formProps.endereco,
        municipio: formProps.municipio,
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
            if (id) {
                dependente = {
                    id: id,
                    titular_id: titularId,
                    nome: group.querySelector(`[name="dependente_nome_${id}"]`).value,
                    sobrenome: group.querySelector(`[name="dependente_sobrenome_${id}"]`).value,
                    cpf: group.querySelector(`[name="dependente_cpf_${id}"]`).value,
                    telefone: group.querySelector(`[name="dependente_telefone_${id}"]`).value,
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

        alert('Cliente atualizado com sucesso!');
        closeModal(detailsClientModal);
        loadClientsData();

    } catch (error) {
        alert('Erro ao atualizar cliente: ' + error.message);
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
        alert("Não há dados para exportar.");
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
export { loadClientsData, handleNewClientSubmit, openModal, closeModal, addDependenteField, openDetailsModal, handleUpdateClient, filterAndRenderClients, exportToExcel, allPeople };


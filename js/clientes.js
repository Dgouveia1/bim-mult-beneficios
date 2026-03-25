import { _supabase } from './supabase.js';
import { validateCPF, validateEmail, validatePhone } from './utils.js';
import { logAction } from './logger.js';
import { showToast, showConfirm } from './utils.js';
import { getCurrentUserProfile } from './auth.js';
import { generateContractPDF, calcularProximoVencimento } from './vendas.js';

// --- ELEMENTOS DO DOM ---
const clientsTableBody = document.getElementById('clientsTableBody');
const newClientModal = document.getElementById('newClientModal');
const detailsClientModal = document.getElementById('detailsClientModal');
const dependentesContainer = document.getElementById('dependentesContainer');
const detailsDependentesContainer = document.getElementById('detailsDependentesContainer');
let dependenteCount = 0;
let dependenteDetailsCount = 0;

let allPeople = [];

function formatDateForSupabase(dateString) {
    if (!dateString || !dateString.includes('/')) return null;
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;
    let year = parts[2];
    if (year.length === 2) {
        year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${parts[1]}-${parts[0]}`;
}

function formatDateForInput(dateString) {
    if (!dateString || !dateString.includes('-')) return '';
    const parts = dateString.split('-');
    if (parts.length !== 3) return '';
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ... (Função addDependenteField permanece igual) ...
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
            <div class="form-row">
                <div class="form-group"><label>Data de Nascimento</label><input type="text" name="dependente_data_nascimento_${id}" placeholder="dd/mm/aaaa"></div>
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', html);
}

// ... (loadClientsData permanece igual) ...
async function loadClientsData(searchTerm = null) {
    if (!clientsTableBody) return;
    clientsTableBody.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';
    try {
        let finalClients = [];

        if (searchTerm && searchTerm.length >= 3) {
            const lowerSearchTerm = searchTerm.toLowerCase();
            const searchWords = lowerSearchTerm.split(' ').filter(w => w.length > 0);

            let clientQuery = _supabase.from('clients').select('id');
            const clientNameFilter = searchWords.map(word => `or(nome.ilike.%${word}%,sobrenome.ilike.%${word}%)`).join(',');
            const clientOrFilters = `and(${clientNameFilter}),cpf.ilike.%${lowerSearchTerm}%,telefone.ilike.%${lowerSearchTerm}%`;
            clientQuery = clientQuery.or(clientOrFilters);

            let dependentQuery = _supabase.from('dependents').select('titular_id');
            const dependentNameFilter = searchWords.map(word => `or(nome.ilike.%${word}%,sobrenome.ilike.%${word}%)`).join(',');
            const dependentOrFilters = `and(${dependentNameFilter}),cpf.ilike.%${lowerSearchTerm}%`;
            dependentQuery = dependentQuery.or(dependentOrFilters);

            const [clientResults, dependentResults] = await Promise.all([
                clientQuery,
                dependentQuery
            ]);

            if (clientResults.error) throw clientResults.error;
            if (dependentResults.error) throw dependentResults.error;

            const clientIdsFromDirectMatch = clientResults.data.map(c => c.id);
            const clientIdsFromDependentMatch = dependentResults.data.map(d => d.titular_id);
            const allMatchingClientIds = [...new Set([...clientIdsFromDirectMatch, ...clientIdsFromDependentMatch])];

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
            const { data: clients, error } = await _supabase
                .from('clients')
                .select('*, dependents(*)')
                .order('created_at', { ascending: false })
                .limit(25);
            if (error) throw error;
            finalClients = clients;
        }

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
                        telefone: dep.telefone || client.telefone,
                        plano: client.plano,
                        status: client.status,
                        tipo: 'Dependente'
                    });
                });
            }
        });

        allPeople = peopleList;
        renderClientsTable(allPeople);

    } catch (error) {
        clientsTableBody.innerHTML = `<tr><td colspan="6" style="color:red;">Erro ao carregar os dados: ${error.message}</td></tr>`;
        allPeople = [];
    }
}

// =================================================================
// MODIFICAÇÃO: renderClientsTable COM NOVO BOTÃO DE LINK
// =================================================================
function renderClientsTable(people) {
    if (!clientsTableBody) return;
    clientsTableBody.innerHTML = '';

    document.getElementById('resultsCount').textContent = people.length;
    document.getElementById('totalResults').textContent = people.length;

    if (people.length === 0) {
        clientsTableBody.innerHTML = '<tr><td colspan="6">Nenhuma pessoa encontrada.</td></tr>';
        return;
    }

    people.forEach(person => {
        const row = document.createElement('tr');

        const phone = person.telefone;
        const cleanedPhone = phone ? phone.replace(/\D/g, '') : '';
        let whatsappButton = '';

        if (cleanedPhone && (cleanedPhone.length === 10 || cleanedPhone.length === 11)) {
            const whatsappLink = `https://wa.me/55${cleanedPhone}`;
            whatsappButton = `
                <a href="${whatsappLink}" target="_blank" class="btn btn-success btn-small whatsapp-btn" title="Abrir WhatsApp" style="padding: 8px 10px; font-size: 14px; line-height: 1;">
                    <i class="fab fa-whatsapp"></i>
                </a>
            `;
        }

        let contractButton = '';
        let financeButton = '';
        let resendLinkButton = ''; // NOVO BOTÃO

        if (person.tipo === 'Titular') {
            contractButton = `
                <button class="btn btn-secondary btn-small generate-contract-btn" data-titular-id="${person.titular_id}" title="Gerar Contrato" style="padding: 8px 10px; font-size: 14px; line-height: 1;">
                    <i class="fas fa-file-contract"></i>
                </button>
            `;

            // Lógica do Botão de Reenviar Link
            // Aparece para Bim Familiar e Bim Individual
            if (person.plano === 'Bim Familiar' || person.plano === 'Bim Individual') {
                financeButton = `
                    <button class="btn btn-primary btn-small emit-carne-btn" data-titular-id="${person.titular_id}" data-cpf="${person.cpf}" data-plano="${person.plano}" data-name="${person.nome}" title="Ver Financeiro / Emitir Carnê" style="padding: 8px 10px; font-size: 14px; line-height: 1; background-color: var(--secondary-dark);">
                        <i class="fas fa-dollar-sign"></i>
                    </button>
                `;

                resendLinkButton = `
                    <button class="btn btn-warning btn-small resend-link-btn" data-titular-id="${person.titular_id}" data-phone="${cleanedPhone}" title="Reenviar Link de Pagamento" style="padding: 8px 10px; font-size: 14px; line-height: 1; background-color: #ff9800; border: none;">
                        <i class="fas fa-link"></i>
                    </button>
                `;
            }
        }

        // Estilização do Status (Destaque para ATRASO)
        let statusClass = 'active';
        if (person.status === 'INATIVO') statusClass = 'inactive';
        else if (person.status === 'ATRASO') statusClass = 'pending'; // Usa cor amarela/laranja do CSS base
        else if (person.status === 'CANCELADO') statusClass = 'cancelled';

        // Se estiver ATRASO, coloca um ícone de alerta
        const statusDisplay = person.status === 'ATRASO'
            ? `<span class="status status-${statusClass}" style="background-color: #ffebee; color: #c62828;"><i class="fas fa-exclamation-triangle"></i> ATRASO</span>`
            : `<span class="status status-${statusClass}">${person.status}</span>`;

        row.innerHTML = `
            <td data-label="Nome">${person.nome || 'N/A'} (${person.tipo})</td>
            <td data-label="CPF">${person.cpf || 'N/A'}</td>
            <td data-label="Telefone">${person.telefone || 'N/A'}</td>
            <td data-label="Plano">${person.plano || 'N/A'}</td>
            <td data-label="Status">${statusDisplay}</td>
            <td class="actions" style="display: flex; gap: 8px; align-items: center;">
                <button class="btn btn-secondary btn-small view-details-btn" data-titular-id="${person.titular_id}" title="Editar Detalhes"><i class="fas fa-edit"></i></button>
                ${contractButton}
                ${financeButton}
                ${resendLinkButton}
                ${whatsappButton} 
            </td>
        `;
        clientsTableBody.appendChild(row);
    });

    // Adiciona listener para o botão de reenviar link
    document.querySelectorAll('.resend-link-btn').forEach(btn => {
        btn.addEventListener('click', handleResendPaymentLink);
    });
}

// =================================================================
// NOVA FUNÇÃO: REENVIAR LINK DE PAGAMENTO
// =================================================================
async function handleResendPaymentLink(event) {
    const btn = event.currentTarget;
    const titularId = btn.dataset.titularId;
    const phone = btn.dataset.phone;

    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        // Busca o link na tabela de assinaturas
        const { data: sub, error } = await _supabase
            .from('asaas_subscriptions')
            .select('payment_link')
            .eq('client_id', titularId)
            .single();

        if (error || !sub || !sub.payment_link) {
            showToast('Nenhum link de assinatura ativo encontrado para este cliente.', 'error');
            return;
        }

        // Abre WhatsApp com a mensagem
        const message = `Olá! Segue o link para regularização/pagamento da sua mensalidade Bim Benefícios: ${sub.payment_link}`;
        const whatsappUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;

        window.open(whatsappUrl, '_blank');
        showToast('Redirecionando para o WhatsApp...');

    } catch (err) {
        console.error(err);
        showToast('Erro ao buscar link de pagamento.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

function filterAndRenderClients() {
    const searchTerm = document.getElementById('clientsSearchInput').value;
    loadClientsData(searchTerm);
}

// Função para gerar o contrato em PDF
async function handleGenerateContract(titularId) {
    try {
        showToast('Gerando contrato...', 'info');

        // 1. Buscar dados do Cliente + Dependentes
        const { data: client, error: clientError } = await _supabase
            .from('clients')
            .select(`*, dependents(*)`)
            .eq('id', titularId)
            .single();

        if (clientError) throw clientError;

        // 2. Buscar o Texto do Contrato do Plano correspondente
        // Usa 'ilike' para evitar problemas com maiúsculas/minúsculas
        const { data: plan, error: planError } = await _supabase
            .from('plans')
            .select('contract_text, price')
            .ilike('name', client.plano)
            .single();

        // Se não achar o plano ou não tiver texto, usa um fallback ou avisa
        let contractText = plan?.contract_text;

        if (!contractText) {
            showToast('Modelo de contrato não encontrado para este plano. Configure em Gestão de Planos.', 'warning');
            return;
        }

        // 3. Substituição de Variáveis
        const today = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        const dataAtual = today.toLocaleDateString('pt-BR', options);

        // Formata dependentes
        let listaDependentes = "Nenhum dependente cadastrado.";
        if (client.dependents && client.dependents.length > 0) {
            listaDependentes = client.dependents.map(d =>
                `- ${d.nome} ${d.sobrenome || ''} (CPF: ${d.cpf || 'N/A'}, Nasc: ${d.data_nascimento || 'N/A'})`
            ).join('\n');
        }

        // Realiza as trocas (.replace global)
        contractText = contractText
            .replace(/{{NOME_TITULAR}}/g, `${client.nome} ${client.sobrenome}`)
            .replace(/{{CPF_TITULAR}}/g, client.cpf || '')
            .replace(/{{DATA_NASCIMENTO_TITULAR}}/g, client.data_nascimento || '')
            .replace(/{{TELEFONE_TITULAR}}/g, client.telefone || '')
            .replace(/{{ENDERECO_TITULAR}}/g, `${client.endereco || ''}, ${client.numero || ''} - ${client.municipio || ''} (${client.cep || ''})`)
            .replace(/{{NOME_PLANO}}/g, client.plano || '')
            .replace(/{{VALOR_PLANO}}/g, plan?.price ? `R$ ${plan.price}` : 'A combinar')
            .replace(/{{LISTA_DEPENDENTES}}/g, listaDependentes)
            .replace(/{{DATA_ATUAL}}/g, dataAtual);

        // 4. Geração do PDF com jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Configurações de fonte
        doc.setFont("helvetica");
        doc.setFontSize(11);

        // Quebra o texto em linhas para caber na página (largura max ~180mm)
        const splitText = doc.splitTextToSize(contractText, 180);

        // Adiciona texto (início em x=15, y=20)
        let y = 20;

        // Lógica simples de paginação
        for (let i = 0; i < splitText.length; i++) {
            if (y > 280) { // Se chegar no fim da página
                doc.addPage();
                y = 20;
            }
            doc.text(splitText[i], 15, y);
            y += 6; // Espaçamento entre linhas
        }

        // Salva o arquivo
        doc.save(`Contrato_${client.nome}_${client.plano}.pdf`);
        showToast('Contrato gerado com sucesso!', 'success');

    } catch (error) {
        console.error('Erro ao gerar contrato:', error);
        showToast('Erro ao gerar contrato.', 'error');
    }
}

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

    if (titularFormProps.cpf) {
        const originalBtnText = submitButton.innerHTML;
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando CPF...';

        try {
            const { data: existingClient, error: checkError } = await _supabase
                .from('clients')
                .select('id')
                .eq('cpf', titularFormProps.cpf)
                .maybeSingle();

            if (checkError) throw checkError;

            if (existingClient) {
                showToast('ERRO: Este CPF já está cadastrado para outro cliente!');
                submitButton.disabled = false;
                submitButton.innerHTML = originalBtnText;
                return;
            }
        } catch (error) {
            console.error('Erro na verificação de CPF duplicado:', error);
            showToast('Erro ao verificar disponibilidade do CPF.');
            submitButton.disabled = false;
            submitButton.innerHTML = originalBtnText;
            return;
        }
        submitButton.disabled = false;
        submitButton.innerHTML = originalBtnText;
    }

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
        vendedor: vendedorName
    };

    const dependentesData = [];
    const dependenteGroups = form.querySelectorAll('.dependente-form-group');

    const cpfsInForm = new Set();
    if (titularFormProps.cpf) cpfsInForm.add(titularFormProps.cpf);

    for (const group of dependenteGroups) {
        const id = group.dataset.dependenteNewId;
        const dependente = {
            nome: group.querySelector(`[name="dependente_nome_${id}"]`).value,
            sobrenome: group.querySelector(`[name="dependente_sobrenome_${id}"]`).value,
            cpf: group.querySelector(`[name="dependente_cpf_${id}"]`).value,
            telefone: group.querySelector(`[name="dependente_telefone_${id}"]`).value,
            data_nascimento: group.querySelector(`[name="dependente_data_nascimento_${id}"]`).value,
        };

        if (dependente.cpf) {
            if (!validateCPF(dependente.cpf)) {
                showToast(`O CPF do dependente ${dependente.nome} é inválido!`);
                return;
            }
            if (cpfsInForm.has(dependente.cpf)) {
                showToast(`O CPF ${dependente.cpf} está duplicado neste formulário.`);
                return;
            }
            cpfsInForm.add(dependente.cpf);
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
        loadClientsData();

    } catch (error) {
        showToast('Erro ao salvar cliente: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Salvar';
    }
}

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
    document.getElementById('details_data_nascimento').value = formatDateForInput(client.data_nascimento);

    document.getElementById('details_plano').value = client.plano || '';
    document.getElementById('details_status').value = client.status || 'ATIVO';
    document.getElementById('details_dia_vencimento').value = client.dia_vencimento || '5';
    document.getElementById('details_cep').value = client.cep || '';
    document.getElementById('details_endereco').value = client.endereco || '';
    document.getElementById('details_municipio').value = client.municipio || '';
    document.getElementById('details_observacao').value = client.observacao || '';

    // Lógica para exibição condicional dos botões Cancelar / Reativar
    const btnCancelar = document.getElementById('btnCancelarPlano');
    const btnReativar = document.getElementById('btnReativarPlano');

    if (client.status === 'CANCELADO' || client.status === 'INATIVO') {
        if (btnCancelar) btnCancelar.style.display = 'none';
        if (btnReativar) btnReativar.style.display = 'flex';
    } else {
        if (btnCancelar) btnCancelar.style.display = 'flex';
        if (btnReativar) btnReativar.style.display = 'none';
    }

    if (dependents && dependents.length > 0) {
        dependents.forEach(dep => {
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
        observacao: formProps.details_observacao,
        dia_vencimento: formProps.details_dia_vencimento ? parseInt(formProps.details_dia_vencimento, 10) : null
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
                    data_nascimento: formatDateForSupabase(group.querySelector(`[name="dependente_data_nascimento_${id}"]`).value),
                };
                if (dependente.cpf && !validateCPF(dependente.cpf)) { throw new Error(`CPF do dependente ${dependente.nome} é inválido.`); }
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
        loadClientsData();

    } catch (error) {
        showToast('Erro ao atualizar cliente: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Salvar Alterações';
    }
}

function openModal(modalElement) {
    if (modalElement) modalElement.style.display = 'flex';
}

function closeModal(modalElement) {
    if (modalElement) modalElement.style.display = 'none';
}

// =================================================================
// NOVA FUNÇÃO: MIGRAR PLANO PARA BIM FAMILIAR
// =================================================================
async function handleMigratePlanToFamiliar() {
    const titularId = document.getElementById('detailsClientId').value;
    const planoAtual = document.getElementById('details_plano').value;

    if (planoAtual === 'Bim Familiar') {
        showToast('O cliente já está no plano Bim Familiar.', 'warning');
        return;
    }

    if (planoAtual !== 'Mult' && planoAtual !== 'Bim Individual') {
        showToast('A migração só está disponível para clientes Mult ou Bim Individual.', 'warning');
        return;
    }

    const confirmacao = await showConfirm(`Deseja realmente migrar este cliente do plano ${planoAtual} para o Bim Familiar?`);
    if (!confirmacao) return;

    const btn = document.getElementById('btnMigrarPlanoFamiliar');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Migrando...';

    try {
        const { data, error } = await _supabase.functions.invoke('migrate-plan-to-familiar', {
            body: { clientId: titularId }
        });

        if (error) {
            console.error("Supabase edge function error:", error);
            let errorMsg = error.message;
            try {
                const body = await error.context?.json();
                errorMsg = body?.error || errorMsg;
            } catch {}
            showToast(`Erro na migração: ${errorMsg}`, 'error');
            return;
        }

        if (data && data.success) {
            showToast(data.message, 'success');
            closeModal(document.getElementById('detailsClientModal'));
            loadClientsData();
        } else {
            const errorMsg = data?.error || 'Erro desconhecido retornado pela API.';
            showToast(`Erro na migração: ${errorMsg}`, 'error');
        }
    } catch (error) {
        console.error("Migration catch error:", error);
        showToast(`Erro ao conectar com servidor para migração: ${error.message || 'Erro desconhecido'}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

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

async function handleCancelPlan() {
    const titularId = document.getElementById('detailsClientId').value;

    const confirmacao = await showConfirm('Tem certeza que deseja cancelar este plano e todas as cobranças pendentes no Asaas?');
    if (!confirmacao) return;

    const btn = document.getElementById('btnCancelarPlano');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cancelando...';

    try {
        const { data, error } = await _supabase.functions.invoke('cancel-asaas-subscription', {
            body: { client_id: titularId }
        });

        if (error) {
            console.error("Supabase edge function error:", error);
            throw error;
        }

        if (data && data.success) {
            showToast(data.message, 'success');
            closeModal(document.getElementById('detailsClientModal'));
            loadClientsData();
        } else {
            const errorMsg = data?.error || 'Erro desconhecido retornado pela API.';
            showToast(`Erro no cancelamento: ${errorMsg}`, 'error');
        }
    } catch (error) {
        console.error("Cancellation catch error:", error);
        showToast(`Erro ao conectar com servidor para cancelamento: ${error.message || 'Erro desconhecido'}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// =================================================================
// NOVA FUNÇÃO: REATIVAR PLANO (GERAR NOVA ASSINATURA ASAAS)
// =================================================================
async function handleReactivatePlan() {
    const titularId = document.getElementById('detailsClientId').value;

    const confirmacao = await showConfirm('Tem certeza que deseja reativar o plano deste cliente? Uma nova assinatura será gerada.');
    if (!confirmacao) return;

    const btn = document.getElementById('btnReativarPlano');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    btn.classList.add('opacity-75', 'cursor-not-allowed');

    try {
        const { data, error } = await _supabase.functions.invoke('reactivate-asaas-subscription', {
            body: { client_id: titularId }
        });

        if (error) {
            console.error("Supabase edge function error:", error);
            throw error;
        }

        if (data && data.success) {
            showToast(data.message, 'success');
            closeModal(document.getElementById('detailsClientModal'));
            loadClientsData();
        } else {
            const errorMsg = data?.error || 'Erro desconhecido retornado pela API.';
            showToast(`Erro ao reativar: ${errorMsg}`, 'error');
        }
    } catch (error) {
        console.error("Reactivate catch error:", error);
        showToast(`Erro ao conectar com servidor: ${error.message || 'Erro de conexão.'}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
            btn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    }
}

// =================================================================
// NOVA FUNÇÃO: ALTERAR DIA DE VENCIMENTO NO ASAAS
// =================================================================
async function handleAlterarVencimentoAsaas() {
    const titularId = document.getElementById('detailsClientId').value;
    const diaVencimento = parseInt(document.getElementById('details_dia_vencimento').value, 10);

    const confirmacao = await showConfirm(`Deseja alterar o dia de vencimento para o dia ${String(diaVencimento).padStart(2, '0')} de cada mês no Asaas?`);
    if (!confirmacao) return;

    const btn = document.getElementById('btnAlterarVencimentoAsaas');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Alterando...';

    try {
        const nextDueDate = calcularProximoVencimento(diaVencimento);

        const { data, error } = await _supabase.functions.invoke('update-asaas-due-date', {
            body: { clientId: titularId, nextDueDate: nextDueDate, diaVencimento: diaVencimento }
        });

        if (error) {
            console.error('Supabase edge function error:', error);
            throw error;
        }

        if (data && data.success) {
            // Atualiza o dia_vencimento localmente na tabela clients
            await _supabase.from('clients').update({ dia_vencimento: diaVencimento }).eq('id', titularId);
            showToast(`Vencimento alterado para o dia ${String(diaVencimento).padStart(2, '0')} com sucesso!`, 'success');
        } else {
            const errorMsg = data?.error || 'Erro desconhecido retornado pela API.';
            showToast(`Erro ao alterar vencimento: ${errorMsg}`, 'error');
        }
    } catch (error) {
        console.error('Catch handleAlterarVencimentoAsaas:', error);
        showToast(`Erro ao conectar com servidor: ${error.message || 'Erro de conexão.'}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

export { loadClientsData, handleNewClientSubmit, openModal, closeModal, addDependenteField, openDetailsModal, handleUpdateClient, filterAndRenderClients, exportToExcel, allPeople, handleGenerateContract, handleMigratePlanToFamiliar, handleCancelPlan, handleReactivatePlan, handleAlterarVencimentoAsaas };
import { _supabase } from './supabase.js';
import { showToast, showConfirm } from './utils.js';

// Elementos do DOM
let plansTableBody;
let planModal;
let planForm;

// Definição das variáveis disponíveis para o contrato
const AVAILABLE_VARIABLES = [
    { code: '{{NOME_TITULAR}}', desc: 'Nome completo do titular' },
    { code: '{{CPF_TITULAR}}', desc: 'CPF do titular' },
    { code: '{{DATA_NASCIMENTO_TITULAR}}', desc: 'Data de nascimento' },
    { code: '{{TELEFONE_TITULAR}}', desc: 'Telefone de contato' },
    { code: '{{ENDERECO_TITULAR}}', desc: 'Endereço completo (Rua, Nº, Bairro, Cidade-UF)' },
    { code: '{{NOME_PLANO}}', desc: 'Nome do plano contratado' },
    { code: '{{VALOR_PLANO}}', desc: 'Valor mensal do plano' },
    { code: '{{LISTA_DEPENDENTES}}', desc: 'Lista formatada dos dependentes' },
    { code: '{{DATA_ATUAL}}', desc: 'Data de hoje por extenso (Ex: 10 de Outubro de 2023)' }
];

// Modelo padrão baseado nos arquivos enviados
const DEFAULT_CONTRACT_TEMPLATE = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS "{{NOME_PLANO}}"

CONTRATADA:
BIM MULT BENEFICIOS, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 37.054.912/0001-56, com sede na Av. Amadeu Bizelli, 1315-Centro, Fernandópolis SP, CEP 15600-000.

CONTRATANTE:
{{NOME_TITULAR}}, inscrito(a) no CPF sob o nº {{CPF_TITULAR}}, data de nasc. {{DATA_NASCIMENTO_TITULAR}}, residente e domiciliado(a) em {{ENDERECO_TITULAR}}, Telefone: {{TELEFONE_TITULAR}}.

Pelo presente CONTRATO DE PRESTAÇÃO DE SERVIÇOS, as partes acima qualificadas têm, entre si, justo e contratado o que se segue:

CLÁUSULA 1ª - DO OBJETO
O presente contrato tem por objeto a prestação dos serviços de acesso a uma rede de profissionais de saúde, exames laboratoriais e de imagem com descontos especiais.

CLÁUSULA 2ª - DA CARÊNCIA
O acesso aos benefícios terá efeito imediato ou conforme carência de 1 dia útil após a assinatura.

CLÁUSULA 3ª - DOS BENEFÍCIOS
1. A CONTRATADA terá direito a acesso a uma rede de profissionais de saúde e odontologia com descontos especiais.
2. A CONTRATADA também terá acesso a exames laboratoriais e de imagem com descontos previamente estabelecidos.

CLÁUSULA 4ª - DA MENSALIDADE E INADIMPLÊNCIA
O valor mensal do plano é de {{VALOR_PLANO}}.
O não pagamento da parcela mensal por mais de 15 dias facultará à CONTRATADA a suspensão dos serviços.

DEPENDENTES INCLUÍDOS:
{{LISTA_DEPENDENTES}}

Fernandópolis, {{DATA_ATUAL}}.

________________________________________________
ASSINATURA DO CONTRATANTE
{{NOME_TITULAR}}
CPF: {{CPF_TITULAR}}`;

/**
 * Inicializa a página de gestão de planos
 */
export function setupPlansPage() {
    plansTableBody = document.getElementById('plansTableBody');
    planModal = document.getElementById('planModal');
    planForm = document.getElementById('planForm');

    setupModalFeatures();
    loadPlans();
}

/**
 * Configura funcionalidades extras do modal (Legenda e Botão de Template)
 */
function setupModalFeatures() {
    const contractTextarea = document.getElementById('planContract');
    if (!contractTextarea) return;

    // Verifica se já adicionamos os helpers para não duplicar
    if (document.getElementById('contractHelpers')) return;

    // Cria container de ajuda
    const helpersContainer = document.createElement('div');
    helpersContainer.id = 'contractHelpers';
    helpersContainer.style.marginTop = '10px';
    helpersContainer.style.padding = '10px';
    helpersContainer.style.backgroundColor = '#f8f9fa';
    helpersContainer.style.border = '1px solid #dee2e6';
    helpersContainer.style.borderRadius = '4px';

    // Botão de inserir modelo
    const insertTemplateBtn = document.createElement('button');
    insertTemplateBtn.type = 'button';
    insertTemplateBtn.className = 'btn btn-secondary btn-small';
    insertTemplateBtn.innerHTML = '<i class="fas fa-file-alt"></i> Inserir Modelo Padrão';
    insertTemplateBtn.style.marginBottom = '15px';
    insertTemplateBtn.onclick = () => {
        if (confirm('Isso substituirá o texto atual do contrato. Deseja continuar?')) {
            contractTextarea.value = DEFAULT_CONTRACT_TEMPLATE;
        }
    };

    // Lista de variáveis
    const varsTitle = document.createElement('h5');
    varsTitle.textContent = 'Variáveis Disponíveis para Substituição:';
    varsTitle.style.marginBottom = '10px';
    varsTitle.style.color = '#555';

    const varsList = document.createElement('div');
    varsList.style.display = 'grid';
    varsList.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
    varsList.style.gap = '5px';
    varsList.style.fontSize = '0.85rem';

    AVAILABLE_VARIABLES.forEach(v => {
        const item = document.createElement('div');
        item.innerHTML = `<code style="background:#e9ecef; padding:2px 4px; border-radius:3px; cursor:pointer;" title="Clique para copiar">${v.code}</code> - ${v.desc}`;
        item.onclick = () => {
            // Copia para a área de transferência e cola no cursor
            insertAtCursor(contractTextarea, v.code);
        };
        varsList.appendChild(item);
    });

    helpersContainer.appendChild(insertTemplateBtn);
    helpersContainer.appendChild(varsTitle);
    helpersContainer.appendChild(varsList);

    // Insere após o textarea
    contractTextarea.parentNode.insertBefore(helpersContainer, contractTextarea.nextSibling);
}

/**
 * Utilitário para inserir texto onde o cursor está
 */
function insertAtCursor(myField, myValue) {
    if (document.selection) {
        myField.focus();
        let sel = document.selection.createRange();
        sel.text = myValue;
    } else if (myField.selectionStart || myField.selectionStart == '0') {
        var startPos = myField.selectionStart;
        var endPos = myField.selectionEnd;
        myField.value = myField.value.substring(0, startPos)
            + myValue
            + myField.value.substring(endPos, myField.value.length);
        myField.focus();
        myField.selectionStart = startPos + myValue.length;
        myField.selectionEnd = startPos + myValue.length;
    } else {
        myField.value += myValue;
    }
}

/**
 * Carrega os planos do banco de dados
 */
export async function loadPlans() {
    if (!plansTableBody) return;

    plansTableBody.innerHTML = '<tr><td colspan="6" class="loading-text">Carregando planos...</td></tr>';

    try {
        const { data: plans, error } = await _supabase
            .from('plans')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        renderPlansTable(plans);
    } catch (error) {
        console.error('Erro ao carregar planos:', error);
        showToast('Erro ao carregar planos.', 'error');
        plansTableBody.innerHTML = '<tr><td colspan="6" class="error-text">Erro ao carregar dados.</td></tr>';
    }
}

/**
 * Renderiza a tabela de planos
 */
function renderPlansTable(plans) {
    plansTableBody.innerHTML = '';

    if (!plans || plans.length === 0) {
        plansTableBody.innerHTML = '<tr><td colspan="6" class="empty-text">Nenhum plano cadastrado.</td></tr>';
        return;
    }

    plans.forEach(plan => {
        const row = document.createElement('tr');
        
        const priceFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plan.price || 0);
        const statusBadge = plan.active 
            ? '<span class="status-badge status-active">Ativo</span>' 
            : '<span class="status-badge status-inactive">Inativo</span>';

        row.innerHTML = `
            <td><strong>${plan.name}</strong></td>
            <td>${priceFormatted}</td>
            <td>${plan.dependents_limit} dependentes</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-secondary btn-small view-contract-btn" data-id="${plan.id}" title="Ver Contrato"><i class="fas fa-file-contract"></i></button>
            </td>
            <td>
                <button class="btn btn-secondary btn-small edit-plan-btn" data-id="${plan.id}"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-small delete-plan-btn" data-id="${plan.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;

        plansTableBody.appendChild(row);
    });
}

/**
 * Abre o modal para criar ou editar plano
 */
export async function openPlanModal(planId = null) {
    const modalTitle = document.getElementById('planModalTitle');
    const form = document.getElementById('planForm');
    const idInput = document.getElementById('planId');
    
    // Reset form
    form.reset();
    idInput.value = '';

    if (planId) {
        modalTitle.textContent = 'Editar Plano';
        try {
            const { data: plan, error } = await _supabase
                .from('plans')
                .select('*')
                .eq('id', planId)
                .single();

            if (error) throw error;

            idInput.value = plan.id;
            document.getElementById('planName').value = plan.name;
            document.getElementById('planPrice').value = plan.price;
            document.getElementById('planDependents').value = plan.dependents_limit;
            document.getElementById('planContract').value = plan.contract_text || '';
            document.getElementById('planActive').value = plan.active ? 'true' : 'false';

        } catch (error) {
            console.error('Erro ao buscar plano:', error);
            showToast('Erro ao carregar detalhes do plano.', 'error');
            return;
        }
    } else {
        modalTitle.textContent = 'Novo Plano';
        document.getElementById('planActive').value = 'true';
    }

    planModal.style.display = 'flex';
}

/**
 * Salva (Insere ou Atualiza) o plano
 */
export async function savePlan(event) {
    event.preventDefault();

    const id = document.getElementById('planId').value;
    const name = document.getElementById('planName').value;
    const price = parseFloat(document.getElementById('planPrice').value);
    const dependentsLimit = parseInt(document.getElementById('planDependents').value);
    const contractText = document.getElementById('planContract').value;
    const active = document.getElementById('planActive').value === 'true';

    const planData = {
        name: name,
        price: isNaN(price) ? 0 : price,
        dependents_limit: isNaN(dependentsLimit) ? 0 : dependentsLimit,
        contract_text: contractText,
        active: active
    };

    try {
        let error;
        
        if (id) {
            // Update
            const { error: updateError } = await _supabase
                .from('plans')
                .update(planData)
                .eq('id', id);
            error = updateError;
        } else {
            // Insert
            const { error: insertError } = await _supabase
                .from('plans')
                .insert([planData]);
            error = insertError;
        }

        if (error) throw error;

        showToast('Plano salvo com sucesso!', 'success');
        planModal.style.display = 'none';
        loadPlans();

    } catch (error) {
        console.error('Erro ao salvar plano:', error);
        showToast('Erro ao salvar plano. Verifique suas permissões.', 'error');
    }
}

/**
 * Exclui (ou inativa) um plano
 */
export async function deletePlan(id) {
    const confirmed = await showConfirm('Tem certeza que deseja excluir este plano? Esta ação não pode ser desfeita.');
    
    if (confirmed) {
        try {
            const { error } = await _supabase
                .from('plans')
                .delete()
                .eq('id', id);

            if (error) throw error;

            showToast('Plano excluído com sucesso.', 'success');
            loadPlans();
        } catch (error) {
            console.error('Erro ao excluir:', error);
            showToast('Erro ao excluir. O plano pode estar vinculado a clientes.', 'error');
        }
    }
}
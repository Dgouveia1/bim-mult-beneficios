import { _supabase } from './supabase.js';
import { showToast, fetchAddressByCEP } from './utils.js';

let availablePlans = [];

/**
 * Configura a página de Nova Venda
 */
export function setupVendasPage() {
    const form = document.getElementById('newSaleForm');
    
    if (form) {
        // Remove listener antigo para evitar duplicação
        form.removeEventListener('submit', handleSaleSubmit);
        form.addEventListener('submit', handleSaleSubmit);
        
        // Listener de CEP
        const cepInput = form.querySelector('input[name="cep"]');
        if (cepInput) {
            cepInput.addEventListener('blur', async (e) => {
                const address = await fetchAddressByCEP(e.target.value);
                if (address) {
                    form.querySelector('input[name="endereco"]').value = address.logradouro;
                    form.querySelector('input[name="municipio"]').value = `${address.localidade}-${address.uf}`;
                }
            });
        }

        // Botão de Adicionar Dependente
        const addDepBtn = document.getElementById('addVendaDependenteBtn');
        if (addDepBtn) {
            addDepBtn.onclick = () => addDependenteField();
        }
    }
    
    // Carrega os planos dinamicamente do banco
    loadPlansIntoSelect();
}

/**
 * Busca planos ativos no Supabase e preenche o select
 */
async function loadPlansIntoSelect() {
    const planSelect = document.querySelector('#newSaleForm select[name="plano"]');
    if (!planSelect) return;

    try {
        const { data: plans, error } = await _supabase
            .from('plans')
            .select('*')
            .eq('active', true)
            .order('name');

        if (error) throw error;

        availablePlans = plans; // Armazena em memória para usar preço/descrição no submit

        // Limpa opções (mantendo a primeira "Selecione...")
        planSelect.innerHTML = '<option value="">Selecione...</option>';

        if (plans.length === 0) {
            const option = document.createElement('option');
            option.textContent = "Nenhum plano ativo encontrado";
            option.disabled = true;
            planSelect.appendChild(option);
            return;
        }

        plans.forEach(plan => {
            const option = document.createElement('option');
            // Usamos o NOME como value para compatibilidade com o campo 'plano' da tabela 'clients' (que é texto)
            option.value = plan.name; 
            
            // Guardamos ID e Preço nos atributos de dados para acesso rápido
            option.dataset.planId = plan.id;
            option.dataset.price = plan.price;
            
            const priceFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plan.price);
            option.textContent = `${plan.name} - ${priceFormatted}`;
            
            planSelect.appendChild(option);
        });

    } catch (error) {
        console.error('Erro ao carregar planos na venda:', error);
        showToast('Erro ao carregar lista de planos.', 'error');
    }
}

/**
 * Adiciona campos de dependente dinamicamente
 */
function addDependenteField() {
    const container = document.getElementById('vendasDependentesContainer');
    const index = container.children.length; // Usa índice para nomes únicos
    
    const div = document.createElement('div');
    div.className = 'dependente-row form-row';
    div.style.backgroundColor = '#f9f9f9';
    div.style.padding = '10px';
    div.style.marginBottom = '10px';
    div.style.borderRadius = '5px';
    div.style.border = '1px solid #eee';

    div.innerHTML = `
        <div class="form-group" style="flex: 2;">
            <label>Nome Completo</label>
            <input type="text" name="dep_nome_${index}" required placeholder="Nome do dependente">
        </div>
        <div class="form-group" style="flex: 1;">
            <label>CPF</label>
            <input type="text" name="dep_cpf_${index}" placeholder="000.000.000-00" oninput="this.value = this.value.replace(/\\D/g, '').replace(/(\\d{3})(\\d{3})(\\d{3})(\\d{2})/, '$1.$2.$3-$4')">
        </div>
        <div class="form-group" style="flex: 1;">
            <label>Nascimento</label>
            <input type="date" name="dep_nasc_${index}">
        </div>
        <div class="form-group" style="flex: 1;">
            <label>Parentesco</label>
            <select name="dep_parentesco_${index}">
                <option value="Filho(a)">Filho(a)</option>
                <option value="Cônjuge">Cônjuge</option>
                <option value="Pai/Mãe">Pai/Mãe</option>
                <option value="Outro">Outro</option>
            </select>
        </div>
        <div class="form-group" style="flex: 0; align-self: flex-end;">
            <button type="button" class="btn btn-danger btn-small" onclick="this.parentElement.parentElement.remove()" title="Remover"><i class="fas fa-times"></i></button>
        </div>
    `;
    container.appendChild(div);
}

/**
 * Processa o envio do formulário de venda
 */
async function handleSaleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');
    
    // Recupera dados do plano selecionado
    const selectedPlanName = formData.get('plano');
    const selectedPlan = availablePlans.find(p => p.name === selectedPlanName);
    
    if (!selectedPlan) {
        showToast('Por favor, selecione um plano válido.', 'warning');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

    try {
        // 1. Prepara dados do Cliente
        const clientData = {
            nome: formData.get('nome'),
            sobrenome: formData.get('sobrenome'),
            cpf: formData.get('cpf')?.replace(/\D/g, ''),
            telefone: formData.get('telefone'),
            email: formData.get('email'),
            data_nascimento: formData.get('data_nascimento'),
            cep: formData.get('cep'),
            endereco: formData.get('endereco'),
            municipio: formData.get('municipio'),
            plano: selectedPlanName, // Salva o nome do plano
            status: formData.get('status') || 'ATIVO',
            created_at: new Date()
        };

        // Inserção do Cliente
        const { data: client, error: clientError } = await _supabase
            .from('clients')
            .insert([clientData])
            .select()
            .single();

        if (clientError) throw clientError;

        // 2. Prepara e Insere Dependentes
        const dependentsToInsert = [];
        // Itera sobre os inputs para encontrar dependentes (baseado no prefixo dep_nome_)
        for (const [key, value] of formData.entries()) {
            if (key.startsWith('dep_nome_')) {
                const index = key.split('_')[2];
                if (value.trim() !== '') {
                    dependentsToInsert.push({
                        titular_id: client.id,
                        nome: value,
                        cpf: formData.get(`dep_cpf_${index}`)?.replace(/\D/g, ''),
                        data_nascimento: formData.get(`dep_nasc_${index}`) || null,
                        parentesco: formData.get(`dep_parentesco_${index}`)
                    });
                }
            }
        }

        if (dependentsToInsert.length > 0) {
            const { error: depError } = await _supabase
                .from('dependents')
                .insert(dependentsToInsert);
            
            if (depError) console.error('Erro ao salvar dependentes:', depError); // Não bloqueia o fluxo principal
        }

        // 3. Integração Financeira (Simulação Asaas)
        // Usa os dados REAIS da tabela de planos
        const financeData = {
            client_id: client.id,
            description: `Assinatura ${selectedPlan.name}`, 
            value: selectedPlan.price,                      
            status: 'PENDING',
            due_date: new Date().toISOString().split('T')[0], // Vencimento hoje (primeira parcela)
            created_at: new Date()
        };

        // Tenta inserir na tabela de assinaturas (fallback para history se não existir)
        const { error: financeError } = await _supabase
            .from('asaas_subscriptions') 
            .insert([{
                ...financeData,
                plan_id: selectedPlan.id,
                cycle: 'MONTHLY'
            }]);

        if (financeError) {
            console.warn('Fallback financeiro:', financeError);
             await _supabase.from('financial_history').insert([{
                client_id: client.id,
                type: 'Mensalidade',
                amount: selectedPlan.price,
                status: 'Pendente',
                description: `Primeira mensalidade - ${selectedPlan.name}`
             }]);
        }

        showToast('Venda realizada e cliente cadastrado!', 'success');
        
        // 4. Geração de Contrato Automática (Chamada local)
        await generateContractPDF(client.id);

        // Limpeza
        form.reset();
        document.getElementById('vendasDependentesContainer').innerHTML = '';

    } catch (error) {
        console.error('Erro crítico na venda:', error);
        showToast('Erro ao processar venda: ' + (error.message || 'Erro desconhecido'), 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Salvar e Gerar Contrato';
    }
}

/**
 * Função LOCAL para gerar o contrato (restaurada)
 */
export async function generateContractPDF(titularId) {
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
        const { data: plan, error: planError } = await _supabase
            .from('plans')
            .select('contract_text, price')
            .ilike('name', client.plano)
            .single();

        let contractText = plan?.contract_text;
        
        if (!contractText) {
            showToast('Modelo de contrato não encontrado. Verifique a Gestão de Planos.', 'warning');
            return;
        }

        // 3. Substituição de Variáveis
        const today = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        const dataAtual = today.toLocaleDateString('pt-BR', options);

        let listaDependentes = "";
        if (client.dependents && client.dependents.length > 0) {
            // Formata a lista de dependentes para ficar alinhada (Nome | CPF | Nasc)
            listaDependentes = client.dependents.map(d => 
                `${d.nome} | ${formatCPF(d.cpf)} | ${d.data_nascimento || ''} | ${d.parentesco || 'DEPENDENTE'}`
            ).join('\n');
        } else {
            listaDependentes = "Nenhum dependente cadastrado.";
        }

        contractText = contractText
            .replace(/{{NOME_TITULAR}}/g, `${client.nome} ${client.sobrenome}`)
            .replace(/{{CPF_TITULAR}}/g, formatCPF(client.cpf) || '__________________')
            .replace(/{{DATA_NASCIMENTO_TITULAR}}/g, client.data_nascimento || '___/___/____')
            .replace(/{{TELEFONE_TITULAR}}/g, client.telefone || '')
            .replace(/{{ENDERECO_TITULAR}}/g, `${client.endereco || ''}, ${client.municipio || ''} - ${client.cep || ''}`)
            .replace(/{{NOME_PLANO}}/g, client.plano || '')
            .replace(/{{VALOR_PLANO}}/g, plan?.price ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plan.price) : 'R$ 0,00')
            .replace(/{{LISTA_DEPENDENTES}}/g, listaDependentes)
            .replace(/{{DATA_ATUAL}}/g, dataAtual);

        // 4. Geração do PDF com jsPDF
        if (!window.jspdf) {
            showToast('Biblioteca PDF não carregada. Tente recarregar a página.', 'error');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFont("helvetica");
        doc.setFontSize(10);

        // Quebra o texto automaticamente para não estourar a margem
        const splitText = doc.splitTextToSize(contractText, 180);
        let y = 20;
        
        for (let i = 0; i < splitText.length; i++) {
            if (y > 280) { // Nova página se passar do limite vertical
                doc.addPage();
                y = 20;
            }
            doc.text(splitText[i], 15, y);
            y += 5;
        }

        doc.save(`Contrato_${client.nome}_${client.plano}.pdf`);
        showToast('Contrato gerado com sucesso!', 'success');

    } catch (error) {
        console.error('Erro ao gerar contrato (vendas):', error);
        showToast('Erro ao gerar contrato.', 'error');
    }
}

/**
 * Função Auxiliar de Formatação CPF
 */
function formatCPF(v) {
    if (!v) return '';
    v = v.replace(/\D/g, "");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    return v;
}
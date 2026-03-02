import { _supabase } from './supabase.js';
import { showToast, fetchAddressByCEP, showConfirm } from './utils.js';
// Importamos o getCurrentUserProfile para obter o vendedor logado
import { getCurrentUserProfile } from './auth.js';

let availablePlans = [];

/**
 * Configura a página de Nova Venda
 */
export function setupVendasPage() {
    const form = document.getElementById('newSaleForm');

    if (form) {
        form.removeEventListener('submit', handleSaleSubmit);
        form.addEventListener('submit', handleSaleSubmit);

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

        const addDepBtn = document.getElementById('addVendaDependenteBtn');
        if (addDepBtn) {
            addDepBtn.onclick = () => addDependenteField();
        }
    }

    loadPlansIntoSelect();
}

/**
 * Busca planos ativos no Supabase
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

        availablePlans = plans;
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
            option.value = plan.name;
            option.dataset.planId = plan.id;
            option.dataset.price = plan.price;

            const priceFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plan.price);
            option.textContent = `${plan.name} - ${priceFormatted}`;
            planSelect.appendChild(option);
        });

    } catch (error) {
        console.error('Erro ao carregar planos:', error);
        showToast('Erro ao carregar lista de planos.', 'error');
    }
}

/**
 * Adiciona campos de dependente
 */
function addDependenteField() {
    const container = document.getElementById('vendasDependentesContainer');
    const index = container.children.length;

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
            <label>Telefone</label>
            <input type="text" name="dep_telefone_${index}" placeholder="(00) 00000-0000" oninput="this.value = this.value.replace(/\\D/g, '').replace(/^(\\d{2})(\\d)/g, '($1) $2').replace(/(\\d)(\\d{4})$/, '$1-$2')">
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

    const cpfRaw = formData.get('cpf');
    const cpfClean = cpfRaw ? cpfRaw.replace(/\D/g, '') : '';

    if (!cpfClean || cpfClean.length !== 11) {
        showToast('CPF inválido. Verifique os dados.', 'warning');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

    try {
        // Captura usuário atual para registro do vendedor
        const currentUser = getCurrentUserProfile();
        const sellerName = currentUser ? currentUser.full_name : 'Sistema';

        // 0. Verifica se cliente já existe
        const { data: existingClient } = await _supabase
            .from('clients')
            .select('id')
            .eq('cpf', cpfClean)
            .maybeSingle();

        if (existingClient) {
            throw new Error('CPF já cadastrado no sistema!');
        }

        // 1. Criação do Cliente
        const clientData = {
            nome: formData.get('nome'),
            sobrenome: formData.get('sobrenome'),
            cpf: cpfClean,
            telefone: formData.get('telefone'),
            email: formData.get('email'),
            data_nascimento: formData.get('data_nascimento'),
            cep: formData.get('cep'),
            endereco: formData.get('endereco'),
            municipio: formData.get('municipio'),
            plano: selectedPlanName,
            status: formData.get('status') || 'ATIVO',
            vendedor: sellerName, // REGISTRA O VENDEDOR AQUI
            created_at: new Date()
        };

        const { data: client, error: clientError } = await _supabase
            .from('clients')
            .insert([clientData])
            .select()
            .single();

        if (clientError) throw clientError;

        // 2. Criação dos Dependentes
        const dependentsToInsert = [];
        for (const [key, value] of formData.entries()) {
            if (key.startsWith('dep_nome_')) {
                const index = key.split('_')[2];
                if (value.trim() !== '') {
                    dependentsToInsert.push({
                        titular_id: client.id,
                        nome: value,
                        cpf: formData.get(`dep_cpf_${index}`)?.replace(/\D/g, ''),
                        telefone: formData.get(`dep_telefone_${index}`)?.replace(/\D/g, ''),
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
            if (depError) console.error('Erro não fatal dependentes:', depError);
        }

        // 3. INTEGRAÇÃO ASAAS VIA EDGE FUNCTION
        showToast('Gerando cobrança no Asaas...', 'info');

        const { data: asaasResult, error: asaasError } = await _supabase.functions.invoke('create-asaas-subscription', {
            body: {
                record: { id: client.id },
                titularData: clientData,
                seller: sellerName // Envia nome do vendedor para metadados se a função suportar
            }
        });

        if (asaasError) {
            console.error('Erro na Edge Function:', asaasError);
            throw new Error('Falha ao conectar com servidor de pagamentos.');
        }

        if (!asaasResult || !asaasResult.success) {
            console.error('Erro Asaas:', asaasResult);
            showToast(asaasResult?.error || 'Erro ao criar assinatura no Asaas.', 'warning');
        }

        const paymentLink = asaasResult?.payment_link;

        // 4. Registro do Histórico Financeiro com Vendedor (Local, para comissões)
        try {
            await _supabase.from('financial_history').insert([{
                client_id: client.id,
                type: 'Receita',
                category: 'Venda de Plano', // Categoria específica
                amount: selectedPlan.price,
                status: 'Pendente',
                description: `Venda Plano ${selectedPlan.name} - Vendedor: ${sellerName}`,
                due_date: new Date().toISOString().split('T')[0]
            }]);
        } catch (finErr) {
            console.warn('Erro ao salvar histórico financeiro local:', finErr);
        }

        showToast('Venda realizada com sucesso!', 'success');

        // 5. Geração do Contrato
        await generateContractPDF(client.id);

        // 6. WhatsApp
        if (paymentLink) {
            const confirmed = await showConfirm(`Venda Concluída! Enviar link de pagamento via WhatsApp?`);

            if (confirmed) {
                const phoneRaw = clientData.telefone || '';
                const phoneClean = phoneRaw.replace(/\D/g, '');

                if (phoneClean) {
                    const phoneFull = phoneClean.length <= 11 ? `55${phoneClean}` : phoneClean;
                    const firstName = clientData.nome.split(' ')[0];
                    const msg = `Olá ${firstName}, seja bem-vindo(a) à Bim Benefícios! Segue o link para pagamento da sua adesão: ${paymentLink}`;
                    const wppUrl = `https://wa.me/${phoneFull}?text=${encodeURIComponent(msg)}`;

                    window.open(wppUrl, '_blank');
                } else {
                    showToast('Cliente sem telefone cadastrado.', 'warning');
                }
            }
        } else if (asaasResult && asaasResult.success && !paymentLink) {
            showToast('Assinatura criada, mas link não gerado imediatamente. Verifique no painel.', 'warning');
        }

        form.reset();
        document.getElementById('vendasDependentesContainer').innerHTML = '';

    } catch (error) {
        console.error('Erro crítico na venda:', error);
        showToast(error.message || 'Erro desconhecido ao processar venda.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Salvar e Gerar Contrato';
    }
}

/**
 * Função para gerar contrato PDF (Cópia local para garantir funcionamento)
 */
export async function generateContractPDF(titularId) {
    try {
        const { data: client } = await _supabase.from('clients').select(`*, dependents(*)`).eq('id', titularId).single();
        if (!client) return;

        const { data: plan } = await _supabase.from('plans').select('contract_text, price').ilike('name', client.plano).maybeSingle();

        let contractText = plan?.contract_text;
        if (!contractText) {
            showToast('Contrato não configurado para este plano.', 'warning');
            return;
        }

        const today = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric' };

        let listaDependentes = "";
        if (client.dependents && client.dependents.length > 0) {
            listaDependentes = client.dependents.map(d => `${d.nome} | CPF: ${d.cpf || 'N/A'}`).join('\n');
        } else {
            listaDependentes = "Nenhum dependente.";
        }

        contractText = contractText
            .replace(/{{NOME_TITULAR}}/g, `${client.nome} ${client.sobrenome}`)
            .replace(/{{CPF_TITULAR}}/g, client.cpf || '')
            .replace(/{{DATA_NASCIMENTO_TITULAR}}/g, client.data_nascimento || '')
            .replace(/{{TELEFONE_TITULAR}}/g, client.telefone || '')
            .replace(/{{ENDERECO_TITULAR}}/g, client.endereco || '')
            .replace(/{{NOME_PLANO}}/g, client.plano || '')
            .replace(/{{VALOR_PLANO}}/g, plan?.price ? `R$ ${plan.price}` : '')
            .replace(/{{LISTA_DEPENDENTES}}/g, listaDependentes)
            .replace(/{{DATA_ATUAL}}/g, today.toLocaleDateString('pt-BR', options));

        if (window.jspdf) {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            doc.setFont("helvetica");
            doc.setFontSize(10);

            const splitText = doc.splitTextToSize(contractText, 180);
            let y = 20;
            for (let i = 0; i < splitText.length; i++) {
                if (y > 280) { doc.addPage(); y = 20; }
                doc.text(splitText[i], 15, y);
                y += 5;
            }
            doc.save(`Contrato_${client.nome}.pdf`);
        }
    } catch (e) {
        console.error("Erro PDF:", e);
    }
}
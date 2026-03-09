import { _supabase } from './supabase.js';
import { showToast, showConfirm } from './utils.js';
import { openModal, closeModal } from './clientes.js'; // Helper for modals

let transacoesPendentes = [];
let currentTransacaoId = null;
let currentPacientePlanoId = null;

export function setupCaixaPage() {
    loadCaixaTransacoes();
    setupEventListeners();
}

function setupEventListeners() {
    document.getElementById('refreshCaixaBtn')?.addEventListener('click', loadCaixaTransacoes);

    const searchInput = document.getElementById('caixaSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const termo = e.target.value.toLowerCase();
            const filtered = transacoesPendentes.filter(t =>
                t.paciente_nome.toLowerCase().includes(termo) ||
                t.tipo_cobranca.toLowerCase().includes(termo)
            );
            renderCaixaTable(filtered);
        });
    }

    document.getElementById('caixaListTable')?.addEventListener('click', handleTabelaClick);
    document.getElementById('btnConfirmarRecebimentoCaixa')?.addEventListener('click', liquidarFatura);
    document.getElementById('fecharCaixaBtn')?.addEventListener('click', calcularEExibirFechamento);

    // Listener para recalcular desconto no Caixa
    document.getElementById('receberCaixaTipoDesconto')?.addEventListener('change', (e) => {
        const inputValor = document.getElementById('receberCaixaValorDesconto');
        if (e.target.value === 'nenhum') {
            inputValor.disabled = true;
            inputValor.value = '0.00';
        } else {
            inputValor.disabled = false;
        }
        recalcularTotalCaixa();
    });

    document.getElementById('receberCaixaValorDesconto')?.addEventListener('input', recalcularTotalCaixa);
}

// Recalcula o total do Caixa no modal
function recalcularTotalCaixa() {
    const inputHidden = document.getElementById('receberCaixaTransacaoId');
    if (!inputHidden || !inputHidden.value) return;

    const valorOriginal = parseFloat(inputHidden.dataset.valorOriginal) || 0;
    const tipoDesconto = document.getElementById('receberCaixaTipoDesconto').value;
    let valorInpDesc = parseFloat(document.getElementById('receberCaixaValorDesconto').value) || 0;

    let desconto = 0;

    if (tipoDesconto === 'percentual') {
        desconto = valorOriginal * (valorInpDesc / 100);
    } else if (tipoDesconto === 'valor') {
        desconto = valorInpDesc;
    }

    if (desconto > valorOriginal) desconto = valorOriginal; // não permite desconto maior que original

    const valorFinal = valorOriginal - desconto;

    document.getElementById('receberCaixaDesconto').textContent = `- ${desconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
    document.getElementById('receberCaixaValorFinal').textContent = valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Atualiza o DOM para uso ao salvar
    inputHidden.dataset.valorFinal = valorFinal;
    inputHidden.dataset.desconto = desconto;
}

async function loadCaixaTransacoes() {
    const tbody = document.getElementById('caixaTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando transações...</td></tr>';

    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const { data, error } = await _supabase
            .from('transacoes_financeiras')
            .select(`
                *,
                clients (
                    id,
                    plano
                )
            `)
            .gte('created_at', hoje.toISOString())
            .order('created_at', { ascending: false });

        if (error) throw error;

        transacoesPendentes = data || [];
        renderCaixaTable(transacoesPendentes);
    } catch (err) {
        console.error("Erro ao carregar caixa:", err);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Erro ao carregar os dados.</td></tr>';
    }
}

function renderCaixaTable(transacoes) {
    const tbody = document.getElementById('caixaTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (transacoes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhuma transação encontrada para hoje.</td></tr>';
        return;
    }

    transacoes.forEach(t => {
        let badgeClass = 'inactive'; // PENDENTE ou CANCELADO
        if (t.status_pagamento === 'PAGO') badgeClass = 'active';

        const dataFormatada = new Date(t.created_at).toLocaleString('pt-BR');

        const valorFinal = parseFloat(t.valor_final).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const desconto = parseFloat(t.desconto_aplicado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dataFormatada}</td>
            <td><strong>${t.paciente_nome}</strong></td>
            <td>${t.tipo_cobranca}</td>
            <td style="color: #e74c3c;">-${desconto}</td>
            <td style="color: #2ecc71; font-weight: bold;">${valorFinal}</td>
            <td><span class="status-badge status-${badgeClass}">${t.status_pagamento}</span></td>
            <td>
                ${t.status_pagamento === 'PENDENTE' ? `
                    <button class="btn btn-small btn-success btn-receber" data-id="${t.id}">
                        <i class="fas fa-hand-holding-usd"></i> Receber
                    </button>
                ` : `
                    <span style="color:var(--gray-medium)"><i class="fas fa-check"></i> Recebido</span>
                `}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function handleTabelaClick(e) {
    const btnReceber = e.target.closest('.btn-receber');
    if (btnReceber) {
        const id = btnReceber.dataset.id;
        abrirModalRecebimento(id);
    }
}

function abrirModalRecebimento(id) {
    const transacao = transacoesPendentes.find(t => t.id === id);
    if (!transacao) return;

    currentTransacaoId = id;

    // Obter dados do plano
    const paciente = transacao.clients;
    const planoNome = paciente && paciente.plano ? paciente.plano : 'Sem Plano / Avulso';

    document.getElementById('receberCaixaTransacaoId').value = id;
    document.getElementById('receberCaixaPacienteNome').textContent = transacao.paciente_nome;
    document.getElementById('receberCaixaPlanoNome').textContent = planoNome;

    const valorOriginal = parseFloat(transacao.valor_original);

    document.getElementById('receberCaixaTransacaoId').dataset.valorOriginal = valorOriginal;
    document.getElementById('receberCaixaValorOriginal').textContent = valorOriginal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Reseta inputs por padrão
    document.getElementById('receberCaixaTipoDesconto').value = 'nenhum';
    document.getElementById('receberCaixaValorDesconto').value = '0.00';
    document.getElementById('receberCaixaValorDesconto').disabled = true;

    // Se for EXAME e tiver um plano elegível, podemos preencher com o desconto sugerido
    if (transacao.tipo_cobranca === 'EXAME' && (planoNome === 'Bim Individual' || planoNome === 'Bim Familiar')) {
        document.getElementById('receberCaixaTipoDesconto').value = 'percentual';
        document.getElementById('receberCaixaValorDesconto').value = '30';
        document.getElementById('receberCaixaValorDesconto').disabled = false;
    }

    // Chama funçao para calcular
    recalcularTotalCaixa();

    document.getElementById('receberCaixaModal').style.display = 'flex';
}

async function liquidarFatura() {
    if (!currentTransacaoId) return;

    const formaPgto = document.getElementById('receberCaixaFormaPgto').value;
    const inputHidden = document.getElementById('receberCaixaTransacaoId');
    const valorFinal = parseFloat(inputHidden.dataset.valorFinal);
    const desconto = parseFloat(inputHidden.dataset.desconto);

    const btn = document.getElementById('btnConfirmarRecebimentoCaixa');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

    try {
        const { error } = await _supabase
            .from('transacoes_financeiras')
            .update({
                status_pagamento: 'PAGO',
                forma_pagamento: formaPgto,
                valor_final: valorFinal,
                desconto_aplicado: desconto,
                data_pagamento: new Date().toISOString()
            })
            .eq('id', currentTransacaoId);

        if (error) throw error;

        showToast('Pagamento recebido com sucesso no Caixa!');
        document.getElementById('receberCaixaModal').style.display = 'none';

        loadCaixaTransacoes(); // Recarrega a tabela

    } catch (err) {
        console.error('Erro ao liquidar fatura:', err);
        showToast('Erro ao processar recebimento: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function calcularEExibirFechamento() {
    const btn = document.getElementById('fecharCaixaBtn');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculando...';
        btn.disabled = true;
    }

    try {
        const hoje = new Date();
        const startOfDay = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
        const endOfDay = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999).toISOString();

        // Pega transações que foram PAGAS hoje (baseado na data_pagamento)
        const { data: transacoesPagas, error } = await _supabase
            .from('transacoes_financeiras')
            .select('valor_final, forma_pagamento')
            .eq('status_pagamento', 'PAGO')
            .gte('data_pagamento', startOfDay)
            .lte('data_pagamento', endOfDay);

        if (error) throw error;

        let totalDinheiro = 0;
        let totalPix = 0;
        let totalCartoes = 0;

        if (transacoesPagas) {
            transacoesPagas.forEach(t => {
                const valor = parseFloat(t.valor_final) || 0;
                if (t.forma_pagamento === 'Dinheiro') {
                    totalDinheiro += valor;
                } else if (t.forma_pagamento === 'PIX') {
                    totalPix += valor;
                } else if (t.forma_pagamento === 'Cartão de Crédito' || t.forma_pagamento === 'Cartão de Débito') {
                    totalCartoes += valor;
                }
            });
        }

        const totalGeral = totalDinheiro + totalPix + totalCartoes;

        const formatarBdToBr = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        document.getElementById('fechamentoTotalDinheiro').textContent = formatarBdToBr(totalDinheiro);
        document.getElementById('fechamentoTotalPix').textContent = formatarBdToBr(totalPix);
        document.getElementById('fechamentoTotalCartoes').textContent = formatarBdToBr(totalCartoes);
        document.getElementById('fechamentoTotalGeral').textContent = formatarBdToBr(totalGeral);

        document.getElementById('fechamentoCaixaModal').style.display = 'flex';

    } catch (err) {
        console.error('Erro ao calcular fechamento de caixa', err);
        showToast('Erro ao calcular fechamento.', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-lock"></i> Fechamento';
            btn.disabled = false;
        }
    }
}

import { _supabase } from './supabase.js';
import { showToast, showConfirm } from './utils.js';

let transacoesPendentes = [];
let currentTransacaoId = null;

export function setupCaixaPage() {
    loadCaixaTransacoes();
    setupEventListeners();
}

function setupEventListeners() {
    document.getElementById('refreshCaixaBtn')?.addEventListener('click', loadCaixaTransacoes);
    document.getElementById('btnCriarPagamento')?.addEventListener('click', abrirModalCriarPagamento);

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
    document.getElementById('receberCaixaValorConsulta')?.addEventListener('input', recalcularTotalCaixa);
    document.getElementById('btnAdicionarFormaPgto')?.addEventListener('click', adicionarFormaPagamento);

    // Criar Pagamento modal
    document.getElementById('btnSalvarCriarPagamento')?.addEventListener('click', salvarCriarPagamento);
    document.getElementById('modoProcedimentoBtn')?.addEventListener('click', () => alternarModoCriarPagamento('procedimento'));
    document.getElementById('modoPedidoExameBtn')?.addEventListener('click', () => alternarModoCriarPagamento('pedido'));

    const clienteSearch = document.getElementById('criarPgtoClienteSearch');
    if (clienteSearch) {
        clienteSearch.addEventListener('input', (e) => buscarClientesCriarPagamento(e.target.value));
        clienteSearch.addEventListener('blur', () => {
            setTimeout(() => {
                const el = document.getElementById('criarPgtoClienteResultados');
                if (el) el.style.display = 'none';
            }, 200);
        });
    }

    const pedidoSearch = document.getElementById('criarPgtoPedidoSearch');
    if (pedidoSearch) {
        pedidoSearch.addEventListener('input', (e) => buscarPedidosExames(e.target.value));
        pedidoSearch.addEventListener('blur', () => {
            setTimeout(() => {
                const el = document.getElementById('criarPgtoPedidoResultados');
                if (el) el.style.display = 'none';
            }, 200);
        });
    }
}

// ─── MULTI-PAGAMENTO ────────────────────────────────────────────────────────

function criarLinhaFormaPagamento(valor = '', metodo = 'PIX', removivel = true) {
    const row = document.createElement('div');
    row.className = 'forma-pgto-row';
    row.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';
    row.innerHTML = `
        <input type="number" class="forma-pgto-valor" placeholder="0.00" step="0.01" min="0"
            value="${valor}" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        <select class="forma-pgto-metodo" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            <option value="PIX" ${metodo === 'PIX' ? 'selected' : ''}>PIX</option>
            <option value="Cartão de Crédito" ${metodo === 'Cartão de Crédito' ? 'selected' : ''}>Cartão de Crédito</option>
            <option value="Cartão de Débito" ${metodo === 'Cartão de Débito' ? 'selected' : ''}>Cartão de Débito</option>
            <option value="Dinheiro" ${metodo === 'Dinheiro' ? 'selected' : ''}>Dinheiro</option>
        </select>
        <button type="button" class="btn btn-danger btn-small btn-remover-forma-pgto" title="Remover"
            style="visibility: ${removivel ? 'visible' : 'hidden'};">
            <i class="fas fa-times"></i>
        </button>
    `;
    row.querySelector('.forma-pgto-valor').addEventListener('input', validarFormasPagamento);
    row.querySelector('.btn-remover-forma-pgto').addEventListener('click', () => {
        row.remove();
        validarFormasPagamento();
        const lista = document.getElementById('formasPagamentoList');
        if (lista && lista.children.length === 1) {
            lista.children[0].querySelector('.btn-remover-forma-pgto').style.visibility = 'hidden';
        }
    });
    return row;
}

function inicializarFormasPagamento(valorTotal) {
    const lista = document.getElementById('formasPagamentoList');
    if (!lista) return;
    lista.innerHTML = '';
    lista.appendChild(criarLinhaFormaPagamento(valorTotal.toFixed(2), 'PIX', false));
    const aviso = document.getElementById('formaPgtoAviso');
    if (aviso) aviso.style.display = 'none';
}

function adicionarFormaPagamento() {
    const lista = document.getElementById('formasPagamentoList');
    if (!lista) return;
    if (lista.children.length === 1) {
        lista.children[0].querySelector('.btn-remover-forma-pgto').style.visibility = 'visible';
    }
    lista.appendChild(criarLinhaFormaPagamento('', 'Dinheiro', true));
    validarFormasPagamento();
}

function validarFormasPagamento() {
    const inputHidden = document.getElementById('receberCaixaTransacaoId');
    const valorFinal = parseFloat(inputHidden?.dataset.valorFinal) || 0;

    const rows = document.querySelectorAll('#formasPagamentoList .forma-pgto-row');
    let totalPago = 0;
    rows.forEach(r => { totalPago += parseFloat(r.querySelector('.forma-pgto-valor').value) || 0; });

    const diff = valorFinal - totalPago;
    const aviso = document.getElementById('formaPgtoAviso');
    if (aviso) {
        if (Math.abs(diff) > 0.01) {
            const msg = diff > 0
                ? `Faltam ${Math.abs(diff).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                : `Excesso de ${Math.abs(diff).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
            aviso.textContent = msg;
            aviso.style.display = 'block';
            aviso.style.background = diff > 0 ? '#fde8e8' : '#fff3cd';
            aviso.style.color = diff > 0 ? '#e74c3c' : '#856404';
        } else {
            aviso.style.display = 'none';
        }
    }
}

function coletarFormasPagamento() {
    const rows = document.querySelectorAll('#formasPagamentoList .forma-pgto-row');
    const formas = [];
    rows.forEach(r => {
        const valor = parseFloat(r.querySelector('.forma-pgto-valor').value) || 0;
        const metodo = r.querySelector('.forma-pgto-metodo').value;
        if (valor > 0) formas.push({ metodo, valor });
    });
    return formas;
}

// ─── CARREGAR E RENDERIZAR ───────────────────────────────────────────────────

async function loadCaixaTransacoes() {
    const tbody = document.getElementById('caixaTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando transações...</td></tr>';

    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const { data, error } = await _supabase
            .from('transacoes_financeiras')
            .select(`*, clients (id, plano)`)
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
        let badgeClass = 'inactive';
        if (t.status_pagamento === 'PAGO') badgeClass = 'active';

        const dataFormatada = new Date(t.created_at).toLocaleString('pt-BR');
        const isConvenio = t.clients && t.clients.plano === 'Convenio';
        const isPendente = t.status_pagamento === 'PENDENTE';

        const desconto = parseFloat(t.desconto_aplicado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        let valorFinalDisplay;
        if (isConvenio && isPendente) {
            valorFinalDisplay = '<span style="color:#856404; font-weight:bold; font-size:0.85rem;">FATURAMENTO</span>';
        } else {
            valorFinalDisplay = `<span style="color: #2ecc71; font-weight: bold;">${parseFloat(t.valor_final).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>`;
        }

        let acoesHtml = '';
        if (isPendente) {
            const btnReceberLabel = isConvenio
                ? '<i class="fas fa-file-invoice"></i> Confirmar Faturamento'
                : '<i class="fas fa-hand-holding-usd"></i> Receber';
            acoesHtml = `
                <button class="btn btn-small btn-receber" data-id="${t.id}" ${isConvenio ? 'style="background:#856404; color:white;"' : ''}>
                    ${btnReceberLabel}
                </button>
                <button class="btn btn-small btn-danger btn-remover" data-id="${t.id}" title="Remover" style="margin-left:4px;">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else if (t.status_pagamento === 'CANCELADO') {
            acoesHtml = '<span style="color:var(--gray-medium)"><i class="fas fa-ban"></i> Cancelado</span>';
        } else {
            acoesHtml = '<span style="color:var(--gray-medium)"><i class="fas fa-check"></i> Recebido</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dataFormatada}</td>
            <td><strong>${t.paciente_nome}</strong></td>
            <td>${t.tipo_cobranca}</td>
            <td style="color: #e74c3c;">-${desconto}</td>
            <td>${valorFinalDisplay}</td>
            <td><span class="status-badge status-${badgeClass}">${t.status_pagamento}</span></td>
            <td>${acoesHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function handleTabelaClick(e) {
    const btnReceber = e.target.closest('.btn-receber');
    const btnRemover = e.target.closest('.btn-remover');

    if (btnReceber) {
        abrirModalRecebimento(btnReceber.dataset.id);
    } else if (btnRemover) {
        const id = btnRemover.dataset.id;
        const transacao = transacoesPendentes.find(t => t.id === id);
        if (!transacao) return;
        const confirmado = await showConfirm(`Remover o pagamento pendente de "${transacao.paciente_nome}"?`);
        if (confirmado) removerTransacao(id);
    }
}

async function removerTransacao(id) {
    try {
        const { error } = await _supabase
            .from('transacoes_financeiras')
            .update({ status_pagamento: 'CANCELADO' })
            .eq('id', id);
        if (error) throw error;
        showToast('Transação removida.');
        loadCaixaTransacoes();
    } catch (err) {
        showToast('Erro ao remover transação: ' + err.message, 'error');
    }
}

// ─── MODAL RECEBER ───────────────────────────────────────────────────────────

function recalcularTotalCaixa() {
    const inputHidden = document.getElementById('receberCaixaTransacaoId');
    if (!inputHidden || !inputHidden.value) return;

    const inputValorConsulta = document.getElementById('receberCaixaValorConsulta');
    const valorOriginal = inputValorConsulta && inputValorConsulta.value !== ''
        ? parseFloat(inputValorConsulta.value) || 0
        : parseFloat(inputHidden.dataset.valorOriginal) || 0;
    const tipoDesconto = document.getElementById('receberCaixaTipoDesconto').value;
    let valorInpDesc = parseFloat(document.getElementById('receberCaixaValorDesconto').value) || 0;

    let desconto = 0;
    if (tipoDesconto === 'percentual') {
        desconto = valorOriginal * (valorInpDesc / 100);
    } else if (tipoDesconto === 'valor') {
        desconto = valorInpDesc;
    }
    if (desconto > valorOriginal) desconto = valorOriginal;

    const valorFinal = valorOriginal - desconto;

    document.getElementById('receberCaixaDesconto').textContent = `- ${desconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
    document.getElementById('receberCaixaValorFinal').textContent = valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    inputHidden.dataset.valorFinal = valorFinal;
    inputHidden.dataset.desconto = desconto;

    // Atualiza a 1ª linha de pagamento se houver só uma
    const lista = document.getElementById('formasPagamentoList');
    if (lista && lista.children.length === 1) {
        lista.children[0].querySelector('.forma-pgto-valor').value = valorFinal.toFixed(2);
    }
    validarFormasPagamento();
}

function abrirModalRecebimento(id) {
    const transacao = transacoesPendentes.find(t => t.id === id);
    if (!transacao) return;

    currentTransacaoId = id;

    const paciente = transacao.clients;
    const planoNome = paciente && paciente.plano ? paciente.plano : 'Sem Plano / Avulso';
    const isConvenio = planoNome === 'Convenio';

    document.getElementById('receberCaixaTransacaoId').value = id;
    document.getElementById('receberCaixaPacienteNome').textContent = transacao.paciente_nome;
    document.getElementById('receberCaixaPlanoNome').textContent = planoNome;

    const valorOriginal = parseFloat(transacao.valor_original);
    document.getElementById('receberCaixaTransacaoId').dataset.valorOriginal = valorOriginal;
    document.getElementById('receberCaixaValorOriginal').textContent = valorOriginal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('receberCaixaValorConsulta').value = valorOriginal.toFixed(2);

    document.getElementById('receberCaixaTipoDesconto').value = 'nenhum';
    document.getElementById('receberCaixaValorDesconto').value = '0.00';
    document.getElementById('receberCaixaValorDesconto').disabled = true;

    if (transacao.tipo_cobranca === 'EXAME' && (planoNome === 'Bim Individual' || planoNome === 'Bim Familiar')) {
        document.getElementById('receberCaixaTipoDesconto').value = 'percentual';
        document.getElementById('receberCaixaValorDesconto').value = '30';
        document.getElementById('receberCaixaValorDesconto').disabled = false;
    }

    recalcularTotalCaixa();

    const convenioMsg = document.getElementById('convenioFaturamentoMsg');
    const formaPgtoContainer = document.getElementById('formaPgtoContainer');

    if (isConvenio) {
        if (convenioMsg) convenioMsg.style.display = 'block';
        if (formaPgtoContainer) formaPgtoContainer.style.display = 'none';
    } else {
        if (convenioMsg) convenioMsg.style.display = 'none';
        if (formaPgtoContainer) formaPgtoContainer.style.display = 'block';
        const valorFinal = parseFloat(document.getElementById('receberCaixaTransacaoId').dataset.valorFinal || valorOriginal);
        inicializarFormasPagamento(valorFinal);
    }

    document.getElementById('receberCaixaModal').style.display = 'flex';
}

async function liquidarFatura() {
    if (!currentTransacaoId) return;

    const inputHidden = document.getElementById('receberCaixaTransacaoId');
    const valorFinal = parseFloat(inputHidden.dataset.valorFinal);
    const desconto = parseFloat(inputHidden.dataset.desconto);

    const transacao = transacoesPendentes.find(t => t.id === currentTransacaoId);
    const isConvenio = transacao?.clients?.plano === 'Convenio';

    let formasPagamento;
    if (isConvenio) {
        formasPagamento = 'Faturamento Convênio';
    } else {
        const formas = coletarFormasPagamento();
        if (formas.length === 0) {
            showToast('Informe ao menos uma forma de pagamento.', 'error');
            return;
        }
        const totalPago = formas.reduce((s, f) => s + f.valor, 0);
        if (Math.abs(totalPago - valorFinal) > 0.01) {
            showToast(`O total das formas de pagamento (${totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) não confere com o valor final.`, 'error');
            return;
        }
        formasPagamento = formas.length === 1 ? formas[0].metodo : JSON.stringify(formas);
    }

    const btn = document.getElementById('btnConfirmarRecebimentoCaixa');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

    try {
        const { error } = await _supabase
            .from('transacoes_financeiras')
            .update({
                status_pagamento: 'PAGO',
                forma_pagamento: formasPagamento,
                valor_final: valorFinal,
                desconto_aplicado: desconto,
                data_pagamento: new Date().toISOString()
            })
            .eq('id', currentTransacaoId);

        if (error) throw error;

        showToast(isConvenio ? 'Faturamento ao convênio registrado!' : 'Pagamento recebido com sucesso!');
        document.getElementById('receberCaixaModal').style.display = 'none';
        loadCaixaTransacoes();
    } catch (err) {
        console.error('Erro ao liquidar fatura:', err);
        showToast('Erro ao processar recebimento: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ─── FECHAMENTO ──────────────────────────────────────────────────────────────

async function calcularEExibirFechamento() {
    const btn = document.getElementById('fecharCaixaBtn');
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculando...'; btn.disabled = true; }

    try {
        const hoje = new Date();
        const startOfDay = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();
        const endOfDay = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999).toISOString();

        const { data: transacoesPagas, error } = await _supabase
            .from('transacoes_financeiras')
            .select('valor_final, forma_pagamento, paciente_nome, tipo_cobranca')
            .eq('status_pagamento', 'PAGO')
            .gte('data_pagamento', startOfDay)
            .lte('data_pagamento', endOfDay);

        if (error) throw error;

        let totalDinheiro = 0, totalPix = 0, totalCartoes = 0;
        const convenioItems = [];

        (transacoesPagas || []).forEach(t => {
            if (t.forma_pagamento === 'Faturamento Convênio') {
                convenioItems.push(t);
                return;
            }

            // forma_pagamento pode ser JSON (multi-pagamento) ou string simples
            let formas = [];
            try {
                const parsed = JSON.parse(t.forma_pagamento);
                if (Array.isArray(parsed)) formas = parsed;
                else formas = [{ metodo: t.forma_pagamento, valor: parseFloat(t.valor_final) || 0 }];
            } catch {
                formas = [{ metodo: t.forma_pagamento, valor: parseFloat(t.valor_final) || 0 }];
            }

            formas.forEach(f => {
                const val = parseFloat(f.valor) || 0;
                if (f.metodo === 'Dinheiro') totalDinheiro += val;
                else if (f.metodo === 'PIX') totalPix += val;
                else if (f.metodo === 'Cartão de Crédito' || f.metodo === 'Cartão de Débito') totalCartoes += val;
            });
        });

        const totalGeral = totalDinheiro + totalPix + totalCartoes;
        const fmt = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        document.getElementById('fechamentoTotalDinheiro').textContent = fmt(totalDinheiro);
        document.getElementById('fechamentoTotalPix').textContent = fmt(totalPix);
        document.getElementById('fechamentoTotalCartoes').textContent = fmt(totalCartoes);
        document.getElementById('fechamentoTotalGeral').textContent = fmt(totalGeral);

        // Seção convênio
        const convenioSection = document.getElementById('fechamentoConvenioSection');
        const convenioLista = document.getElementById('fechamentoConvenioLista');
        const convenioCount = document.getElementById('fechamentoConvenioCount');
        if (convenioSection && convenioLista) {
            if (convenioItems.length > 0) {
                convenioSection.style.display = 'block';
                if (convenioCount) convenioCount.textContent = convenioItems.length;
                convenioLista.innerHTML = convenioItems.map(c =>
                    `<div style="padding: 4px 0; border-bottom: 1px solid #ffe082;">
                        <strong>${c.paciente_nome}</strong> — ${c.tipo_cobranca}
                    </div>`
                ).join('');
            } else {
                convenioSection.style.display = 'none';
            }
        }

        document.getElementById('fechamentoCaixaModal').style.display = 'flex';
    } catch (err) {
        console.error('Erro ao calcular fechamento de caixa', err);
        showToast('Erro ao calcular fechamento.', 'error');
    } finally {
        if (btn) { btn.innerHTML = '<i class="fas fa-lock"></i> Fechamento'; btn.disabled = false; }
    }
}

// ─── CRIAR PAGAMENTO ─────────────────────────────────────────────────────────

let modoAtualCriarPagamento = 'procedimento'; // 'procedimento' | 'pedido'

function alternarModoCriarPagamento(modo) {
    modoAtualCriarPagamento = modo;
    const secProc = document.getElementById('secaoProcedimentoAvulso');
    const secPedido = document.getElementById('secaoPedidoExame');
    const btnProc = document.getElementById('modoProcedimentoBtn');
    const btnPedido = document.getElementById('modoPedidoExameBtn');

    if (modo === 'procedimento') {
        secProc.style.display = 'block';
        secPedido.style.display = 'none';
        btnProc.className = 'btn btn-primary btn-small';
        btnPedido.className = 'btn btn-secondary btn-small';
        btnProc.style.flex = '1';
        btnPedido.style.flex = '1';
    } else {
        secProc.style.display = 'none';
        secPedido.style.display = 'block';
        btnProc.className = 'btn btn-secondary btn-small';
        btnPedido.className = 'btn btn-primary btn-small';
        btnProc.style.flex = '1';
        btnPedido.style.flex = '1';
    }
}

async function abrirModalCriarPagamento() {
    // Reset procedimento avulso
    document.getElementById('criarPgtoClienteSearch').value = '';
    document.getElementById('criarPgtoClienteId').value = '';
    document.getElementById('criarPgtoClienteSelecionado').textContent = '';
    document.getElementById('criarPgtoProcedimento').value = '';
    document.getElementById('criarPgtoValor').value = '';

    // Reset pedido de exames
    document.getElementById('criarPgtoPedidoSearch').value = '';
    document.getElementById('criarPgtoPedidoId').value = '';
    document.getElementById('criarPgtoPedidoClienteId').value = '';
    document.getElementById('criarPgtoPedidoClienteNome').value = '';
    document.getElementById('criarPgtoExamesContainer').style.display = 'none';
    document.getElementById('criarPgtoExamesLista').innerHTML = '';

    // Inicia no modo procedimento
    alternarModoCriarPagamento('procedimento');

    const selectProf = document.getElementById('criarPgtoProfissionalId');
    if (selectProf) {
        selectProf.innerHTML = '<option value="">Selecione...</option>';
        try {
            const { data: profs } = await _supabase.from('professionals').select('id, name').order('name');
            (profs || []).forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                selectProf.appendChild(opt);
            });
        } catch (e) {
            console.warn('Erro ao carregar profissionais:', e);
        }
    }

    document.getElementById('criarPagamentoModal').style.display = 'flex';
}

async function buscarClientesCriarPagamento(termo) {
    const resultadosEl = document.getElementById('criarPgtoClienteResultados');
    if (!resultadosEl) return;

    if (!termo || termo.length < 2) {
        resultadosEl.style.display = 'none';
        return;
    }

    try {
        const palavras = termo.trim().split(/\s+/).filter(w => w.length > 0);
        const filtro = palavras.map(w => `or(nome.ilike.%${w}%,sobrenome.ilike.%${w}%)`).join(',');

        const [titularesRes, dependentesRes] = await Promise.all([
            _supabase.from('clients').select('id, nome, sobrenome, plano').or(filtro).limit(6),
            _supabase.from('dependents').select('id, nome, sobrenome, titular_id, clients!inner(nome, sobrenome, plano)').or(filtro).limit(6)
        ]);

        const resultados = [
            ...(titularesRes.data || []).map(c => ({
                clienteId: c.id,
                nomeCompleto: `${c.nome} ${c.sobrenome || ''}`.trim(),
                plano: c.plano || 'Sem plano',
                label: ''
            })),
            ...(dependentesRes.data || []).map(d => {
                const titularNome = d.clients ? `${d.clients.nome} ${d.clients.sobrenome || ''}`.trim() : '';
                return {
                    clienteId: d.titular_id,
                    nomeCompleto: `${d.nome} ${d.sobrenome || ''}`.trim(),
                    plano: d.clients?.plano || 'Sem plano',
                    label: titularNome ? `Dependente de ${titularNome}` : 'Dependente'
                };
            })
        ];

        resultadosEl.innerHTML = '';
        if (resultados.length === 0) {
            resultadosEl.innerHTML = '<div style="padding:8px; color: var(--gray-medium);">Nenhum paciente encontrado.</div>';
            resultadosEl.style.display = 'block';
            return;
        }

        resultados.forEach(r => {
            const item = document.createElement('div');
            item.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee;';
            item.innerHTML = `
                <strong>${r.nomeCompleto}</strong>
                <small style="color:var(--gray-medium); margin-left:8px;">${r.plano}</small>
                ${r.label ? `<br><small style="color:#856404;">${r.label}</small>` : ''}
            `;
            item.addEventListener('mouseover', () => item.style.background = '#f5f5f5');
            item.addEventListener('mouseout', () => item.style.background = '');
            item.addEventListener('click', () => {
                document.getElementById('criarPgtoClienteId').value = r.clienteId;
                document.getElementById('criarPgtoClienteSearch').value = r.nomeCompleto;
                document.getElementById('criarPgtoClienteSelecionado').textContent =
                    `✓ ${r.nomeCompleto}${r.label ? ` (${r.label})` : ''} — Plano: ${r.plano}`;
                resultadosEl.style.display = 'none';
            });
            resultadosEl.appendChild(item);
        });
        resultadosEl.style.display = 'block';
    } catch (err) {
        console.error('Erro ao buscar clientes:', err);
    }
}

async function salvarCriarPagamento() {
    const btn = document.getElementById('btnSalvarCriarPagamento');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...';

    try {
        const { data: { user } } = await _supabase.auth.getUser();

        if (modoAtualCriarPagamento === 'pedido') {
            await salvarPagamentoPedidoExame(user.id);
        } else {
            await salvarPagamentoProcedimentoAvulso(user.id);
        }

        showToast('Pagamento criado com sucesso!');
        document.getElementById('criarPagamentoModal').style.display = 'none';
        loadCaixaTransacoes();
    } catch (err) {
        console.error('Erro ao criar pagamento:', err);
        showToast('Erro ao criar pagamento: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function salvarPagamentoProcedimentoAvulso(userId) {
    const clienteId = document.getElementById('criarPgtoClienteId').value;
    const clienteNome = document.getElementById('criarPgtoClienteSearch').value.trim();
    const profissionalId = document.getElementById('criarPgtoProfissionalId').value;
    const procedimento = document.getElementById('criarPgtoProcedimento').value.trim();
    const valor = parseFloat(document.getElementById('criarPgtoValor').value) || 0;

    if (!clienteId) throw new Error('Selecione um paciente.');
    if (!procedimento) throw new Error('Informe o procedimento.');
    if (valor <= 0) throw new Error('Informe um valor válido.');

    const { error } = await _supabase.from('transacoes_financeiras').insert({
        paciente_id: clienteId,
        paciente_nome: clienteNome,
        tipo_cobranca: procedimento.toUpperCase(),
        valor_original: valor,
        desconto_aplicado: 0,
        valor_final: valor,
        status_pagamento: 'PENDENTE',
        created_by: userId,
        ...(profissionalId ? { professional_id: profissionalId } : {})
    });
    if (error) throw error;
}

async function salvarPagamentoPedidoExame(userId) {
    const pedidoId = document.getElementById('criarPgtoPedidoId').value;
    const clienteId = document.getElementById('criarPgtoPedidoClienteId').value;
    const clienteNome = document.getElementById('criarPgtoPedidoClienteNome').value;

    if (!pedidoId) throw new Error('Selecione um pedido de exame.');

    // Coleta exames marcados e desmarcados
    const checkboxes = document.querySelectorAll('#criarPgtoExamesLista .exame-check');
    const examesMarcados = [];
    const examesRemovidos = [];

    checkboxes.forEach(cb => {
        const exame = JSON.parse(cb.dataset.exame);
        if (cb.checked) examesMarcados.push(exame);
        else examesRemovidos.push(exame);
    });

    if (examesMarcados.length === 0) throw new Error('Selecione ao menos um exame para cobrar.');

    const valorTotal = examesMarcados.reduce((s, e) => s + parseFloat(e.value || 0), 0);
    const nomesExames = examesMarcados.map(e => e.name).join(', ');

    // Cria a transação financeira
    const { error: txError } = await _supabase.from('transacoes_financeiras').insert({
        paciente_id: clienteId || null,
        paciente_nome: clienteNome,
        tipo_cobranca: 'EXAME',
        valor_original: valorTotal,
        desconto_aplicado: 0,
        valor_final: valorTotal,
        status_pagamento: 'PENDENTE',
        created_by: userId
    });
    if (txError) throw txError;

    // Se há exames removidos, atualiza o pedido (remove esses exames da lista)
    if (examesRemovidos.length > 0) {
        // Busca o pedido atual para obter as listas completas
        const { data: pedido, error: pedidoErr } = await _supabase
            .from('pedidos_exames')
            .select('exames_lab_solicitados, exames_img_solicitados')
            .eq('id', pedidoId)
            .single();
        if (pedidoErr) throw pedidoErr;

        const idsRemovidos = new Set(examesRemovidos.map(e => String(e.id)));

        let labs = parseExameJson(pedido.exames_lab_solicitados);
        let imgs = parseExameJson(pedido.exames_img_solicitados);

        labs = labs.filter(e => !idsRemovidos.has(String(e.id)));
        imgs = imgs.filter(e => !idsRemovidos.has(String(e.id)));

        const { error: updErr } = await _supabase
            .from('pedidos_exames')
            .update({
                exames_lab_solicitados: JSON.stringify(labs),
                exames_img_solicitados: JSON.stringify(imgs)
            })
            .eq('id', pedidoId);
        if (updErr) throw updErr;
    }
}

// ─── BUSCA PEDIDOS DE EXAMES ─────────────────────────────────────────────────

function parseExameJson(raw) {
    if (!raw) return [];
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; }
}

async function buscarPedidosExames(termo) {
    const resultadosEl = document.getElementById('criarPgtoPedidoResultados');
    if (!resultadosEl) return;

    if (!termo || termo.length < 2) {
        resultadosEl.style.display = 'none';
        return;
    }

    try {
        const { data, error } = await _supabase
            .from('pedidos_exames')
            .select('id, paciente_nome, paciente_cpf, medico_nome, created_at, exames_lab_solicitados, exames_img_solicitados, atendimento_id')
            .eq('status', 'Pendente')
            .ilike('paciente_nome', `%${termo}%`)
            .order('created_at', { ascending: false })
            .limit(8);

        if (error) throw error;

        resultadosEl.innerHTML = '';
        if (!data || data.length === 0) {
            resultadosEl.innerHTML = '<div style="padding:8px; color:var(--gray-medium);">Nenhum pedido pendente encontrado.</div>';
            resultadosEl.style.display = 'block';
            return;
        }

        data.forEach(p => {
            const labs = parseExameJson(p.exames_lab_solicitados);
            const imgs = parseExameJson(p.exames_img_solicitados);
            const total = labs.length + imgs.length;
            const data_ = new Date(p.created_at).toLocaleDateString('pt-BR');

            const item = document.createElement('div');
            item.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee;';
            item.innerHTML = `
                <strong>${p.paciente_nome}</strong>
                <small style="color:var(--gray-medium); margin-left:8px;">${data_} — ${total} exame(s)</small>
                <br><small style="color:#666;">Médico: ${p.medico_nome}</small>
            `;
            item.addEventListener('mouseover', () => item.style.background = '#f5f5f5');
            item.addEventListener('mouseout', () => item.style.background = '');
            item.addEventListener('click', () => selecionarPedidoExame(p));
            resultadosEl.appendChild(item);
        });
        resultadosEl.style.display = 'block';
    } catch (err) {
        console.error('Erro ao buscar pedidos:', err);
    }
}

async function selecionarPedidoExame(pedido) {
    const resultadosEl = document.getElementById('criarPgtoPedidoResultados');
    if (resultadosEl) resultadosEl.style.display = 'none';

    document.getElementById('criarPgtoPedidoSearch').value = pedido.paciente_nome;
    document.getElementById('criarPgtoPedidoId').value = pedido.id;
    document.getElementById('criarPgtoPedidoClienteNome').value = pedido.paciente_nome;

    // Tenta buscar o client_id via atendimento
    let clienteId = '';
    if (pedido.atendimento_id) {
        const { data: appt } = await _supabase
            .from('appointments')
            .select('client_id')
            .eq('id', pedido.atendimento_id)
            .single();
        if (appt) clienteId = appt.client_id;
    }
    document.getElementById('criarPgtoPedidoClienteId').value = clienteId;

    // Monta lista de exames
    const labs = parseExameJson(pedido.exames_lab_solicitados);
    const imgs = parseExameJson(pedido.exames_img_solicitados);
    const todosExames = [
        ...labs.map(e => ({ ...e, tipo: 'Lab' })),
        ...imgs.map(e => ({ ...e, value: e.value || 0, tipo: 'Img' }))
    ];

    const lista = document.getElementById('criarPgtoExamesLista');
    lista.innerHTML = '';

    todosExames.forEach((exame, idx) => {
        const valor = parseFloat(exame.value || 0);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:6px 4px; border-bottom:1px solid #f0f0f0;';
        row.innerHTML = `
            <input type="checkbox" class="exame-check" id="exame_${idx}" checked
                data-exame='${JSON.stringify(exame).replace(/'/g, "&#39;")}'>
            <label for="exame_${idx}" style="flex:1; cursor:pointer; margin:0;">
                ${exame.name}
                <small style="color:var(--gray-medium); margin-left:6px;">[${exame.tipo}]</small>
            </label>
            <span style="color:#2ecc71; font-weight:bold; white-space:nowrap;">
                ${valor > 0 ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'S/ valor'}
            </span>
        `;
        row.querySelector('.exame-check').addEventListener('change', recalcularTotalExamesPedido);
        lista.appendChild(row);
    });

    recalcularTotalExamesPedido();
    document.getElementById('criarPgtoExamesContainer').style.display = 'block';
}

function recalcularTotalExamesPedido() {
    const checkboxes = document.querySelectorAll('#criarPgtoExamesLista .exame-check');
    let total = 0;
    checkboxes.forEach(cb => {
        if (cb.checked) {
            const exame = JSON.parse(cb.dataset.exame);
            total += parseFloat(exame.value || 0);
        }
    });
    const totalEl = document.getElementById('criarPgtoExamesTotal');
    if (totalEl) totalEl.textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

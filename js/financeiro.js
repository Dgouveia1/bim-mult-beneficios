import { _supabase } from './supabase.js';
import { showToast } from './utils.js';

// --- ELEMENTOS ---
const searchInput = document.getElementById('financialSearchInput');
const resultsContainer = document.getElementById('financialSearchResults');
const financialModal = document.getElementById('financialClientModal');
const financialWorkspace = document.getElementById('financialWorkspace');

// --- ESTADO ---
let currentFinancialClient = null;
let currentFinancialData = [];

// --- FUNÇÃO PRINCIPAL DE BUSCA ---
async function setupFinanceiroPage() {
    // Injeta os botões de alternância se não existirem
    injectTabControls();

    if (!searchInput) return;

    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const term = e.target.value.trim();

        if (term.length < 3) {
            resultsContainer.style.display = 'none';
            return;
        }

        debounceTimer = setTimeout(() => searchTitular(term), 400);
    });

}

function injectTabControls() {
    const card = document.querySelector('#financeiroPage .card');
    if (!card || card.querySelector('.finance-tabs')) return;

    const tabsHtml = `
        <div class="finance-tabs" style="display: flex; gap: 15px; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px; flex-wrap: wrap; align-items: center;">
            <button class="btn btn-secondary active" id="tabIndividualSearch">Busca Individual</button>
            <button class="btn btn-secondary" id="tabOverdueList" style="background-color: #fce4ec; color: #c62828; border: 1px solid #c62828;">
                <i class="fas fa-exclamation-circle"></i> Clientes em Atraso (Geral)
            </button>
            <button class="btn btn-secondary" id="tabInvoiceOverview">
                <i class="fas fa-chart-bar"></i> Visão Geral Faturas
            </button>
            <button id="btnDownloadOpenReport" class="btn" style="margin-left:auto; background:#1d6f42; color:#fff; display:flex; align-items:center; gap:8px;">
                <i class="fas fa-file-csv"></i> Relatório Cobranças
            </button>
        </div>
        <div id="overdueListContainer" style="display: none;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
                <h3 style="color: #c62828; margin: 0;">Clientes em Atraso (Geral)</h3>
                <button id="btnDownloadOverdueExcel" class="btn" style="background:#1d6f42; color:#fff; display:flex; align-items:center; gap:8px;">
                    <i class="fas fa-file-excel"></i> Baixar Excel
                </button>
            </div>
            <div id="overdueSummaryPanel" style="display:flex; gap:20px; margin-bottom:20px; flex-wrap:wrap;"></div>
            <div id="overdueStatusMsg" style="text-align:center; padding:20px; color:#888;"></div>
        </div>
        <div id="invoiceOverviewContainer" style="display: none;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
                <h3 style="color: var(--secondary-dark); margin: 0;"><i class="fas fa-chart-bar"></i> Visão Geral — Faturas por Dia de Vencimento</h3>
                <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <select id="filterPaymentMethod" style="padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; font-size: 0.9rem;">
                        <option value="ALL">Todos os meios</option>
                        <option value="PIX">PIX</option>
                        <option value="BOLETO">Boleto</option>
                        <option value="CREDIT_CARD">Cartão de Crédito</option>
                    </select>
                    <select id="filterInvoiceStatus" style="padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; font-size: 0.9rem;">
                        <option value="ALL">Todos os status</option>
                        <option value="PENDING">Apenas Pendentes</option>
                        <option value="OVERDUE">Apenas em Atraso</option>
                    </select>
                    <button id="btnGenerateInvoiceList" class="btn" style="background:#1d6f42; color:#fff; display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-file-excel"></i> Gerar Lista
                    </button>
                </div>
            </div>
            <div id="invoiceOverviewSummary" style="display:flex; gap:20px; margin-bottom:20px; flex-wrap:wrap;"></div>
            <div id="invoiceOverviewCards" class="invoice-overview-grid"></div>
            <div id="invoiceOverviewStatus" style="text-align:center; padding:20px; color:#888;"></div>
        </div>
    `;

    const title = card.querySelector('.card-title');
    title.insertAdjacentHTML('beforebegin', tabsHtml);

    document.getElementById('tabIndividualSearch').addEventListener('click', (e) => switchTab('individual', e.target));
    document.getElementById('tabOverdueList').addEventListener('click', (e) => switchTab('overdue', e.target));
    document.getElementById('tabInvoiceOverview').addEventListener('click', (e) => switchTab('overview', e.target));
    document.getElementById('btnDownloadOverdueExcel').addEventListener('click', downloadOverdueExcel);
    document.getElementById('btnDownloadOpenReport').addEventListener('click', downloadOpenInvoicesReport);
    document.getElementById('btnGenerateInvoiceList').addEventListener('click', downloadInvoiceList);
    document.getElementById('filterPaymentMethod').addEventListener('change', applyOverviewFilter);
    document.getElementById('filterInvoiceStatus').addEventListener('change', applyOverviewFilter);
}

function switchTab(tab, btn) {
    // Atualiza estilo dos botões (não aplica active no botão de relatório)
    document.querySelectorAll('.finance-tabs .btn').forEach(b => {
        if (b.id !== 'btnDownloadOpenReport') b.classList.remove('active');
    });
    if (btn.id !== 'btnDownloadOpenReport') btn.classList.add('active');

    const searchSection = document.querySelector('#financeiroPage .card-title');
    const searchInputDiv = document.querySelector('#financeiroPage .search-container');
    const overdueContainer = document.getElementById('overdueListContainer');
    const overviewContainer = document.getElementById('invoiceOverviewContainer');

    // Esconde tudo primeiro
    searchSection.style.display = 'none';
    searchInputDiv.style.display = 'none';
    overdueContainer.style.display = 'none';
    overviewContainer.style.display = 'none';
    resultsContainer.style.display = 'none';

    if (tab === 'individual') {
        searchSection.style.display = 'block';
        searchInputDiv.style.display = 'flex';
    } else if (tab === 'overdue') {
        overdueContainer.style.display = 'block';
        loadOverdueClients();
    } else if (tab === 'overview') {
        overviewContainer.style.display = 'block';
        loadInvoiceOverview();
    }
}

// =================================================================
// CLIENTES EM ATRASO — estado compartilhado entre load e export
// =================================================================
let _overdueData = [];

async function loadOverdueClients() {
    const summaryPanel = document.getElementById('overdueSummaryPanel');
    const statusMsg = document.getElementById('overdueStatusMsg');
    summaryPanel.innerHTML = '<span style="color:#888;">Carregando...</span>';
    statusMsg.textContent = '';

    try {
        const { data, error } = await _supabase
            .from('view_clients_overdue')
            .select('*')
            .order('data_vencimento', { ascending: true });

        if (error) throw error;

        _overdueData = data || [];

        if (_overdueData.length === 0) {
            summaryPanel.innerHTML = '';
            statusMsg.innerHTML = '<i class="fas fa-check-circle" style="color:green;"></i> Nenhum cliente em atraso no momento!';
            return;
        }

        const totalClientes = _overdueData.length;
        const totalValor = _overdueData.reduce((sum, r) => sum + (parseFloat(r.valor) || 0), 0)
            .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        summaryPanel.innerHTML = `
            <div style="background:#fce4ec; border:1px solid #c62828; border-radius:8px; padding:18px 28px; min-width:180px; text-align:center;">
                <div style="font-size:2rem; font-weight:bold; color:#c62828;">${totalClientes}</div>
                <div style="color:#555; font-size:0.9rem; margin-top:4px;">Clientes em Atraso</div>
            </div>
            <div style="background:#fff3e0; border:1px solid #e65100; border-radius:8px; padding:18px 28px; min-width:180px; text-align:center;">
                <div style="font-size:1.5rem; font-weight:bold; color:#e65100;">${totalValor}</div>
                <div style="color:#555; font-size:0.9rem; margin-top:4px;">Valor Total Vencido</div>
            </div>
        `;
        statusMsg.textContent = '';

    } catch (error) {
        console.error('Erro ao carregar inadimplentes:', error);
        summaryPanel.innerHTML = `<span style="color:red;">Erro: ${error.message}</span>`;
    }
}

// =================================================================
// HELPER CSV (reutilizável)
// =================================================================
function downloadCSV(headers, rows, filenamePrefix) {
    const sep = ';';
    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(sep))
        .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `${filenamePrefix}_${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Download iniciado!', 'success');
}

// =================================================================
// TRADUTORES
// =================================================================
function translatePaymentMethod(method) {
    if (!method) return 'Não definido';
    const map = {
        'BOLETO': 'Boleto',
        'PIX': 'PIX',
        'CREDIT_CARD': 'Cartão de Crédito',
        'DEBIT_CARD': 'Cartão de Débito',
        'UNDEFINED': 'Não definido'
    };
    return map[method.toUpperCase()] || method;
}

function translateStatus(status) {
    if (!status) return 'Pendente';
    const map = {
        'PENDING': 'Pendente',
        'OVERDUE': 'Vencida',
        'CONFIRMED': 'Confirmado',
        'RECEIVED': 'Recebido',
        'RECEIVED_IN_CASH': 'Recebido em Dinheiro',
        'REFUNDED': 'Estornado',
        'REFUND_REQUESTED': 'Estorno Solicitado',
        'CHARGEBACK_DISPUTE': 'Disputa',
        'DUNNING_REQUESTED': 'Em Negativação',
        'AWAITING_RISK_ANALYSIS': 'Análise de Risco'
    };
    return map[status.toUpperCase()] || status;
}

// =================================================================
// EXPORTAR EXCEL (CSV UTF-8 abrível no Excel)
// =================================================================
function downloadOverdueExcel() {
    if (!_overdueData || _overdueData.length === 0) {
        showToast('Nenhum dado para exportar. Abra a aba primeiro.', 'warning');
        return;
    }

    const headers = ['Nome', 'Sobrenome', 'CPF', 'Telefone', 'Plano', 'Valor Vencido (R$)', 'Vencimento', 'Link Boleto'];

    const rows = _overdueData.map(r => [
        r.nome ?? '',
        r.sobrenome ?? '',
        r.cpf ?? '',
        r.telefone ?? '',
        r.plano ?? '',
        (parseFloat(r.valor) || 0).toFixed(2).replace('.', ','),
        r.data_vencimento ? new Date(r.data_vencimento).toLocaleDateString('pt-BR') : '',
        r.link_boleto ?? ''
    ]);

    downloadCSV(headers, rows, 'clientes_atraso');
}

// =================================================================
// FEATURE 1: RELATÓRIO DE COBRANÇAS ABERTAS
// =================================================================
async function downloadOpenInvoicesReport() {
    showToast('Gerando relatório...', 'info');

    try {
        const { data, error } = await _supabase
            .from('asaas_payments')
            .select('due_date, status, invoice_url, payment_method, client_id, clients(nome, sobrenome, telefone)')
            .not('status', 'in', '("RECEIVED","RECEIVED_IN_CASH","DELETED")')
            .order('due_date', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            showToast('Nenhuma cobrança em aberto encontrada.', 'warning');
            return;
        }

        const headers = ['Cliente', 'Telefone', 'Data Vencimento', 'Status', 'Link Fatura', 'Meio Pagamento'];

        const rows = data.map(r => [
            r.clients ? `${r.clients.nome || ''} ${r.clients.sobrenome || ''}`.trim() : '',
            r.clients?.telefone ?? '',
            r.due_date ? new Date(r.due_date).toLocaleDateString('pt-BR') : '',
            translateStatus(r.status),
            r.invoice_url ?? '',
            translatePaymentMethod(r.payment_method)
        ]);

        downloadCSV(headers, rows, 'relatorio_cobrancas');
    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        showToast('Erro ao gerar relatório: ' + error.message, 'error');
    }
}

// =================================================================
// FEATURE 2: VISÃO GERAL DE FATURAS POR DIA DE VENCIMENTO
// =================================================================
let _invoiceOverviewData = [];
let _invoiceOverviewFiltered = [];

async function loadInvoiceOverview() {
    const summary = document.getElementById('invoiceOverviewSummary');
    const cards = document.getElementById('invoiceOverviewCards');
    const status = document.getElementById('invoiceOverviewStatus');
    summary.innerHTML = '<span style="color:#888;">Carregando...</span>';
    cards.innerHTML = '';
    status.textContent = '';

    try {
        const { data, error } = await _supabase
            .from('asaas_payments')
            .select('due_date, status, invoice_url, payment_method, amount, client_id, clients(nome, sobrenome, telefone)')
            .not('status', 'in', '("RECEIVED","RECEIVED_IN_CASH","DELETED")')
            .order('due_date', { ascending: true });

        if (error) throw error;

        _invoiceOverviewData = data || [];
        applyOverviewFilter();
    } catch (error) {
        console.error('Erro ao carregar visão geral:', error);
        summary.innerHTML = `<span style="color:red;">Erro: ${error.message}</span>`;
    }
}

function applyOverviewFilter() {
    const filterPayment = document.getElementById('filterPaymentMethod').value;
    const filterStatus = document.getElementById('filterInvoiceStatus').value;
    const summary = document.getElementById('invoiceOverviewSummary');
    const cardsContainer = document.getElementById('invoiceOverviewCards');
    const status = document.getElementById('invoiceOverviewStatus');

    // Filtrar por meio de pagamento + status
    _invoiceOverviewFiltered = _invoiceOverviewData.filter(r => {
        const matchPayment = filterPayment === 'ALL' || r.payment_method === filterPayment;
        const matchStatus = filterStatus === 'ALL' || r.status === filterStatus;
        return matchPayment && matchStatus;
    });

    if (_invoiceOverviewFiltered.length === 0) {
        summary.innerHTML = '';
        cardsContainer.innerHTML = '';
        status.innerHTML = '<i class="fas fa-info-circle" style="color:var(--secondary-color);"></i> Nenhuma fatura encontrada para o filtro selecionado.';
        return;
    }

    status.textContent = '';

    // Painel resumo
    const totalFaturas = _invoiceOverviewFiltered.length;
    const totalValor = _invoiceOverviewFiltered.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)
        .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    summary.innerHTML = `
        <div style="background:#e3f2fd; border:1px solid var(--secondary-color); border-radius:8px; padding:18px 28px; min-width:180px; text-align:center;">
            <div style="font-size:2rem; font-weight:bold; color:var(--secondary-dark);">${totalFaturas}</div>
            <div style="color:#555; font-size:0.9rem; margin-top:4px;">Total de Faturas</div>
        </div>
        <div style="background:#fff3e0; border:1px solid #e65100; border-radius:8px; padding:18px 28px; min-width:180px; text-align:center;">
            <div style="font-size:1.5rem; font-weight:bold; color:#e65100;">${totalValor}</div>
            <div style="color:#555; font-size:0.9rem; margin-top:4px;">Valor Total</div>
        </div>
    `;

    // Agrupar por dia do mês
    const groups = {};
    _invoiceOverviewFiltered.forEach(r => {
        if (!r.due_date) return;
        const day = new Date(r.due_date).getDate();
        if (!groups[day]) groups[day] = { count: 0, total: 0 };
        groups[day].count++;
        groups[day].total += parseFloat(r.amount) || 0;
    });

    const sortedDays = Object.keys(groups).map(Number).sort((a, b) => a - b);

    cardsContainer.innerHTML = sortedDays.map(day => {
        const g = groups[day];
        const valor = g.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        return `
            <div class="invoice-day-card" data-day="${day}" title="Clique para baixar lista do dia ${day}" style="cursor:pointer;">
                <div style="font-size:2rem; font-weight:bold; color:var(--secondary-dark);">Dia ${day}</div>
                <div style="font-size:1.4rem; font-weight:bold; color:var(--primary-color); margin:8px 0;">${g.count} <span style="font-size:0.9rem; font-weight:normal; color:#555;">faturas</span></div>
                <div style="font-size:1rem; color:var(--secondary-color); font-weight:600;">${valor}</div>
                <div style="margin-top:10px; font-size:0.8rem; color:#888;"><i class="fas fa-download"></i> Baixar lista</div>
            </div>
        `;
    }).join('');

    // Clique nos cards para baixar lista do dia
    cardsContainer.querySelectorAll('.invoice-day-card').forEach(card => {
        card.addEventListener('click', () => downloadInvoicesByDay(Number(card.dataset.day)));
    });
}

function downloadInvoicesByDay(day) {
    const dayData = _invoiceOverviewFiltered.filter(r => r.due_date && new Date(r.due_date).getDate() === day);

    if (dayData.length === 0) {
        showToast('Nenhum dado para este dia.', 'warning');
        return;
    }

    const headers = ['Cliente', 'Telefone', 'Data Vencimento', 'Status', 'Valor (R$)', 'Link Fatura', 'Meio Pagamento'];

    const rows = dayData.map(r => [
        r.clients ? `${r.clients.nome || ''} ${r.clients.sobrenome || ''}`.trim() : '',
        r.clients?.telefone ?? '',
        r.due_date ? new Date(r.due_date).toLocaleDateString('pt-BR') : '',
        translateStatus(r.status),
        (parseFloat(r.amount) || 0).toFixed(2).replace('.', ','),
        r.invoice_url ?? '',
        translatePaymentMethod(r.payment_method)
    ]);

    downloadCSV(headers, rows, `faturas_dia_${day}`);
}

function downloadInvoiceList() {
    if (!_invoiceOverviewFiltered || _invoiceOverviewFiltered.length === 0) {
        showToast('Nenhum dado para exportar. Selecione um filtro primeiro.', 'warning');
        return;
    }

    const headers = ['Cliente', 'Telefone', 'Data Vencimento', 'Dia', 'Status', 'Valor (R$)', 'Link Fatura', 'Meio Pagamento'];

    const rows = _invoiceOverviewFiltered.map(r => [
        r.clients ? `${r.clients.nome || ''} ${r.clients.sobrenome || ''}`.trim() : '',
        r.clients?.telefone ?? '',
        r.due_date ? new Date(r.due_date).toLocaleDateString('pt-BR') : '',
        r.due_date ? new Date(r.due_date).getDate() : '',
        translateStatus(r.status),
        (parseFloat(r.amount) || 0).toFixed(2).replace('.', ','),
        r.invoice_url ?? '',
        translatePaymentMethod(r.payment_method)
    ]);

    const filter = document.getElementById('filterPaymentMethod').value.toLowerCase();
    downloadCSV(headers, rows, `faturas_vencimento_${filter === 'all' ? 'todos' : filter}`);
}

// ... (Resto do código original: searchTitular, openFinancialModal, loadFinancialHistory) ...

async function searchTitular(term) {
    resultsContainer.innerHTML = '<div style="padding:10px;">Buscando...</div>';
    resultsContainer.style.display = 'block';

    try {
        const searchWords = term.toLowerCase().split(/\s+/).filter(w => w.length > 0);

        let query = _supabase
            .from('clients')
            .select('id, nome, sobrenome, cpf, plano, status');

        query = query.or(`plano.ilike.Bim Familiar,plano.ilike.Bim Individual`);

        if (searchWords.length > 0) {
            const isNumber = /^\d+$/.test(term.replace(/[.-]/g, ''));

            if (isNumber) {
                query = query.ilike('cpf', `%${term}%`);
            } else {
                for (const word of searchWords) {
                    query = query.or(`nome.ilike.%${word}%,sobrenome.ilike.%${word}%`);
                }
            }
        }

        const { data: clients, error } = await query.limit(10);

        if (error) throw error;

        resultsContainer.innerHTML = '';

        if (!clients || clients.length === 0) {
            resultsContainer.innerHTML = '<div style="padding:10px;">Nenhum titular "Bim Familiar" ou "Bim Individual" encontrado.</div>';
            return;
        }

        clients.forEach(client => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.style.cssText = 'padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; justify-content: space-between; align-items: center;';

            item.innerHTML = `
                <div class="result-info">
                    <span class="result-name" style="font-weight: bold; display: block;">${client.nome} ${client.sobrenome || ''}</span>
                    <span class="result-cpf" style="font-size: 12px; color: #666;">CPF: ${client.cpf || 'N/A'}</span>
                </div>
                <button class="btn btn-small btn-secondary" style="font-size: 12px; padding: 5px 10px;">Ver Financeiro</button>
            `;

            item.addEventListener('mouseenter', () => { item.style.backgroundColor = '#f9f9f9'; });
            item.addEventListener('mouseleave', () => { item.style.backgroundColor = 'transparent'; });

            item.onclick = (e) => {
                e.stopPropagation();
                openFinancialModal(client);
            };
            resultsContainer.appendChild(item);
        });

    } catch (error) {
        console.error("Erro na busca financeira:", error);
        resultsContainer.innerHTML = `<div style="padding:10px; color:red;">Erro: ${error.message}</div>`;
    }
}

async function openFinancialModal(client) {
    currentFinancialClient = client;

    document.getElementById('finModalClientName').textContent = `${client.nome} ${client.sobrenome || ''}`;
    document.getElementById('finModalClientCPF').textContent = client.cpf || 'N/A';
    document.getElementById('finModalClientPlan').textContent = client.plano || 'N/A';

    if (financialModal) financialModal.style.display = 'flex';
    if (resultsContainer) resultsContainer.style.display = 'none';
    if (searchInput) searchInput.value = '';

    if (client.id) {
        await loadFinancialHistory(client.id, client.cpf);
    } else if (client.cpf) {
        await loadFinancialHistory(null, client.cpf);
    } else {
        document.getElementById('financialHistoryBody').innerHTML = '<tr><td colspan="4" style="color:red">Cliente sem CPF ou ID cadastrado. Não é possível buscar financeiro.</td></tr>';
    }
}

async function loadFinancialHistory(clientId, cpf) {
    const tbody = document.getElementById('financialHistoryBody');
    tbody.innerHTML = '<tr><td colspan="4">Carregando dados financeiros...</td></tr>';
    const badge = document.getElementById('finModalStatusBadge');
    badge.className = 'status-badge';
    badge.textContent = 'Verificando...';

    try {
        let invoices = [];

        // ESTRATÉGIA 1: Buscar por client_id na tabela asaas_payments (mais confiável)
        if (clientId) {
            const { data: paymentsById, error: errById } = await _supabase
                .from('asaas_payments')
                .select('*')
                .eq('client_id', clientId)
                .order('due_date', { ascending: false });

            if (errById) console.warn('Erro ao buscar por client_id:', errById.message);
            else if (paymentsById && paymentsById.length > 0) {
                invoices = paymentsById;
            }
        }

        // ESTRATÉGIA 2: Fallback – buscar por CPF em asaas_payments (se o cliente não tiver id ou não achar)
        if (invoices.length === 0 && cpf) {
            const cleanCpf = cpf.replace(/\D/g, '');
            // Tenta achar o client_id via tabela clients pelo CPF
            const { data: clientData } = await _supabase
                .from('clients')
                .select('id')
                .or(`cpf.eq.${cpf},cpf.eq.${cleanCpf}`)
                .maybeSingle();

            if (clientData?.id) {
                const { data: paymentsByCpf, error: errCpf } = await _supabase
                    .from('asaas_payments')
                    .select('*')
                    .eq('client_id', clientData.id)
                    .order('due_date', { ascending: false });

                if (!errCpf && paymentsByCpf && paymentsByCpf.length > 0) {
                    invoices = paymentsByCpf;
                }
            }
        }

        // Normaliza os campos para o padrão esperado pelo renderFinancialTable
        const mapped = invoices.map(inv => ({
            due_date: inv.due_date,
            amount: inv.amount ?? inv.value ?? 0,
            status: normalizePaymentStatus(inv.status),
            boleto_url: inv.boleto_url || inv.invoice_url || inv.bank_slip_url || null,
            barcode: inv.barcode || inv.line || null,
        }));

        currentFinancialData = mapped;
        renderFinancialTable(mapped);
        updateFinancialStatus(mapped);

    } catch (error) {
        console.error('Erro ao carregar financeiro:', error);
        tbody.innerHTML = `<tr><td colspan="4" style="color:red">Erro ao buscar dados: ${error.message}</td></tr>`;
    }
}

// Normaliza status de pagamento para o padrão interno
function normalizePaymentStatus(status) {
    if (!status) return 'OPEN';
    const s = status.toUpperCase();
    // Asaas: PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED, REFUND_REQUESTED, CHARGEBACK_DISPUTE
    if (s === 'RECEIVED' || s === 'CONFIRMED') return 'PAID';
    if (s === 'OVERDUE') return 'OVERDUE';
    if (s === 'PENDING') return 'OPEN';
    if (s === 'CANCELLED' || s === 'REFUNDED' || s === 'REFUND_REQUESTED') return 'CANCELLED';
    // Já no padrão interno (OPEN, PAID, OVERDUE, CANCELLED)
    return s;
}

function renderFinancialTable(invoices) {
    const tbody = document.getElementById('financialHistoryBody');
    tbody.innerHTML = '';

    if (invoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">Nenhum registro financeiro encontrado.</td></tr>';
        return;
    }

    invoices.forEach(inv => {
        const tr = document.createElement('tr');

        const statusMap = {
            'OPEN': 'Em Aberto',
            'PAID': 'Pago',
            'OVERDUE': 'Atrasado',
            'CANCELLED': 'Cancelado'
        };
        const displayStatus = statusMap[inv.status] || inv.status;
        const date = new Date(inv.due_date).toLocaleDateString('pt-BR');
        const value = parseFloat(inv.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        let actionBtn = '';
        if (inv.status === 'OPEN' || inv.status === 'OVERDUE') {
            actionBtn = `
                <a href="${inv.boleto_url || '#'}" target="_blank" class="btn btn-small btn-secondary" title="Abrir Boleto PDF" style="text-decoration: none; display: inline-flex; align-items: center; gap: 5px;">
                    <i class="fas fa-barcode"></i> 2ª Via
                </a>
            `;
        } else if (inv.status === 'PAID') {
            actionBtn = `<span style="color: var(--confirmed-color); font-weight: bold;"><i class="fas fa-check"></i> Quitado</span>`;
        } else if (inv.status === 'CANCELLED') {
            actionBtn = `<span style="color: var(--gray-medium);">Cancelado</span>`;
        }

        const barcodeHtml = inv.barcode ? `
            <div class="barcode-box">
                <span style="font-size: 11px;">${inv.barcode.substring(0, 20)}...</span>
                <button class="copy-btn" title="Copiar código" onclick="navigator.clipboard.writeText('${inv.barcode}'); alert('Código copiado!');">
                    <i class="far fa-copy"></i>
                </button>
            </div>
        ` : '';

        tr.innerHTML = `
            <td>${date}</td>
            <td>${value}</td>
            <td><span class="fin-status ${inv.status}">${displayStatus}</span></td>
            <td>
                <div style="display:flex; flex-direction: column; gap: 5px;">
                    ${barcodeHtml}
                    <div style="display:flex; justify-content: flex-end;">${actionBtn}</div>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateFinancialStatus(invoices) {
    const badge = document.getElementById('finModalStatusBadge');

    const hasOverdue = invoices.some(inv => inv.status === 'OVERDUE');

    if (hasOverdue) {
        badge.textContent = 'IRREGULAR (Pendências)';
        badge.className = 'status-badge irregular';
    } else {
        badge.textContent = 'REGULAR (Em dia)';
        badge.className = 'status-badge regular';
    }
}


export { setupFinanceiroPage, openFinancialModal, loadFinancialHistory };
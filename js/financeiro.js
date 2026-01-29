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

    document.getElementById('btnEmitirCarneModal')?.addEventListener('click', () => {
        if(currentFinancialClient && currentFinancialData.length > 0) {
            emitirCarne(currentFinancialData);
        }
    });
}

function injectTabControls() {
    const card = document.querySelector('#financeiroPage .card');
    if (!card || card.querySelector('.finance-tabs')) return;

    // Cria os botões de aba
    const tabsHtml = `
        <div class="finance-tabs" style="display: flex; gap: 15px; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px;">
            <button class="btn btn-secondary active" id="tabIndividualSearch">Busca Individual</button>
            <button class="btn btn-secondary" id="tabOverdueList" style="background-color: #fce4ec; color: #c62828; border: 1px solid #c62828;">
                <i class="fas fa-exclamation-circle"></i> Monitorar Inadimplência
            </button>
        </div>
        <div id="overdueListContainer" style="display: none;">
            <h3 style="color: #c62828; margin-bottom: 15px;">Clientes em Atraso (Geral)</h3>
            <div class="table-container">
                <table class="financial-table">
                    <thead>
                        <tr>
                            <th>Cliente</th>
                            <th>Telefone</th>
                            <th>Valor Vencido</th>
                            <th>Vencimento</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody id="overdueTableBody">
                        <tr><td colspan="5">Carregando...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    // Insere antes do título "Buscar Titular"
    const title = card.querySelector('.card-title');
    title.insertAdjacentHTML('beforebegin', tabsHtml);

    // Configura listeners das abas
    document.getElementById('tabIndividualSearch').addEventListener('click', (e) => switchTab('individual', e.target));
    document.getElementById('tabOverdueList').addEventListener('click', (e) => switchTab('overdue', e.target));
}

function switchTab(tab, btn) {
    // Atualiza estilo dos botões
    document.querySelectorAll('.finance-tabs .btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const searchSection = document.querySelector('#financeiroPage .card-title'); // "Buscar Titular"
    const searchInputDiv = document.querySelector('#financeiroPage .search-container');
    const overdueContainer = document.getElementById('overdueListContainer');

    if (tab === 'individual') {
        searchSection.style.display = 'block';
        searchInputDiv.style.display = 'flex';
        overdueContainer.style.display = 'none';
        resultsContainer.style.display = 'none';
    } else {
        searchSection.style.display = 'none';
        searchInputDiv.style.display = 'none';
        overdueContainer.style.display = 'block';
        loadOverdueClients(); // Carrega a lista da view
    }
}

// =================================================================
// NOVA FUNÇÃO: CARREGAR LISTA DE INADIMPLENTES (VIEW)
// =================================================================
async function loadOverdueClients() {
    const tbody = document.getElementById('overdueTableBody');
    tbody.innerHTML = '<tr><td colspan="5">Carregando inadimplentes...</td></tr>';

    try {
        const { data, error } = await _supabase
            .from('view_clients_overdue')
            .select('*')
            .order('data_vencimento', { ascending: true }); // Mais antigos primeiro

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:green;"><i class="fas fa-check-circle"></i> Nenhum cliente em atraso no momento!</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        data.forEach(row => {
            const tr = document.createElement('tr');
            
            const valor = parseFloat(row.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const vencimento = new Date(row.data_vencimento).toLocaleDateString('pt-BR');
            const cleanPhone = row.telefone ? row.telefone.replace(/\D/g, '') : '';
            
            let whatsappBtn = '';
            if (cleanPhone.length >= 10) {
                const msg = `Olá ${row.nome}, notamos uma pendência no valor de ${valor} com vencimento em ${vencimento}. Segue o link para regularização: ${row.link_boleto || 'Entre em contato'}`;
                whatsappBtn = `
                    <a href="https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}" target="_blank" class="btn btn-small btn-success" title="Cobrar no WhatsApp">
                        <i class="fab fa-whatsapp"></i> Cobrar
                    </a>
                `;
            }

            tr.innerHTML = `
                <td>
                    <strong>${row.nome} ${row.sobrenome || ''}</strong><br>
                    <small>CPF: ${row.cpf}</small>
                </td>
                <td>${row.telefone || '-'}</td>
                <td style="color: #c62828; font-weight: bold;">${valor}</td>
                <td>${vencimento}</td>
                <td>
                    <div style="display:flex; gap: 5px;">
                        <a href="${row.link_boleto}" target="_blank" class="btn btn-small btn-secondary"><i class="fas fa-barcode"></i> Boleto</a>
                        ${whatsappBtn}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Erro ao carregar view de inadimplência:", error);
        tbody.innerHTML = `<tr><td colspan="5" style="color:red">Erro: ${error.message}. (Verifique se a View SQL foi criada)</td></tr>`;
    }
}

// ... (Resto do código original: searchTitular, openFinancialModal, loadFinancialHistory, emitirCarne) ...

async function searchTitular(term) {
    resultsContainer.innerHTML = '<div style="padding:10px;">Buscando...</div>';
    resultsContainer.style.display = 'block';

    try {
        const searchWords = term.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        
        let query = _supabase
            .from('clients')
            .select('id, nome, sobrenome, cpf, plano, status');

        query = query.ilike('plano', 'Bim Familiar'); 

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
            resultsContainer.innerHTML = '<div style="padding:10px;">Nenhum titular "Bim Familiar" encontrado com este nome/CPF.</div>';
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
    
    if(financialModal) financialModal.style.display = 'flex';
    resultsContainer.style.display = 'none';
    searchInput.value = '';

    if (client.cpf) {
        await loadFinancialHistory(client.cpf);
    } else {
        document.getElementById('financialHistoryBody').innerHTML = '<tr><td colspan="4" style="color:red">Cliente sem CPF cadastrado. Não é possível buscar financeiro.</td></tr>';
    }
}

async function loadFinancialHistory(cpf) {
    const tbody = document.getElementById('financialHistoryBody');
    tbody.innerHTML = '<tr><td colspan="4">Carregando dados da Cora...</td></tr>';
    const badge = document.getElementById('finModalStatusBadge');
    badge.className = 'status-badge';
    badge.textContent = 'Verificando...';

    const cleanCpf = cpf.replace(/\D/g, '');

    try {
        let { data: invoices, error } = await _supabase
            .from('financial_daily_sync')
            .select('*')
            .or(`client_cpf.eq.${cpf},client_cpf.eq.${cleanCpf}`)
            .order('due_date', { ascending: false });

        if (error) throw error;

        if (!invoices || invoices.length === 0) {
            console.warn("Nenhum dado real encontrado.");
            invoices = [];
        }

        currentFinancialData = invoices;
        renderFinancialTable(invoices);
        updateFinancialStatus(invoices);

    } catch (error) {
        console.error('Erro ao carregar financeiro:', error);
        tbody.innerHTML = `<tr><td colspan="4" style="color:red">Erro ao buscar dados: ${error.message}</td></tr>`;
    }
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

function emitirCarne(invoices) {
    const openInvoices = invoices.filter(inv => inv.status === 'OPEN' || inv.status === 'OVERDUE');

    if (openInvoices.length === 0) {
        showToast('Não há faturas em aberto para emitir carnê.', 'info');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text(`Carnê de Pagamento - ${currentFinancialClient.nome}`, 20, 20);
    doc.setFontSize(10);
    doc.text(`CPF: ${currentFinancialClient.cpf}`, 20, 26);
    
    doc.setFontSize(12);
    let y = 40;

    openInvoices.forEach((inv, index) => {
        if (y > 270) { doc.addPage(); y = 20; }

        const date = new Date(inv.due_date).toLocaleDateString('pt-BR');
        const value = parseFloat(inv.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const statusMap = { 'OPEN': 'A Vencer', 'OVERDUE': 'ATRASADO' };
        
        doc.setDrawColor(200);
        doc.rect(15, y - 5, 180, 25);

        doc.setFont("helvetica", "bold");
        doc.text(`Vencimento: ${date}`, 20, y + 5);
        doc.text(`Valor: ${value}`, 120, y + 5);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Status: ${statusMap[inv.status] || inv.status}`, 20, y + 12);
        
        if(inv.boleto_url) {
            doc.setTextColor(0, 0, 255);
            doc.textWithLink('CLIQUE PARA ACESSAR O PDF', 120, y + 12, { url: inv.boleto_url });
            doc.setTextColor(0, 0, 0);
        }
        
        if(inv.barcode) {
            doc.setFont("courier", "normal");
            doc.setFontSize(9);
            doc.text(inv.barcode, 20, y + 18);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(12);
        }

        y += 30;
    });

    doc.save(`carne_${currentFinancialClient.nome.replace(/\s/g, '_')}.pdf`);
    showToast('Lista de pagamentos gerada!', 'success');
}

export { setupFinanceiroPage, openFinancialModal, emitirCarne, loadFinancialHistory };
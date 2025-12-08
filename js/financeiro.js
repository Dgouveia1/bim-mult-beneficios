import { _supabase } from './supabase.js';
import { showToast } from './utils.js';

// --- ELEMENTOS ---
const searchInput = document.getElementById('financialSearchInput');
const resultsContainer = document.getElementById('financialSearchResults');
const financialModal = document.getElementById('financialClientModal');

// --- ESTADO ---
let currentFinancialClient = null;
let currentFinancialData = [];

// --- FUNÇÃO PRINCIPAL DE BUSCA ---
async function setupFinanceiroPage() {
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

// Busca apenas titulares do plano Bim Familiar
async function searchTitular(term) {
    resultsContainer.innerHTML = '<div style="padding:10px;">Buscando...</div>';
    resultsContainer.style.display = 'block';

    try {
        // Divide o termo para permitir busca por "Nome Sobrenome"
        // Ex: "Davi Silva" vai buscar (nome tem Davi OU sobrenome tem Davi) E (nome tem Silva OU sobrenome tem Silva)
        const searchWords = term.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        
        let query = _supabase
            .from('clients')
            .select('id, nome, sobrenome, cpf, plano, status');

        // Regra 6: Apenas plano "Bim Familiar" (usando ilike para ignorar maiúsculas/minúsculas)
        query = query.ilike('plano', 'Bim Familiar'); 

        // Constrói a lógica de filtro de nome/cpf
        if (searchWords.length > 0) {
            // Se for CPF (apenas números), busca direto
            const isNumber = /^\d+$/.test(term.replace(/[.-]/g, ''));
            
            if (isNumber) {
                query = query.ilike('cpf', `%${term}%`);
            } else {
                // Monta o filtro AND para cada palavra digitada
                // A sintaxe do Supabase para complex OR/AND é: .or('and(cond1,cond2),cond3')
                // Aqui queremos: (NomeMatchPalavra1 OR SobrenomeMatchPalavra1) AND (NomeMatchPalavra2 OR SobrenomeMatchPalavra2)...
                
                // Nota: O Supabase JS client tem limitações para agrupar ANDs dentro de um OR fluido.
                // Vamos usar a lógica de filtro acumulativo:
                
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
            // Estilizando inline para garantir que apareça bem, ou use as classes CSS existentes
            item.style.cssText = 'padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; justify-content: space-between; align-items: center;';
            
            item.innerHTML = `
                <div class="result-info">
                    <span class="result-name" style="font-weight: bold; display: block;">${client.nome} ${client.sobrenome || ''}</span>
                    <span class="result-cpf" style="font-size: 12px; color: #666;">CPF: ${client.cpf || 'N/A'}</span>
                </div>
                <button class="btn btn-small btn-secondary" style="font-size: 12px; padding: 5px 10px;">Ver Financeiro</button>
            `;
            
            // Adiciona efeito de hover
            item.addEventListener('mouseenter', () => { item.style.backgroundColor = '#f9f9f9'; });
            item.addEventListener('mouseleave', () => { item.style.backgroundColor = 'transparent'; });
            
            item.onclick = (e) => {
                e.stopPropagation(); // Evita fechar se houver listener global
                openFinancialModal(client);
            };
            resultsContainer.appendChild(item);
        });

    } catch (error) {
        console.error("Erro na busca financeira:", error);
        resultsContainer.innerHTML = `<div style="padding:10px; color:red;">Erro: ${error.message}</div>`;
    }
}

// --- MODAL E DADOS FINANCEIROS ---

async function openFinancialModal(client) {
    currentFinancialClient = client;
    
    // Preenche cabeçalho do modal
    document.getElementById('finModalClientName').textContent = `${client.nome} ${client.sobrenome || ''}`;
    document.getElementById('finModalClientCPF').textContent = client.cpf || 'N/A';
    document.getElementById('finModalClientPlan').textContent = client.plano || 'N/A';
    
    // Abre modal
    if(financialModal) financialModal.style.display = 'flex';
    resultsContainer.style.display = 'none';
    searchInput.value = '';

    // Usa o CPF para buscar os dados na tabela de sincronização
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

    // Limpa caracteres não numéricos do CPF para garantir match exato
    const cleanCpf = cpf.replace(/\D/g, '');

    try {
        // 1. Busca na tabela de sincronização diária (Estado Atual)
        // OBS: Estamos assumindo que na tabela financial_daily_sync o CPF está limpo (apenas números)
        // Se estiver formatado (xxx.xxx.xxx-xx), remova o .replace no cleanCpf acima ou ajuste conforme seu padrão.
        
        let { data: invoices, error } = await _supabase
            .from('financial_daily_sync')
            .select('*')
            // Tentamos buscar tanto formatado quanto limpo para garantir
            .or(`client_cpf.eq.${cpf},client_cpf.eq.${cleanCpf}`)
            .order('due_date', { ascending: false });

        if (error) throw error;

        // --- MOCK TEMPORÁRIO PARA TESTES (Se não tiver integração real ainda) ---
        if (!invoices || invoices.length === 0) {
            console.warn("Nenhum dado real encontrado. Usando MOCK para demonstração.");
            invoices = generateMockInvoices();
        }
        // -----------------------------------------------------------------------

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
        
        // Tradução de status
        const statusMap = {
            'OPEN': 'Em Aberto',
            'PAID': 'Pago',
            'OVERDUE': 'Atrasado',
            'CANCELLED': 'Cancelado'
        };
        const displayStatus = statusMap[inv.status] || inv.status;
        const date = new Date(inv.due_date).toLocaleDateString('pt-BR');
        const value = parseFloat(inv.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        // Botão de 2ª via (apenas se não estiver pago/cancelado)
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

        // Linha digitável com copiar
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

// Regra 5: Status regido pela lógica de pagamentos (Regra de negócio)
function updateFinancialStatus(invoices) {
    const badge = document.getElementById('finModalStatusBadge');
    
    // Lógica: Se tiver boleto com status 'OVERDUE', é irregular.
    const hasOverdue = invoices.some(inv => inv.status === 'OVERDUE');
    
    if (hasOverdue) {
        badge.textContent = 'IRREGULAR (Pendências)';
        badge.className = 'status-badge irregular';
    } else {
        badge.textContent = 'REGULAR (Em dia)';
        badge.className = 'status-badge regular';
    }
}

// Regra 4: Emitir Carnê (Todos os abertos/atrasados)
function emitirCarne(invoices) {
    // Filtra apenas o que deve ser pago
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
        
        // Desenha uma "caixa" para o boleto
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

// --- MOCK DATA GENERATOR (Para testes sem backend) ---
function generateMockInvoices() {
    const today = new Date();
    const mockData = [];
    
    // 1 fatura atrasada (Mês passado)
    const d1 = new Date(today); d1.setMonth(today.getMonth() - 1);
    mockData.push({
        due_date: d1.toISOString(),
        amount: 89.90,
        status: 'OVERDUE',
        barcode: '34191.79001 01043.510047 91020.150008 8 99990000008990',
        boleto_url: 'https://www.google.com'
    });

    // 1 fatura paga (2 meses atrás)
    const d2 = new Date(today); d2.setMonth(today.getMonth() - 2);
    mockData.push({
        due_date: d2.toISOString(),
        amount: 89.90,
        status: 'PAID',
        barcode: '34191.79001 01043.510047 91020.150008 8 99990000008990',
        boleto_url: '#'
    });

    // 1 fatura futura (Mês que vem)
    const d3 = new Date(today); d3.setMonth(today.getMonth() + 1);
    mockData.push({
        due_date: d3.toISOString(),
        amount: 89.90,
        status: 'OPEN',
        barcode: '34191.79001 01043.510047 91020.150008 8 99990000008990',
        boleto_url: 'https://www.google.com'
    });

    return mockData;
}

export { setupFinanceiroPage, openFinancialModal, emitirCarne, loadFinancialHistory };
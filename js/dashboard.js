import { _supabase } from './supabase.js';
import { showToast } from './utils.js';

// ---------- HELPER SEGURO ----------
async function safeRpc(rpcName, params = {}) {
    try {
        const { data, error } = await _supabase.rpc(rpcName, params);
        if (error) {
            console.warn(`⚠️ RPC ${rpcName}:`, error.message);
            // Retorna estrutura compatível com o esperado
            return Array.isArray(params) ? [] : null;
        }
        return data;
    } catch (err) {
        console.error(`❌ Exceção em ${rpcName}:`, err);
        return Array.isArray(params) ? [] : null;
    }
}

// ---------- ATUALIZAÇÃO DE CARDS ----------
function updateKpiCard(id, value, compareText = null, positive = null) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value ?? '--';
    if (compareText !== null) {
        const compEl = document.getElementById(id.replace('-valor', '-comp'));
        if (compEl) {
            compEl.textContent = compareText;
            compEl.classList.remove('positive', 'negative');
            if (positive === true) compEl.classList.add('positive');
            else if (positive === false) compEl.classList.add('negative');
        }
    }
}

function updateFinancialCard(prefix, data, period = 'mês') {
    const current = data?.current ?? 0;
    const previous = data?.previous ?? 0;
    const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    updateKpiCard(`${prefix}-valor`, formatter.format(current));

    const compEl = document.getElementById(`${prefix}-comp`);
    if (compEl) {
        if (previous === 0) {
            compEl.textContent = current > 0 ? `+${formatter.format(current)} vs ${period} anterior` : `vs ${period} anterior`;
            compEl.className = current > 0 ? 'positive' : '';
        } else {
            const change = ((current - previous) / previous) * 100;
            compEl.textContent = `${change > 0 ? '+' : ''}${change.toFixed(1)}% vs ${period} anterior`;
            compEl.className = change >= 0 ? 'positive' : 'negative';
        }
    }
}

function updatePercentageCard(prefix, data, period = 'mês') {
    const current = data?.current ?? 0;
    const previous = data?.previous ?? 0;
    updateKpiCard(`${prefix}-valor`, `${current.toFixed(1)}%`);

    const compEl = document.getElementById(`${prefix}-comp`);
    if (compEl) {
        const diff = current - previous;
        compEl.textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)} pp vs ${period} anterior`;
        compEl.className = diff <= 0 ? 'positive' : 'negative';
    }
}

// ---------- CRIAÇÃO DE CARDS DINÂMICOS ----------
function ensureCardSection(title, prefix, parentSelector = '#dashboardPage .dashboard-wrapper') {
    const parent = document.querySelector(parentSelector);
    if (!parent) return null;
    let section = document.querySelector(`#card-section-${prefix}`);
    if (!section) {
        section = document.createElement('section');
        section.id = `card-section-${prefix}`;
        section.className = 'dashboard-section';
        section.innerHTML = `
            <h2 class="section-title">${title}</h2>
            <div class="financial-grid" id="${prefix}-grid">
                <div class="kpi-card" id="${prefix}-receita">
                    <span class="card-title">Receita Bruta</span>
                    <h2 id="${prefix}-receita-valor">--</h2>
                    <p id="${prefix}-receita-comp">vs mês anterior</p>
                </div>
                <div class="kpi-card" id="${prefix}-liquido">
                    <span class="card-title">Receita Líquida</span>
                    <h2 id="${prefix}-liquido-valor">--</h2>
                    <p id="${prefix}-liquido-comp">vs mês anterior</p>
                </div>
                <div class="kpi-card" id="${prefix}-clientes">
                    <span class="card-title">Clientes Pagantes</span>
                    <h2 id="${prefix}-clientes-valor">--</h2>
                    <p id="${prefix}-clientes-comp">vs mês anterior</p>
                </div>
                <div class="kpi-card" id="${prefix}-a-receber">
                    <span class="card-title">A Receber (mês)</span>
                    <h2 id="${prefix}-a-receber-valor">--</h2>
                    <p>Pendentes + Vencidos</p>
                </div>
            </div>
        `;
        const header = parent.querySelector('header');
        if (header) header.insertAdjacentElement('afterend', section);
        else parent.prepend(section);
    }
    return section;
}

function ensureClinicFinancialSection() {
    const parent = document.querySelector('#dashboardPage .dashboard-wrapper');
    if (!parent) return;
    let section = document.querySelector('#card-section-clinica-financeiro');
    if (!section) {
        section = document.createElement('section');
        section.id = 'card-section-clinica-financeiro';
        section.className = 'dashboard-section';
        section.innerHTML = `
            <h2 class="section-title">Financeiro da Clínica</h2>
            <div class="financial-grid" id="clinica-fin-grid">
                <div class="kpi-card" id="clinica-faturamento">
                    <span class="card-title">Faturamento</span>
                    <h2 id="clinica-faturamento-valor">--</h2>
                    <p id="clinica-faturamento-comp">vs mês anterior</p>
                </div>
                <div class="kpi-card" id="clinica-consultas-pagas">
                    <span class="card-title">Consultas Pagas</span>
                    <h2 id="clinica-consultas-pagas-valor">--</h2>
                    <p id="clinica-consultas-pagas-comp">vs mês anterior</p>
                </div>
                <div class="kpi-card" id="clinica-ticket">
                    <span class="card-title">Ticket Médio</span>
                    <h2 id="clinica-ticket-valor">--</h2>
                    <p id="clinica-ticket-comp">vs mês anterior</p>
                </div>
            </div>
        `;
        const cardSection = document.querySelector('#card-section-cartao');
        if (cardSection) cardSection.insertAdjacentElement('afterend', section);
        else parent.append(section);
    }
}

// ---------- NOVOS CARDS: AQUISIÇÃO VS INADIMPLÊNCIA ----------
function ensureAcquisitionOverdueCard() {
    const parent = document.querySelector('#dashboardPage .dashboard-wrapper');
    if (!parent) return;
    if (document.getElementById('acquisition-overdue-card')) return;
    const card = document.createElement('div');
    card.id = 'acquisition-overdue-card';
    card.className = 'kpi-card';
    card.innerHTML = `
        <span class="card-title">Aquisição vs Em Dívida (mês)</span>
        <h2 id="acquisition-new-clients">--</h2>
        <p id="acquisition-overdue-clients" style="font-size: 0.9rem;">-- em dívida</p>
        <p id="acquisition-ratio" style="font-size: 0.8rem; color: #555;">--% dos novos em dívida</p>
    `;
    // Insere após o card de churn ou no fim da seção Overview Cartão
    const overviewGrid = document.querySelector('.overview-grid');
    if (overviewGrid) overviewGrid.appendChild(card);
}

// ---------- CHAMADAS ÀS NOVAS FUNÇÕES RPC ----------
async function fetchCardFinancials(planFilter = 'Bim Familiar,Bim Individual') {
    return safeRpc('get_card_financial_metrics', { plan_filter: planFilter });
}
async function fetchClinicFinancials(planFilter = 'all') {
    return safeRpc('get_clinic_financial_metrics', { plan_filter: planFilter });
}
async function fetchCardOverview(planFilter = 'Bim Familiar,Bim Individual') {
    return safeRpc('get_card_overview', { plan_filter: planFilter });
}
async function fetchClinicOverview(planFilter = 'all') {
    return safeRpc('get_clinic_overview', { plan_filter: planFilter });
}
async function fetchSalesBySeller(planFilter = 'Bim Familiar,Bim Individual') {
    return safeRpc('get_sales_by_seller', { plan_filter: planFilter });
}
async function fetchWeeklyTitulares(planFilter = 'Bim Familiar,Bim Individual') {
    return safeRpc('get_weekly_active_titulares', { plan_filter: planFilter });
}
async function fetchMonthlyConsultations(planFilter = 'all') {
    return safeRpc('get_monthly_consultations', { plan_filter: planFilter });
}
async function fetchConsultationForecast(planFilter = 'all') {
    return safeRpc('get_consultation_forecast', { plan_filter: planFilter });
}
async function fetchCardAcquisitionForecast(planFilter = 'Bim Familiar,Bim Individual') {
    return safeRpc('get_card_acquisition_forecast', { plan_filter: planFilter });
}
async function fetchChurnData(planFilter = 'Bim Familiar,Bim Individual') {
    return safeRpc('get_churn_data', { plan_filter: planFilter });
}
// INADIMPLÊNCIA SEMANAL (substitui a mensal)
async function fetchWeeklyOverdueStats(planFilter = 'Bim Familiar,Bim Individual') {
    return safeRpc('get_weekly_overdue_stats', { plan_filter: planFilter });
}
// INADIMPLÊNCIA POR SAFRA (novo)
async function fetchCohortOverduePercentage(planFilter = 'Bim Familiar,Bim Individual') {
    return safeRpc('get_cohort_overdue_percentage', { plan_filter: planFilter });
}
async function fetchConsultationsByProfessional(planFilter = 'all') {
    return safeRpc('get_consultations_by_professional', { plan_filter: planFilter });
}
async function fetchConsultationsByPlan(planFilter = 'all') {
    return safeRpc('get_consultations_by_plan', { plan_filter: planFilter });
}
async function fetchTempoMedioConsultas(planFilter = 'all') {
    return safeRpc('get_tempo_medio_consultas', { plan_filter: planFilter });
}
async function fetchTaxaOcupacao(planFilter = 'all') {
    return safeRpc('get_taxa_ocupacao', { plan_filter: planFilter });
}
// COORTE DE USO DA CLÍNICA (substitui a antiga get_monthly_cohorts)
async function fetchCardUsageCohort(planFilter = 'Bim Familiar,Bim Individual') {
    return safeRpc('get_card_usage_cohort', { plan_filter: planFilter });
}
// AQUISIÇÃO VS INADIMPLÊNCIA (novo)
async function fetchAcquisitionVsOverdue(planFilter = 'Bim Familiar,Bim Individual') {
    return safeRpc('get_acquisition_vs_overdue', { plan_filter: planFilter });
}

// ---------- GRÁFICOS ----------
let charts = {};
function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}
function hexToRgba(hex, alpha = 1) {
    const h = hex.replace('#','');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function createNoDataMessage(canvasId, message = 'Sem dados para exibir') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.font = '14px Arial';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.fillText(message, w/2, h/2);
}
function createBarChart(ctx, labels, data, label, color = '#4682B4') {
    if (!labels || labels.length === 0) {
        createNoDataMessage(ctx.canvas.id);
        return null;
    }
    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: hexToRgba(color, 0.8),
                borderColor: color,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}
function createLineChart(ctx, labels, data, label, color = '#4682B4') {
    if (!labels || labels.length === 0) {
        createNoDataMessage(ctx.canvas.id);
        return null;
    }
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                borderColor: color,
                backgroundColor: hexToRgba(color, 0.1),
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}
function createForecastChart(ctx, forecastData) {
    if (!forecastData || forecastData.length === 0) {
        createNoDataMessage(ctx.canvas.id, 'Sem projeções');
        return;
    }
    const labels = forecastData.map(d => {
        const date = new Date(d.week_start);
        return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}`;
    });
    const historical = forecastData.map(d => d.is_forecast ? null : d.count);
    const projected = forecastData.map(d => d.is_forecast ? d.count : null);
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#4682B4';
    charts.forecast = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Realizado',
                    data: historical,
                    backgroundColor: hexToRgba('#95a5a6', 0.8),
                    order: 2
                },
                {
                    label: 'Projeção',
                    data: projected,
                    type: 'line',
                    borderColor: accentColor,
                    borderWidth: 2,
                    borderDash: [5,5],
                    fill: false,
                    pointRadius: 5,
                    pointBackgroundColor: accentColor,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { tooltip: { mode: 'index', intersect: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// ---------- GRÁFICO DE INADIMPLÊNCIA SEMANAL (STACKED) ----------
function createWeeklyOverdueChart(ctx, data) {
    if (!data || data.length === 0) {
        createNoDataMessage(ctx.canvas.id, 'Sem dados de inadimplência');
        return;
    }
    const labels = data.map(d => {
        const date = new Date(d.week_start);
        return `${date.getDate()}/${date.getMonth()+1}`;
    });
    charts.weeklyOverdue = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '10-29 dias',
                    data: data.map(d => d.overdue_10_29),
                    backgroundColor: '#f39c12',
                    stack: 'overdue'
                },
                {
                    label: '30-59 dias',
                    data: data.map(d => d.overdue_30_59),
                    backgroundColor: '#e67e22',
                    stack: 'overdue'
                },
                {
                    label: '60-89 dias',
                    data: data.map(d => d.overdue_60_89),
                    backgroundColor: '#d35400',
                    stack: 'overdue'
                },
                {
                    label: '90+ dias',
                    data: data.map(d => d.overdue_90_plus),
                    backgroundColor: '#c0392b',
                    stack: 'overdue'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: { mode: 'index', intersect: false },
                legend: { position: 'top', labels: { boxWidth: 12 } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Valor em R$' }
                }
            }
        }
    });
}

// ---------- GRÁFICO DE INADIMPLÊNCIA POR SAFRA ----------
function createCohortOverdueChart(ctx, data) {
    if (!data || data.length === 0) {
        createNoDataMessage(ctx.canvas.id, 'Sem dados de inadimplência por safra');
        return;
    }
    const labels = data.map(d => d.cohort_month);
    const percentages = data.map(d => d.overdue_percentage);
    charts.cohortOverdue = createBarChart(ctx, labels, percentages, '% em dívida', '#e74c3c');
}

// ---------- TABELA DE COORTE (USO DA CLÍNICA) ----------
function createCohortTable(data) {
    const container = document.getElementById('cohort-chart-container');
    if (!container) return;
    if (!data || data.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding:20px;">Dados insuficientes para análise de coorte.</p>';
        return;
    }
    const cohorts = data.reduce((acc, row) => {
        if (!acc[row.cohort_month]) acc[row.cohort_month] = { total: row.total_in_cohort, months: {} };
        acc[row.cohort_month].months[row.month_number] = row.active_clients;
        return acc;
    }, {});
    const maxMonth = Math.max(...data.map(d => d.month_number));
    let html = '<div class="cohort-table-wrapper"><table class="cohort-table"><thead><tr><th>Coorte</th><th>Total</th>';
    for (let i = 0; i <= maxMonth; i++) html += `<th>Mês ${i}</th>`;
    html += '</tr></thead><tbody>';
    Object.entries(cohorts).forEach(([month, c]) => {
        html += `<tr><td>${month}</td><td>${c.total}</td>`;
        for (let i = 0; i <= maxMonth; i++) {
            const active = c.months[i] ?? 0;
            const pct = c.total > 0 ? ((active / c.total) * 100).toFixed(0) : 0;
            const alpha = pct / 100;
            html += `<td style="background-color: rgba(70,130,180,${alpha}); color: ${alpha > 0.5 ? '#fff' : '#000'}">${pct}%</td>`;
        }
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// ---------- FUNÇÃO PRINCIPAL ----------
export async function loadDashboardView() {
    console.log('📊 Carregando Dashboard (refatorado)');

    // Lê o filtro de plano do select
    const planFilterSelect = document.getElementById('dashboardPlanFilter');
    let planFilter = 'all'; // padrão
    if (planFilterSelect) {
        planFilter = planFilterSelect.value;
    }

    // Garante que as seções existam
    ensureCardSection('Financeiro do Cartão', 'cartao');
    ensureClinicFinancialSection();
    ensureAcquisitionOverdueCard();

    // Se o select estiver vazio, popula com opções
    if (planFilterSelect && planFilterSelect.options.length <= 1) {
        const planos = ['Bim Familiar', 'Bim Individual', 'Mult', 'Convenio', 'Particular'];
        planos.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            planFilterSelect.appendChild(opt);
        });
    }

    try {
        // Para funções de cartão, se o filtro for 'all', passamos os planos padrão
        const cardPlanFilter = (planFilter === 'all') ? 'Bim Familiar,Bim Individual' : planFilter;
        // Para clínica, usamos o filtro como está (all ou um plano específico)
        const clinicPlanFilter = planFilter;

        const [
            cardFin,
            clinicFin,
            cardOverview,
            clinicOverview,
            sales,
            weeklyTitulares,
            monthlyConsultations,
            consultationForecast,
            acquisitionForecast,
            churnData,
            weeklyOverdue,
            cohortOverdue,
            consProf,
            consPlan,
            tempoMedio,
            ocupacao,
            usageCohort,
            acquisitionVsOverdue
        ] = await Promise.all([
            fetchCardFinancials(cardPlanFilter),
            fetchClinicFinancials(clinicPlanFilter),
            fetchCardOverview(cardPlanFilter),
            fetchClinicOverview(clinicPlanFilter),
            fetchSalesBySeller(cardPlanFilter),
            fetchWeeklyTitulares(cardPlanFilter),
            fetchMonthlyConsultations(clinicPlanFilter),
            fetchConsultationForecast(clinicPlanFilter),
            fetchCardAcquisitionForecast(cardPlanFilter),
            fetchChurnData(cardPlanFilter),
            fetchWeeklyOverdueStats(cardPlanFilter),
            fetchCohortOverduePercentage(cardPlanFilter),
            fetchConsultationsByProfessional(clinicPlanFilter),
            fetchConsultationsByPlan(clinicPlanFilter),
            fetchTempoMedioConsultas(clinicPlanFilter),
            fetchTaxaOcupacao(clinicPlanFilter),
            fetchCardUsageCohort(cardPlanFilter),
            fetchAcquisitionVsOverdue(cardPlanFilter)
        ]);

        // ----- CARTÃO: FINANCEIRO -----
        if (cardFin) {
            updateFinancialCard('cartao-receita', cardFin.receita_bruta);
            updateFinancialCard('cartao-liquido', cardFin.receita_liquida);
            updateKpiCard('cartao-clientes-valor', cardFin.clientes_pagantes?.current ?? 0,
                `vs mês anterior: ${cardFin.clientes_pagantes?.previous ?? 0}`);
            updateKpiCard('cartao-a-receber-valor',
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cardFin.a_receber_mes ?? 0));
        }

        // ----- CARTÃO: OVERVIEW -----
        if (cardOverview) {
            updateKpiCard('titulares-ativos', cardOverview.ativos ?? 0);
            updateKpiCard('status-ativos', cardOverview.ativos ?? 0);
            updateKpiCard('status-atraso', cardOverview.atraso ?? 0);
            updateKpiCard('status-cancelados', cardOverview.cancelados ?? 0);

            const sem = cardOverview.novos_semana || {};
            updateKpiCard('novos-titulares-semana-valor', sem.current ?? 0,
                `vs semana passada: ${sem.previous ?? 0}`, sem.current > sem.previous);

            const mes = cardOverview.novos_mes || {};
            updateKpiCard('novos-titulares-mes-valor', mes.current ?? 0,
                `vs mês passado: ${mes.previous ?? 0}`, mes.current > mes.previous);

            const churnMes = cardOverview.churn_mes || {};
            updateKpiCard('churn-total', churnMes.cancelados ?? 0);
            updateKpiCard('churn-percentual-valor', `${churnMes.taxa ?? 0}%`,
                `vs mês anterior (estimado)`, false);
        }

        // ----- CARTÃO: VENDAS -----
        if (sales && sales.length > 0) {
            const totalVendasMes = sales.reduce((acc, s) => acc + (s.vendas_mes || 0), 0);
            const totalVendasMesAnterior = sales.reduce((acc, s) => acc + (s.vendas_mes_anterior || 0), 0);
            updateKpiCard('vendas-mes-valor', totalVendasMes,
                `vs mês anterior: ${totalVendasMesAnterior}`, totalVendasMes > totalVendasMesAnterior);
            const top = sales[0];
            updateKpiCard('top-vendedor-nome', top.vendedor ?? '-');
            updateKpiCard('top-vendedor-valor', `${top.vendas_mes ?? 0} vendas`);

            destroyChart('vendasVendedorChart');
            const ctx = document.getElementById('vendasVendedorChart')?.getContext('2d');
            if (ctx) {
                charts.vendasVendedor = createBarChart(ctx,
                    sales.map(s => s.vendedor),
                    sales.map(s => s.vendas_mes),
                    'Vendas',
                    '#2ecc71'
                );
            }
        } else {
            updateKpiCard('vendas-mes-valor', 0, 'vs mês anterior: 0');
            updateKpiCard('top-vendedor-nome', '-');
            updateKpiCard('top-vendedor-valor', '0 vendas');
            const ctx = document.getElementById('vendasVendedorChart')?.getContext('2d');
            if (ctx) createNoDataMessage('vendasVendedorChart', 'Sem vendas no período');
        }

        // ----- CARTÃO: AQUISIÇÃO VS INADIMPLÊNCIA -----
        if (acquisitionVsOverdue) {
            const novos = acquisitionVsOverdue.new_clients_current_month ?? 0;
            const inadimplentes = acquisitionVsOverdue.overdue_clients_current_month ?? 0;
            const ratio = novos > 0 ? ((inadimplentes / novos) * 100).toFixed(1) : 0;
            updateKpiCard('acquisition-new-clients', novos);
            updateKpiCard('acquisition-overdue-clients', `${inadimplentes} em dívida`);
            const ratioEl = document.getElementById('acquisition-ratio');
            if (ratioEl) ratioEl.textContent = `${ratio}% dos novos estão em dívida`;
        }

        // ----- CARTÃO: GRÁFICOS -----
        destroyChart('titularesChart');
        const titCtx = document.getElementById('titularesChart')?.getContext('2d');
        if (titCtx) {
            if (weeklyTitulares && weeklyTitulares.length) {
                charts.titulares = createLineChart(titCtx,
                    weeklyTitulares.map(d => d.week_label),
                    weeklyTitulares.map(d => d.cumulative_count),
                    'Titulares Ativos'
                );
            } else {
                createNoDataMessage('titularesChart', 'Nenhum titular ativo encontrado');
            }
        }

        destroyChart('churnChart');
        const churnCtx = document.getElementById('churnChart')?.getContext('2d');
        if (churnCtx) {
            if (churnData && churnData.length) {
                charts.churn = createBarChart(churnCtx,
                    churnData.map(d => d.mes),
                    churnData.map(d => d.taxa_churn),
                    'Churn %',
                    '#e74c3c'
                );
            } else {
                createNoDataMessage('churnChart', 'Sem dados de churn');
            }
        }

        // ----- INADIMPLÊNCIA SEMANAL (substitui o antigo gráfico mensal) -----
        destroyChart('inadimplenciaChart');
        const inadCtx = document.getElementById('inadimplenciaChart')?.getContext('2d');
        if (inadCtx) {
            if (weeklyOverdue && weeklyOverdue.length) {
                createWeeklyOverdueChart(inadCtx, weeklyOverdue);
            } else {
                createNoDataMessage('inadimplenciaChart', 'Sem dados de inadimplência');
            }
        }

        // ----- INADIMPLÊNCIA POR SAFRA (novo gráfico) -----
        // Criar canvas se não existir
        let cohortOverdueCanvas = document.getElementById('cohortOverdueChart');
        if (!cohortOverdueCanvas) {
            const chartGrid = document.querySelector('.chart-grid');
            if (chartGrid) {
                const newSection = document.createElement('div');
                newSection.className = 'chart-section';
                newSection.innerHTML = `
                    <h3>Inadimplência por Safra</h3>
                    <div class="chart-container">
                        <canvas id="cohortOverdueChart"></canvas>
                    </div>
                `;
                chartGrid.appendChild(newSection);
                cohortOverdueCanvas = document.getElementById('cohortOverdueChart');
            }
        }
        if (cohortOverdueCanvas) {
            destroyChart('cohortOverdueChart');
            const ctx = cohortOverdueCanvas.getContext('2d');
            if (cohortOverdue && cohortOverdue.length) {
                createCohortOverdueChart(ctx, cohortOverdue);
            } else {
                createNoDataMessage('cohortOverdueChart', 'Sem dados');
            }
        }

        destroyChart('acquisitionForecastChart');
        const acqCtx = document.getElementById('acquisitionForecastChart')?.getContext('2d');
        if (acqCtx) {
            if (acquisitionForecast && acquisitionForecast.length) {
                createForecastChart(acqCtx, acquisitionForecast);
            } else {
                createNoDataMessage('acquisitionForecastChart', 'Sem projeções');
            }
        }

        // ----- CLÍNICA: FINANCEIRO -----
        if (clinicFin) {
            updateFinancialCard('clinica-faturamento', clinicFin.faturamento);
            updateKpiCard('clinica-consultas-pagas-valor', clinicFin.consultas_pagas?.current ?? 0,
                `vs mês anterior: ${clinicFin.consultas_pagas?.previous ?? 0}`,
                clinicFin.consultas_pagas?.current > clinicFin.consultas_pagas?.previous);
            const ticket = clinicFin.ticket_medio?.current ?? 0;
            updateKpiCard('clinica-ticket-valor',
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ticket));
        }

        // ----- CLÍNICA: OVERVIEW -----
        if (clinicOverview) {
            updateKpiCard('consultas-hoje', clinicOverview.consultas_hoje ?? 0);
            const sem = clinicOverview.consultas_semana || {};
            updateKpiCard('consultas-semana-valor', sem.current ?? 0,
                `vs semana passada: ${sem.previous ?? 0}`, sem.current > sem.previous);
            const mes = clinicOverview.consultas_mes || {};
            updateKpiCard('consultas-mes-valor', mes.current ?? 0,
                `vs mês passado: ${mes.previous ?? 0}`, mes.current > mes.previous);
            const ocup = clinicOverview.ocupacao_salas || {};
            updateKpiCard('ocupacao-salas-valor', `${(ocup.current ?? 0).toFixed(1)}%`,
                `vs mês passado: ${(ocup.previous ?? 0).toFixed(1)}%`, ocup.current < ocup.previous);
        }

        // ----- CLÍNICA: GRÁFICOS -----
        destroyChart('consultasChart');
        const consCtx = document.getElementById('consultasChart')?.getContext('2d');
        if (consCtx) {
            if (monthlyConsultations && monthlyConsultations.length) {
                const labels = monthlyConsultations.map(d => {
                    const [ano, mes] = d.mes.split('-');
                    return `${mes}/${ano}`;
                });
                charts.consultas = createBarChart(consCtx,
                    labels,
                    monthlyConsultations.map(d => d.total_consultas),
                    'Consultas',
                    '#27ae60'
                );
            } else {
                createNoDataMessage('consultasChart', 'Sem consultas no período');
            }
        }

        destroyChart('tempoMedioChart');
        const tempoCtx = document.getElementById('tempoMedioChart')?.getContext('2d');
        if (tempoCtx) {
            if (tempoMedio && tempoMedio.length) {
                charts.tempoMedio = createLineChart(tempoCtx,
                    tempoMedio.map(d => d.mes),
                    tempoMedio.map(d => d.tempo_medio),
                    'Minutos',
                    '#9b59b6'
                );
            } else {
                createNoDataMessage('tempoMedioChart', 'Sem dados de tempo médio');
            }
        }

        destroyChart('ocupacaoChart');
        const ocupCtx = document.getElementById('ocupacaoChart')?.getContext('2d');
        if (ocupCtx) {
            if (ocupacao && ocupacao.length) {
                const months = [...new Set(ocupacao.map(d => d.mes))].sort();
                const rooms = [...new Set(ocupacao.map(d => d.sala))].sort();
                const datasets = rooms.map((room, i) => ({
                    label: room,
                    data: months.map(m => {
                        const rec = ocupacao.find(d => d.mes === m && d.sala === room);
                        return rec ? rec.taxa_ocupacao : 0;
                    }),
                    backgroundColor: hexToRgba(['#3498db','#e74c3c','#2ecc71','#f39c12','#9b59b6'][i % 5], 0.7),
                    borderWidth: 1
                }));
                charts.ocupacao = new Chart(ocupCtx, {
                    type: 'bar',
                    data: {
                        labels: months.map(m => {
                            const [ano, mes] = m.split('-');
                            return `${mes}/${ano}`;
                        }),
                        datasets: datasets
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { y: { beginAtZero: true, max: 100 } }
                    }
                });
            } else {
                createNoDataMessage('ocupacaoChart', 'Sem dados de ocupação');
            }
        }

        destroyChart('consultasProfissionalChart');
        const profCtx = document.getElementById('consultasProfissionalChart')?.getContext('2d');
        if (profCtx) {
            if (consProf && consProf.length) {
                charts.consProf = createBarChart(profCtx,
                    consProf.map(d => d.professional_name),
                    consProf.map(d => d.count),
                    'Consultas',
                    '#4682B4'
                );
            } else {
                createNoDataMessage('consultasProfissionalChart', 'Sem dados de profissionais');
            }
        }

        destroyChart('consultasPlanoChart');
        const planoCtx = document.getElementById('consultasPlanoChart')?.getContext('2d');
        if (planoCtx) {
            if (consPlan && consPlan.length) {
                charts.consPlan = createBarChart(planoCtx,
                    consPlan.map(d => d.plano),
                    consPlan.map(d => d.count),
                    'Consultas',
                    '#e67e22'
                );
            } else {
                createNoDataMessage('consultasPlanoChart', 'Sem consultas por plano');
            }
        }

        destroyChart('forecastChart');
        const forecastCtx = document.getElementById('forecastChart')?.getContext('2d');
        if (forecastCtx) {
            if (consultationForecast && consultationForecast.length) {
                createForecastChart(forecastCtx, consultationForecast);
            } else {
                createNoDataMessage('forecastChart', 'Sem projeções');
            }
        }

        // ----- COORTE DE USO DA CLÍNICA -----
        createCohortTable(usageCohort);

        showToast('Dashboard atualizado com sucesso!', 'success');
    } catch (err) {
        console.error('Erro ao carregar dashboard:', err);
        showToast('Erro ao carregar dados do dashboard.', 'error');
    }
}

// ---------- LISTENER DO FILTRO ----------
document.addEventListener('DOMContentLoaded', () => {
    const filterBtn = document.getElementById('filter-dashboard-btn');
    if (filterBtn) {
        filterBtn.addEventListener('click', () => {
            loadDashboardView();
        });
    }
});
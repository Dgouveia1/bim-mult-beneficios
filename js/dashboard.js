import { _supabase } from './supabase.js';
import { showToast } from './utils.js';

// Função auxiliar para formatar cores (HEX para RGBA)
function hexToRgba(hex, alpha = 1) {
    const h = hex.replace('#','');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- DATA FETCHING SEGURO ---
// Helper para fazer chamadas RPC seguras que não quebram o Promise.all se falharem
async function safeRpc(rpcName, params = {}) {
    try {
        const { data, error } = await _supabase.rpc(rpcName, params);
        if (error) {
            console.warn(`⚠️ Erro na métrica ${rpcName}:`, error.message);
            return []; // Retorna array vazio em caso de erro para não quebrar o gráfico
        }
        return data || [];
    } catch (err) {
        console.error(`❌ Exceção na métrica ${rpcName}:`, err);
        return [];
    }
}

async function fetchFinancialData(planFilter = 'all') {
    const { data, error } = await _supabase.rpc('get_financial_metrics', { plan_filter: planFilter });
    if (error) { console.error('Erro Financeiro:', error); return {}; }
    return data || {};
}

async function fetchClinicOverview(planFilter = 'all') {
    const { data, error } = await _supabase.rpc('get_clinic_overview', { plan_filter: planFilter });
    if (error) { console.error('Erro Clínica:', error); return {}; }
    return data || {};
}

async function fetchCardOverview(planFilter = 'all') {
    const { data, error } = await _supabase.rpc('get_card_overview', { plan_filter: planFilter });
    if (error) { console.error('Erro Cartão:', error); return {}; }
    return data || {};
}

async function fetchChartData(planFilter = 'all') {
    const params = { plan_filter: planFilter };
    
    // Usamos o safeRpc para garantir que um erro 400 não pare todo o dashboard
    const [
        titularesData, consultasProfissionalData,
        cohortData, forecastData,
        funnelData, acquisitionForecastData,
        churnRiskData, consultasPlanoData,
        churnData, inadimplenciaData,
        tempoMedioData, ocupacaoData
    ] = await Promise.all([
        safeRpc('get_weekly_titulares', params),
        safeRpc('get_consultations_by_professional', params),
        safeRpc('get_monthly_cohorts', params),
        safeRpc('get_consultation_forecast', params),
        safeRpc('get_today_funnel_status', params),
        safeRpc('get_client_acquisition_forecast', params),
        safeRpc('get_churn_risk_clients'), // Sem params propositalmente
        safeRpc('get_consultations_by_plan', params),
        safeRpc('get_churn_data', params),
        safeRpc('get_inadimplencia_data', params),
        safeRpc('get_tempo_medio_consultas', params),
        safeRpc('get_taxa_ocupacao', params)
    ]);

    return { 
        titularesData, consultasProfissionalData, 
        cohortData, funnelData,
        forecastData, acquisitionForecastData,
        churnRiskData, consultasPlanoData,
        churnData, inadimplenciaData,
        tempoMedioData, ocupacaoData
    };
}

async function fetchReportData() {
    const { data, error } = await _supabase.rpc('get_client_report_data');
    if (error) { showToast('Falha ao gerar relatório.', 'error'); return null; }
    return data;
}

// --- UI UPDATES ---

function updateKpiCard(idPrefix, data, period = 'período') {
    const valorEl = document.getElementById(`${idPrefix}-valor`);
    const compEl = document.getElementById(`${idPrefix}-comp`);
    if (!valorEl || !compEl) return;

    const current = (typeof data?.current === 'number') ? data.current : 0;
    const previous = (typeof data?.previous === 'number') ? data.previous : 0;

    valorEl.textContent = current.toLocaleString('pt-BR');
    compEl.classList.remove('positive', 'negative');

    if (previous === 0) {
        compEl.textContent = current > 0 ? `+${current} vs ${period} passado` : `vs ${period} passado`;
        if (current > 0) compEl.classList.add('positive');
        return;
    }

    const percentageChange = ((current - previous) / previous) * 100;
    if (percentageChange >= 0) {
        compEl.textContent = `+${percentageChange.toFixed(1)}% vs ${period} passado`;
        compEl.classList.add('positive');
    } else {
        compEl.textContent = `${percentageChange.toFixed(1)}% vs ${period} passado`;
        compEl.classList.add('negative');
    }
}

function updateKpiCardPercentage(idPrefix, data, period = 'período') {
    const valorEl = document.getElementById(`${idPrefix}-valor`);
    const compEl = document.getElementById(`${idPrefix}-comp`);
    if (!valorEl || !compEl) return;

    const current = (typeof data?.current === 'number') ? data.current : 0;
    const previous = (typeof data?.previous === 'number') ? data.previous : 0;

    valorEl.textContent = `${current.toFixed(1)}%`;
    compEl.classList.remove('positive', 'negative');
    
    const change = current - previous;
    if (change <= 0) {
        compEl.textContent = `${change.toFixed(1)} pp vs ${period} passado`;
        compEl.classList.add('positive');
    } else {
        compEl.textContent = `+${change.toFixed(1)} pp vs ${period} passado`;
        compEl.classList.add('negative');
    }
}

function updateFinancialCard(idPrefix, data, period = 'mês') {
    const valorEl = document.getElementById(`${idPrefix}-valor`);
    const compEl = document.getElementById(`${idPrefix}-comp`);
    if (!valorEl || !compEl) return;

    const current = (typeof data?.current === 'number') ? data.current : 0;
    const previous = (typeof data?.previous === 'number') ? data.previous : 0;

    valorEl.textContent = current.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    compEl.classList.remove('positive', 'negative');

    if (previous === 0) {
        compEl.textContent = current > 0 ? `+${current.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} vs ${period} anterior` : `vs ${period} anterior`;
        if (current > 0) compEl.classList.add('positive');
        return;
    }

    const percentageChange = ((current - previous) / previous) * 100;
    if (percentageChange >= 0) {
        compEl.textContent = `+${percentageChange.toFixed(1)}% vs ${period} anterior`;
        compEl.classList.add('positive');
    } else {
        compEl.textContent = `${percentageChange.toFixed(1)}% vs ${period} anterior`;
        compEl.classList.add('negative');
    }
}

// --- CHARTS INITIALIZATION ---

function clearCharts() {
    if (window.Chart) {
        Object.values(window.Chart.instances).forEach(chart => chart.destroy());
    }
    const cohortContainer = document.getElementById('cohort-chart-container');
    if (cohortContainer) cohortContainer.innerHTML = 'Carregando...';
}

function initializeForecastChart(data, elementId) {
    const ctx = document.getElementById(elementId)?.getContext('2d');
    if (!ctx || !data) return;

    const labels = data.map(d => {
        const date = new Date(d.week_start);
        return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}`;
    });

    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();
    const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--secondary-color').trim();

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Realizado',
                    data: data.map(d => !d.is_forecast ? d.count : null),
                    backgroundColor: hexToRgba(secondaryColor, 0.8),
                    order: 2,
                },
                {
                    label: 'Previsão',
                    data: data.map(d => d.is_forecast ? d.count : null),
                    type: 'line',
                    borderColor: accentColor,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 5,
                    pointBackgroundColor: accentColor,
                    order: 1,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } },
            scales: { x: { stacked: true, grid: { display: false } }, y: { beginAtZero: true } }
        }
    });
}

function initializeFunnelChart(data) {
    const ctx = document.getElementById('funnelChart')?.getContext('2d');
    if (!ctx || !data) return;

    const labels = data.map(d => d.status_label);
    const values = data.map(d => d.count);
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Pacientes',
                data: values,
                backgroundColor: [hexToRgba(primaryColor, 0.9), hexToRgba(primaryColor, 0.7), hexToRgba(primaryColor, 0.5), hexToRgba(primaryColor, 0.3)],
                borderColor: primaryColor,
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, grid: { display: false } }, y: { grid: { display: false } } }
        }
    });
}

function initializeCohortChart(data) {
    const container = document.getElementById('cohort-chart-container');
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = '<p>Dados insuficientes.</p>';
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

    for (const month in cohorts) {
        const c = cohorts[month];
        html += `<tr><td>${month}</td><td>${c.total}</td>`;
        for (let i = 0; i <= maxMonth; i++) {
            if (c.months[i] !== undefined) {
                const pct = (c.months[i] / c.total) * 100;
                const alpha = pct / 100;
                html += `<td style="background-color: rgba(70, 130, 180, ${alpha}); color: ${alpha > 0.5 ? '#fff':'#000'}">${pct.toFixed(0)}%</td>`;
            } else {
                html += '<td></td>';
            }
        }
        html += '</tr>';
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function initializeTitularesChart(data) {
    const ctx = document.getElementById('titularesChart')?.getContext('2d');
    if (!ctx || !data) return;

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.week_label),
            datasets: [{
                label: 'Titulares Ativos (Acumulado)',
                data: data.map(d => d.cumulative_count),
                borderColor: '#4682B4',
                backgroundColor: 'rgba(70, 130, 180, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
        }
    });
}

function initializeConsultasProfissionalChart(data) {
    const ctx = document.getElementById('consultasProfissionalChart')?.getContext('2d');
    if (!ctx || !data) return;

    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.professional_name),
            datasets: [{
                label: 'Consultas',
                data: data.map(d => d.count),
                backgroundColor: hexToRgba(primaryColor, 0.8),
                borderColor: primaryColor,
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

function initializeChurnChart(data) {
    const ctx = document.getElementById('churnChart')?.getContext('2d');
    if (!ctx || !data) return;

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.mes),
            datasets: [{
                label: 'Churn Rate (%)',
                data: data.map(d => d.taxa_churn),
                backgroundColor: hexToRgba('#e74c3c', 0.8),
                borderColor: '#e74c3c',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, max: 100 } }
        }
    });
}

function initializeInadimplenciaChart(data) {
    const ctx = document.getElementById('inadimplenciaChart')?.getContext('2d');
    if (!ctx || !data) return;

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.mes),
            datasets: [{
                label: 'Inadimplência (%)',
                data: data.map(d => d.taxa_inadimplencia),
                backgroundColor: hexToRgba('#f39c12', 0.8),
                borderColor: '#f39c12',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, max: 100 } }
        }
    });
}

function initializeConsultasChart(data) {
    const ctx = document.getElementById('consultasChart')?.getContext('2d');
    if (!ctx || !data) return;

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.mes),
            datasets: [{
                label: 'Consultas',
                data: data.map(d => d.total_consultas),
                backgroundColor: hexToRgba('#27ae60', 0.8),
                borderColor: '#27ae60',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

function initializeTempoMedioChart(data) {
    const ctx = document.getElementById('tempoMedioChart')?.getContext('2d');
    if (!ctx || !data) return;

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.mes),
            datasets: [{
                label: 'Tempo Médio (minutos)',
                data: data.map(d => d.tempo_medio),
                borderColor: '#9b59b6',
                backgroundColor: 'rgba(155, 89, 182, 0.1)',
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

function initializeOcupacaoChart(data) {
    const ctx = document.getElementById('ocupacaoChart')?.getContext('2d');
    if (!ctx || !data) return;

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.mes),
            datasets: [{
                label: 'Taxa de Ocupação (%)',
                data: data.map(d => d.taxa_ocupacao),
                backgroundColor: hexToRgba('#3498db', 0.8),
                borderColor: '#3498db',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, max: 100 } }
        }
    });
}

function initializeConsultasPlanoChart(data) {
    const ctx = document.getElementById('consultasPlanoChart')?.getContext('2d');
    if (!ctx || !data) return;

    const colors = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6'];

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.plano),
            datasets: [{
                label: 'Consultas por Plano',
                data: data.map(d => d.count),
                backgroundColor: colors.slice(0, data.length),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

// --- EXPORT & MAIN LOGIC ---

function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    for (const row of data) {
        const values = headers.map(header => `"${('' + row[header]).replace(/"/g, '""')}"`);
        csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
}

function downloadCSV(csvString, fileName) {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Função principal exportada para carregar o dashboard
export async function loadDashboardView() {
    const dashboardPage = document.getElementById('dashboardPage');
    if (!dashboardPage) return;

    console.log('📊 Carregando Dashboard...');
    clearCharts();

    // Setup Listeners se ainda não foram adicionados
    const filterBtn = document.getElementById('filter-dashboard-btn');
    if (filterBtn && !filterBtn.dataset.listening) {
        filterBtn.dataset.listening = 'true';
        filterBtn.addEventListener('click', () => runDashboardUpdate());
    }

    const exportGeralBtn = document.getElementById('export-geral-btn');
    if (exportGeralBtn && !exportGeralBtn.dataset.listening) {
        exportGeralBtn.dataset.listening = 'true';
        exportGeralBtn.addEventListener('click', async () => {
            exportGeralBtn.disabled = true;
            exportGeralBtn.textContent = 'Gerando...';
            const data = await fetchReportData();
            if (data && data.length > 0) downloadCSV(convertToCSV(data), 'relatorio_geral.csv');
            else showToast('Sem dados para exportar.', 'info');
            exportGeralBtn.disabled = false;
            exportGeralBtn.textContent = 'Relatório Geral';
        });
    }

    const exportChurnBtn = document.getElementById('export-churn-btn');
    if (exportChurnBtn && !exportChurnBtn.dataset.listening) {
        exportChurnBtn.dataset.listening = 'true';
        exportChurnBtn.addEventListener('click', async () => {
            exportChurnBtn.disabled = true;
            exportChurnBtn.textContent = 'Gerando...';
            const { churnRiskData } = await fetchChartData('all');
            if (churnRiskData && churnRiskData.length > 0) downloadCSV(convertToCSV(churnRiskData), 'risco_churn.csv');
            else showToast('Sem clientes em risco.', 'info');
            exportChurnBtn.disabled = false;
            exportChurnBtn.textContent = 'Relatório Churn';
        });
    }

    await runDashboardUpdate();
}

async function runDashboardUpdate() {
    const checkboxes = document.querySelectorAll('input[name="dash-plan"]:checked');
    const selectedPlans = Array.from(checkboxes).map(cb => cb.value);
    const planFilter = selectedPlans.length > 0 ? selectedPlans.join(',') : 'all';

    const filterBtn = document.getElementById('filter-dashboard-btn');
    if(filterBtn) { filterBtn.disabled = true; filterBtn.textContent = 'Carregando...'; }

    try {
        const [financialData, clinicData, cardData, chartsData] = await Promise.all([
            fetchFinancialData(planFilter),
            fetchClinicOverview(planFilter),
            fetchCardOverview(planFilter),
            fetchChartData(planFilter)
        ]);

        // Update Financial KPIs
        updateFinancialCard('faturamento-bruto', financialData.faturamento_bruto);
        updateFinancialCard('faturamento-liquido', financialData.faturamento_liquido);
        
        const expectativaEl = document.getElementById('expectativa-faturamento-valor');
        if (expectativaEl) {
            expectativaEl.textContent = financialData.expectativa_faturamento?.current?.toLocaleString('pt-BR', { 
                style: 'currency', currency: 'BRL' 
            }) || 'R$ 0,00';
        }

        // Update Clinic Overview
        const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        setTxt('consultas-hoje', clinicData.consultas_hoje || 0);
        updateKpiCard('consultas-semana', clinicData.consultas_semana, 'semana');
        updateKpiCard('consultas-mes', clinicData.consultas_mes, 'mês');
        updateKpiCardPercentage('ocupacao-salas', clinicData.ocupacao_salas, 'mês');

        // Update Card Overview
        setTxt('titulares-ativos', cardData.titulares_ativos || 0);
        updateKpiCard('novos-titulares-semana', cardData.novos_titulares_semana, 'semana');
        updateKpiCard('novos-titulares-mes', cardData.novos_titulares_mes, 'mês');
        
        // Update Status Grid
        setTxt('status-ativos', cardData.status_ativos || 0);
        setTxt('status-atraso', cardData.status_atraso || 0);
        setTxt('status-cancelados', cardData.status_cancelados || 0);
        
        // Update Churn
        setTxt('churn-total', cardData.churn_total || 0);
        updateKpiCardPercentage('churn-percentual', cardData.churn_percentual, 'mês');

        // Initialize Charts
        initializeTitularesChart(chartsData.titularesData);
        initializeCohortChart(chartsData.cohortData);
        initializeFunnelChart(chartsData.funnelData);
        initializeForecastChart(chartsData.forecastData, 'forecastChart');
        initializeForecastChart(chartsData.acquisitionForecastData, 'acquisitionForecastChart');
        initializeConsultasProfissionalChart(chartsData.consultasProfissionalData);
        initializeConsultasPlanoChart(chartsData.consultasPlanoData);
        initializeChurnChart(chartsData.churnData);
        initializeInadimplenciaChart(chartsData.inadimplenciaData);
        initializeConsultasChart(chartsData.consultasChart);
        initializeTempoMedioChart(chartsData.tempoMedioData);
        initializeOcupacaoChart(chartsData.ocupacaoData);

    } catch (e) {
        console.error("Erro no dashboard:", e);
        showToast('Erro parcial ao atualizar dashboard. Verifique o console.', 'info'); // Mensagem mais suave
    } finally {
        if(filterBtn) { filterBtn.disabled = false; filterBtn.textContent = 'Filtrar'; }
    }
}
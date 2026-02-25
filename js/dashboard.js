import { _supabase } from './supabase.js';
import { showToast } from './utils.js';

// ---------- HELPER SEGURO ----------
async function safeRpc(rpcName, params = {}) {
    try {
        const { data, error } = await _supabase.rpc(rpcName, params);
        if (error) {
            console.warn(`⚠️ RPC ${rpcName}:`, error.message);
            return null;
        }
        return data;
    } catch (err) {
        console.error(`❌ Exceção em ${rpcName}:`, err);
        return null;
    }
}

// ---------- HELPERS DE UI ----------
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '--';
}

function setComp(id, text, positive = null) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text ?? '';
    el.classList.remove('positive', 'negative');
    if (positive === true) el.classList.add('positive');
    else if (positive === false) el.classList.add('negative');
}

function fmtBRL(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val ?? 0);
}

function fmtPct(val, decimals = 1) {
    return `${(val ?? 0).toFixed(decimals)}%`;
}

function fmtDelta(current, previous, label = 'anterior') {
    if (!previous || previous === 0) return `vs ${label}`;
    const d = ((current - previous) / previous) * 100;
    return `${d > 0 ? '+' : ''}${d.toFixed(1)}% vs ${label}`;
}

// ---------- CHAMADAS RPC ----------
async function fetchDashboardOverviewCartao() {
    return safeRpc('get_dashboard_overview_cartao');
}
async function fetchClinicOverviewNew() {
    return safeRpc('get_clinic_overview_new');
}
async function fetchCardMetrics() {
    return safeRpc('get_card_metrics');
}
async function fetchActiveClientsHistory() {
    return safeRpc('get_active_clients_history');
}
async function fetchOverduePctCumulative() {
    return safeRpc('get_overdue_pct_cumulative');
}
async function fetchCohortOverdueBySafra() {
    return safeRpc('get_cohort_overdue_by_safra');
}
async function fetchPlanSegmentation() {
    return safeRpc('get_plan_segmentation');
}
async function fetchSalesDashboard() {
    return safeRpc('get_sales_dashboard');
}
// Mantidas para Métricas da Clínica
async function fetchMonthlyConsultations() {
    return safeRpc('get_monthly_consultations', { plan_filter: 'all' });
}
async function fetchTempoMedioConsultas() {
    return safeRpc('get_tempo_medio_consultas', { plan_filter: 'all' });
}
async function fetchTaxaOcupacao() {
    return safeRpc('get_taxa_ocupacao', { plan_filter: 'all' });
}
async function fetchConsultationsByProfessional() {
    return safeRpc('get_consultations_by_professional', { plan_filter: 'all' });
}
async function fetchConsultationsByPlan() {
    return safeRpc('get_consultations_by_plan', { plan_filter: 'all' });
}
async function fetchCardUsageCohort() {
    return safeRpc('get_card_usage_cohort', { plan_filter: 'Bim Familiar,Bim Individual' });
}

// ---------- GRÁFICOS ----------
let charts = {};
function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}
function hexToRgba(hex, alpha = 1) {
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function noData(canvasId, msg = 'Sem dados') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '14px Arial';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
}
function createBarChart(canvasId, labels, data, label, color = '#4682B4') {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (!labels || labels.length === 0) { noData(canvasId); return; }
    charts[canvasId] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label, data, backgroundColor: hexToRgba(color, 0.8), borderColor: color, borderWidth: 1 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}
function createLineChart(canvasId, labels, data, label, color = '#4682B4') {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (!labels || labels.length === 0) { noData(canvasId); return; }
    charts[canvasId] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{ label, data, borderColor: color, backgroundColor: hexToRgba(color, 0.1), fill: true, tension: 0.3 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true } }
        }
    });
}

// ---------- TABELA COORTE INADIMPLÊNCIA (HEATMAP) ----------
// Recebe: [{acquisition_month, month_number, total_in_cohort, overdue_count, overdue_pct}]
// Linhas = safra (YYYY/MM), Colunas = Mês 0, Mês 1, Mês 2...
function renderCohortOverdueMatrix(data) {
    const container = document.getElementById('cohort-overdue-matrix');
    if (!container) return;
    if (!data || data.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:20px;color:#888;">Sem dados suficientes para coorte de inadimplência.</p>';
        return;
    }
    // Pivot
    const cohorts = [...new Set(data.map(r => r.acquisition_month))].sort();
    const maxMonth = Math.max(...data.map(r => r.month_number));
    // Map lookup: cohort → month_number → overdue_pct
    const map = {};
    data.forEach(r => {
        if (!map[r.acquisition_month]) map[r.acquisition_month] = {};
        map[r.acquisition_month][r.month_number] = { pct: r.overdue_pct, cnt: r.overdue_count, total: r.total_in_cohort };
    });

    let html = '<div class="cohort-table-wrapper"><table class="cohort-table"><thead><tr><th>Safra</th><th>Total</th>';
    for (let m = 0; m <= maxMonth; m++) html += `<th>Mês ${m}</th>`;
    html += '</tr></thead><tbody>';

    cohorts.forEach(cohort => {
        // total from first row of this cohort
        const totalEntry = data.find(r => r.acquisition_month === cohort);
        const total = totalEntry ? totalEntry.total_in_cohort : 0;
        html += `<tr><td><strong>${cohort}</strong></td><td>${total}</td>`;
        for (let m = 0; m <= maxMonth; m++) {
            const cell = map[cohort]?.[m];
            if (!cell) {
                html += '<td style="background:#f8f8f8;color:#ccc;">-</td>';
            } else {
                const pct = cell.pct ?? 0;
                const alpha = Math.min(pct / 25, 1);
                const bg = `rgba(231,76,60,${alpha.toFixed(2)})`;
                const fg = alpha > 0.5 ? '#fff' : '#000';
                html += `<td style="background:${bg};color:${fg}" title="${cell.cnt} de ${total}">${pct.toFixed(1)}%</td>`;
            }
        }
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// ---------- COORTE DE USO DA CLÍNICA (substitui Retenção) ----------
// Recebe: [{cohort_month (YYYY/MM), month_number, total_in_cohort, used_clinic}]
function renderClinicUsageCohortTable(data) {
    const container = document.getElementById('cohort-chart-container');
    if (!container) return;
    if (!data || data.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:20px;">Dados insuficientes para coorte de uso da clínica.</p>';
        return;
    }
    // Pivot
    const cohorts = [...new Set(data.map(r => r.cohort_month))].sort();
    const maxMonth = Math.max(...data.map(r => r.month_number));
    const map = {};
    data.forEach(r => {
        if (!map[r.cohort_month]) map[r.cohort_month] = { total: r.total_in_cohort, months: {} };
        map[r.cohort_month].months[r.month_number] = r.used_clinic;
    });

    let html = '<div class="cohort-table-wrapper"><table class="cohort-table"><thead><tr><th>Safra</th><th>Total</th>';
    for (let m = 0; m <= maxMonth; m++) html += `<th>Mês ${m}</th>`;
    html += '</tr></thead><tbody>';

    cohorts.forEach(cohort => {
        const c = map[cohort];
        if (!c) return;
        html += `<tr><td><strong>${cohort}</strong></td><td>${c.total}</td>`;
        for (let m = 0; m <= maxMonth; m++) {
            const used = c.months[m] ?? null;
            if (used === null) {
                html += '<td style="background:#f8f8f8;color:#ccc;">-</td>';
            } else {
                const pct = c.total > 0 ? (used / c.total) * 100 : 0;
                const alpha = pct / 100;
                html += `<td style="background-color:rgba(70,130,180,${alpha.toFixed(2)});color:${alpha > 0.5 ? '#fff' : '#000'}" title="${used} de ${c.total}">${pct.toFixed(0)}%</td>`;
            }
        }
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// ---------- TABELA SEGMENTAÇÃO POR PLANO ----------
// Recebe: [{plan_name, total_ativos, novos_semana, novos_semana_anterior, novos_mes, novos_mes_anterior, taxa_inadimplencia, tempo_medio_atraso, uso_clinica_pct}]
function renderPlanSegmentationTable(data) {
    const tbody = document.getElementById('planSegmentationBody');
    if (!tbody) return;
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">Nenhum dado de segmentação.</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(row => {
        const novaSem = row.novos_semana ?? 0;
        const novaSemAnt = row.novos_semana_anterior ?? 0;
        const novaMes = row.novos_mes ?? 0;
        const novaMesAnt = row.novos_mes_anterior ?? 0;
        const semSign = novaSem > novaSemAnt ? '▲' : novaSem < novaSemAnt ? '▼' : '—';
        const mesSign = novaMes > novaMesAnt ? '▲' : novaMes < novaMesAnt ? '▼' : '—';
        const usoPct = row.uso_clinica_pct != null ? `${Number(row.uso_clinica_pct).toFixed(1)}%` : '--';
        return `<tr>
            <td><strong>${row.plan_name ?? '-'}</strong></td>
            <td>${row.total_ativos ?? 0}</td>
            <td>${novaSem} ${semSign} <small style="color:#888">vs ${novaSemAnt}</small></td>
            <td>${novaMes} ${mesSign} <small style="color:#888">vs ${novaMesAnt}</small></td>
            <td>${fmtPct(row.taxa_inadimplencia)}</td>
            <td>${row.tempo_medio_atraso != null ? `${Number(row.tempo_medio_atraso).toFixed(0)} dias` : '--'}</td>
            <td>${usoPct}</td>
        </tr>`;
    }).join('');
}

// ---------- FUNÇÃO PRINCIPAL ----------
export async function loadDashboardView() {
    console.log('📊 Carregando Dashboard (refatorado v2)');

    // Popula o select de planos se vazio
    const planFilterSelect = document.getElementById('dashboardPlanFilter');
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
        const [
            overviewCartao,
            clinicOverview,
            cardMetrics,
            activeClientsHistory,
            overduePctCumulative,
            cohortOverdueBySafra,
            planSegmentation,
            salesDashboard,
            monthlyConsultations,
            tempoMedio,
            ocupacao,
            consProf,
            consPlan,
            usageCohort
        ] = await Promise.all([
            fetchDashboardOverviewCartao(),
            fetchClinicOverviewNew(),
            fetchCardMetrics(),
            fetchActiveClientsHistory(),
            fetchOverduePctCumulative(),
            fetchCohortOverdueBySafra(),
            fetchPlanSegmentation(),
            fetchSalesDashboard(),
            fetchMonthlyConsultations(),
            fetchTempoMedioConsultas(),
            fetchTaxaOcupacao(),
            fetchConsultationsByProfessional(),
            fetchConsultationsByPlan(),
            fetchCardUsageCohort()
        ]);

        // ===== 1. OVERVIEW CARTÃO =====
        if (overviewCartao) {
            setText('cartao-receita-valor', fmtBRL(overviewCartao.receita_mes));
            setComp('cartao-receita-comp',
                fmtDelta(overviewCartao.receita_mes, overviewCartao.receita_mes_anterior, 'mês anterior'),
                (overviewCartao.receita_mes ?? 0) >= (overviewCartao.receita_mes_anterior ?? 0));
            setText('cartao-clientes-ativos', overviewCartao.clientes_ativos ?? 0);
            setText('cartao-taxa-inad-valor', fmtPct(overviewCartao.taxa_inadimplencia));
            setText('cartao-tempo-medio-atraso',
                `Tempo médio: ${overviewCartao.tempo_medio_atraso != null ? Number(overviewCartao.tempo_medio_atraso).toFixed(0) : '--'} dias`);
        }

        // ===== 2. OVERVIEW CLÍNICA =====
        if (clinicOverview) {
            setText('consultas-hoje', clinicOverview.consultas_hoje ?? 0);
            setComp('consultas-hoje-comp', `vs ontem: ${clinicOverview.consultas_ontem ?? 0}`);

            const sem = clinicOverview.consultas_semana ?? {};
            setText('consultas-semana-valor', sem.current ?? 0);
            setComp('consultas-semana-comp',
                `vs semana passada: ${sem.previous ?? 0}`,
                (sem.current ?? 0) >= (sem.previous ?? 0));

            const mes = clinicOverview.consultas_mes ?? {};
            setText('consultas-mes-valor', mes.current ?? 0);
            setComp('consultas-mes-comp',
                `vs mês passado: ${mes.previous ?? 0}`,
                (mes.current ?? 0) >= (mes.previous ?? 0));

            setText('ocupacao-salas-valor', fmtPct(clinicOverview.taxa_ocupacao));
            setComp('ocupacao-salas-comp', 'Seg-Sex 7h-18h / Sáb 7h-12h');
        }

        // ===== 3. MÉTRICAS CARTÃO =====
        if (cardMetrics) {
            setText('metricas-total-ativos', cardMetrics.total_ativos ?? 0);

            const nsem = cardMetrics.novos_semana ?? {};
            setText('metricas-novos-semana-valor', nsem.current ?? 0);
            setComp('metricas-novos-semana-comp',
                `vs semana passada: ${nsem.previous ?? 0}`,
                (nsem.current ?? 0) >= (nsem.previous ?? 0));

            const nmes = cardMetrics.novos_mes ?? {};
            setText('metricas-novos-mes-valor', nmes.current ?? 0);
            setComp('metricas-novos-mes-comp',
                `vs mês passado: ${nmes.previous ?? 0}`,
                (nmes.current ?? 0) >= (nmes.previous ?? 0));

            setText('metricas-taxa-inad-valor', fmtPct(cardMetrics.taxa_inadimplencia));
            setText('metricas-tempo-atraso',
                `Tempo médio: ${cardMetrics.tempo_medio_atraso != null ? Number(cardMetrics.tempo_medio_atraso).toFixed(0) : '--'} dias`);
        }

        // ===== 4. GRÁFICOS =====
        // Linha: Clientes Ativos Semanal
        if (activeClientsHistory && activeClientsHistory.length) {
            createLineChart('activeClientsChart',
                activeClientsHistory.map(d => d.week_label ?? d.week_start),
                activeClientsHistory.map(d => d.active_clients ?? d.cumulative_count),
                'Clientes Ativos', '#3498db');
        } else {
            noData('activeClientsChart', 'Sem dados de clientes ativos');
        }

        // Linha: % Inadimplência Acumulativa (eixo Y fixo 0–100)
        if (overduePctCumulative && overduePctCumulative.length) {
            destroyChart('overduePctChart');
            const overdueCanvas = document.getElementById('overduePctChart');
            if (overdueCanvas) {
                const color = '#e74c3c';
                charts['overduePctChart'] = new Chart(overdueCanvas.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: overduePctCumulative.map(d => d.week_label ?? d.week_start),
                        datasets: [{
                            label: '% Inadimplência',
                            data: overduePctCumulative.map(d => d.overdue_pct_cumulative ?? d.overdue_pct),
                            borderColor: color,
                            backgroundColor: hexToRgba(color, 0.1),
                            fill: true,
                            tension: 0.3
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: true } },
                        scales: {
                            y: {
                                min: 0,
                                max: 100,
                                ticks: { callback: val => val + '%' }
                            }
                        }
                    }
                });
            }
        } else {
            noData('overduePctChart', 'Sem dados de inadimplência');
        }

        // Coorte de Inadimplência (heatmap)
        renderCohortOverdueMatrix(cohortOverdueBySafra);

        // ===== 5. SEGMENTAÇÃO POR PLANO =====
        renderPlanSegmentationTable(planSegmentation);

        // ===== 6. VENDAS =====
        if (salesDashboard && salesDashboard.length) {
            const totalMes = salesDashboard.reduce((s, r) => s + (r.vendas_mes ?? 0), 0);
            const totalAnt = salesDashboard.reduce((s, r) => s + (r.vendas_mes_anterior ?? 0), 0);
            setText('vendas-mes-valor', totalMes);
            setComp('vendas-mes-comp', `vs mês anterior: ${totalAnt}`, totalMes >= totalAnt);
            const top = salesDashboard.reduce((best, cur) =>
                (cur.vendas_mes ?? 0) > (best.vendas_mes ?? 0) ? cur : best
                , salesDashboard[0]);
            setText('top-vendedor-nome', top.vendedor ?? '-');
            setText('top-vendedor-valor', `${top.vendas_mes ?? 0} vendas`);
            createBarChart('vendasVendedorChart',
                salesDashboard.map(s => s.vendedor),
                salesDashboard.map(s => s.vendas_mes),
                'Vendas', '#2ecc71');
        } else {
            setText('vendas-mes-valor', 0);
            setComp('vendas-mes-comp', 'vs mês anterior: 0');
            setText('top-vendedor-nome', '-');
            setText('top-vendedor-valor', '0 vendas');
            noData('vendasVendedorChart', 'Sem vendas no período');
        }

        // ===== 7. MÉTRICAS DA CLÍNICA =====
        if (monthlyConsultations && monthlyConsultations.length) {
            const labels = monthlyConsultations.map(d => {
                const [ano, mes] = d.mes.split('-');
                return `${mes}/${ano}`;
            });
            createBarChart('consultasChart', labels, monthlyConsultations.map(d => d.total_consultas), 'Consultas', '#27ae60');
        } else {
            noData('consultasChart', 'Sem consultas no período');
        }

        if (tempoMedio && tempoMedio.length) {
            createLineChart('tempoMedioChart',
                tempoMedio.map(d => d.mes),
                tempoMedio.map(d => d.tempo_medio),
                'Minutos', '#9b59b6');
        } else {
            noData('tempoMedioChart', 'Sem dados de tempo médio');
        }

        if (ocupacao && ocupacao.length) {
            destroyChart('ocupacaoChart');
            const ocupCanvas = document.getElementById('ocupacaoChart');
            if (ocupCanvas) {
                const months = [...new Set(ocupacao.map(d => d.mes))].sort();
                const rooms = [...new Set(ocupacao.map(d => d.sala))].sort();
                const datasets = rooms.map((room, i) => ({
                    label: room,
                    data: months.map(m => {
                        const rec = ocupacao.find(d => d.mes === m && d.sala === room);
                        return rec ? rec.taxa_ocupacao : 0;
                    }),
                    backgroundColor: hexToRgba(['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6'][i % 5], 0.7),
                    borderWidth: 1
                }));
                charts['ocupacaoChart'] = new Chart(ocupCanvas.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: months.map(m => { const [ano, mes] = m.split('-'); return `${mes}/${ano}`; }),
                        datasets
                    },
                    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
                });
            }
        } else {
            noData('ocupacaoChart', 'Sem dados de ocupação');
        }

        if (consProf && consProf.length) {
            createBarChart('consultasProfissionalChart',
                consProf.map(d => d.professional_name),
                consProf.map(d => d.count),
                'Consultas', '#4682B4');
        } else {
            noData('consultasProfissionalChart', 'Sem dados de profissionais');
        }

        if (consPlan && consPlan.length) {
            createBarChart('consultasPlanoChart',
                consPlan.map(d => d.plano),
                consPlan.map(d => d.count),
                'Consultas', '#e67e22');
        } else {
            noData('consultasPlanoChart', 'Sem consultas por plano');
        }

        // ===== 8. COORTE DE USO DA CLÍNICA =====
        renderClinicUsageCohortTable(usageCohort);

        showToast('Dashboard atualizado!', 'success');
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
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

// --- ESTATÍSTICA E PROJEÇÕES ---

// Calcula Regressão Linear Simples (y = mx + b)
function calculateLinearRegression(values) {
    const n = values.length;
    if (n === 0) return { slope: 0, intercept: 0 };
    
    const x = Array.from({length: n}, (_, i) => i); // [0, 1, 2...]
    const y = values;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    return { slope, intercept };
}

// Gera projeção avançada combinando tendência de aquisição e taxa de interesse (coorte)
function generateAdvancedForecasts(weeklyActiveClients, weeklyConsultations) {
    // 1. Preparar dados históricos (últimas 12 semanas)
    // Precisamos alinhar os arrays. Assumindo que ambos têm o mesmo tamanho e ordenação.
    const weeksCount = Math.min(weeklyActiveClients.length, weeklyConsultations.length);
    const activeClientsSlice = weeklyActiveClients.slice(-weeksCount);
    const consultationsSlice = weeklyConsultations.slice(-weeksCount);

    // 2. Calcular Taxa de Interesse Semanal (% de ativos que consultam)
    const interestRates = activeClientsSlice.map((clients, i) => {
        return clients > 0 ? (consultationsSlice[i] / clients) : 0;
    });
    
    // Média ponderada das últimas 4 semanas (dando mais peso ao recente) para a taxa
    const recentRates = interestRates.slice(-4);
    const avgInterestRate = recentRates.reduce((a, b) => a + b, 0) / (recentRates.length || 1);

    // 3. Projeção de Aquisição (Novos Clientes)
    // Derivar novos clientes por semana a partir do acumulado
    const newClientsPerWeek = [];
    for(let i = 1; i < activeClientsSlice.length; i++) {
        newClientsPerWeek.push(Math.max(0, activeClientsSlice[i] - activeClientsSlice[i-1]));
    }
    
    // Tendência de Novos Clientes
    const acquisitionTrend = calculateLinearRegression(newClientsPerWeek);
    
    // 4. Gerar Projeções (Próximas 4 semanas)
    const acquisitionForecast = [];
    const consultationForecast = [];
    
    let lastActiveCount = activeClientsSlice[activeClientsSlice.length - 1];
    
    const lastDate = new Date(); // Data base para projeção
    // Ajusta para o início da próxima semana
    lastDate.setDate(lastDate.getDate() + (7 - lastDate.getDay())); 

    for (let i = 0; i < 4; i++) {
        // Data da semana projetada
        const projDate = new Date(lastDate);
        projDate.setDate(projDate.getDate() + (i * 7));
        const dateStr = projDate.toISOString().split('T')[0];

        // A. Previsão de Novos Clientes (Baseado na tendência)
        // x para projeção é (length + i)
        const nextX = newClientsPerWeek.length + i;
        let projectedNewClients = (acquisitionTrend.slope * nextX) + acquisitionTrend.intercept;
        projectedNewClients = Math.max(0, Math.round(projectedNewClients)); // Não pode ser negativo

        acquisitionForecast.push({
            week_start: dateStr,
            count: projectedNewClients,
            is_forecast: true
        });

        // B. Atualiza base ativa projetada
        lastActiveCount += projectedNewClients;

        // C. Previsão de Consultas (Base Ativa Projetada * Taxa de Interesse Média)
        // Isso considera o "Coorte": se a base cresce, as consultas crescem proporcionalmente ao interesse.
        const projectedConsultations = Math.round(lastActiveCount * avgInterestRate);

        consultationForecast.push({
            week_start: dateStr,
            count: projectedConsultations,
            is_forecast: true
        });
    }

    return {
        acquisition: acquisitionForecast,
        consultation: consultationForecast
    };
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

// Busca Manual para Overview Clínica (Cards KPI)
async function fetchClinicOverviewManual(planFilter = 'all') {
    try {
        const today = new Date();
        
        const startCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const endLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
        
        const currentWeekStart = new Date(today);
        currentWeekStart.setDate(today.getDate() - today.getDay());
        currentWeekStart.setHours(0,0,0,0);
        
        const lastWeekStart = new Date(currentWeekStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const lastWeekEnd = new Date(currentWeekStart);
        lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
        lastWeekEnd.setHours(23,59,59,999);

        const MONTHLY_CAPACITY = 1408;

        let query = _supabase
            .from('appointments')
            .select(`
                appointment_date,
                status,
                clients!inner(plano)
            `)
            .gte('appointment_date', startLastMonth.toISOString().split('T')[0])
            .neq('status', 'cancelado');

        const { data, error } = await query;
        if (error) throw error;

        let countToday = 0;
        let countWeekCurrent = 0;
        let countWeekPrevious = 0;
        let countMonthCurrent = 0;
        let countMonthPrevious = 0;

        const todayStr = today.toISOString().split('T')[0];

        data.forEach(appt => {
            if (planFilter !== 'all') {
                if (appt.clients?.plano !== planFilter) return;
            }

            const apptDate = new Date(appt.appointment_date + 'T00:00:00');
            const apptDateStr = appt.appointment_date;

            if (apptDateStr === todayStr) countToday++;

            if (apptDate >= currentWeekStart) countWeekCurrent++;
            else if (apptDate >= lastWeekStart && apptDate <= lastWeekEnd) countWeekPrevious++;

            if (apptDate >= startCurrentMonth) countMonthCurrent++;
            else if (apptDate >= startLastMonth && apptDate <= endLastMonth) countMonthPrevious++;
        });

        const ocupacaoAtual = (countMonthCurrent / MONTHLY_CAPACITY) * 100;
        const ocupacaoAnterior = (countMonthPrevious / MONTHLY_CAPACITY) * 100;

        return {
            consultas_hoje: countToday,
            consultas_semana: { current: countWeekCurrent, previous: countWeekPrevious },
            consultas_mes: { current: countMonthCurrent, previous: countMonthPrevious },
            ocupacao_salas: { current: ocupacaoAtual, previous: ocupacaoAnterior }
        };

    } catch (e) {
        console.error("Erro no Overview Clínica Manual:", e);
        return {};
    }
}

// SUBSTITUIÇÃO: Busca Manual para Overview Cartão (Cards KPI)
async function fetchCardOverviewManual() {
    try {
        const planFilter = 'Bim Familiar'; // REGRA: Sempre fixo para métricas do cartão
        const today = new Date();
        
        // Definição de períodos
        const startCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const endLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
        
        const currentWeekStart = new Date(today);
        currentWeekStart.setDate(today.getDate() - today.getDay());
        currentWeekStart.setHours(0,0,0,0);
        
        const lastWeekStart = new Date(currentWeekStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const lastWeekEnd = new Date(currentWeekStart);
        lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
        lastWeekEnd.setHours(23,59,59,999);

        // Busca clientes filtrando APENAS o plano Bim Familiar
        const { data, error } = await _supabase
            .from('clients')
            .select('id, status, created_at, plano')
            .eq('plano', planFilter);

        if (error) throw error;

        let totalAtivos = 0;
        let newWeekCurr = 0;
        let newWeekPrev = 0;
        let newMonthCurr = 0;
        let newMonthPrev = 0;
        
        let statusAtivos = 0;
        let statusAtraso = 0;
        let statusCancelados = 0;
        
        // Mapeamento de status para os contadores
        data.forEach(client => {
            const createdAt = new Date(client.created_at);
            const status = client.status ? client.status.toUpperCase() : '';

            // Contagem de Status
            if (status === 'ATIVO') {
                totalAtivos++;
                statusAtivos++;
            } else if (status === 'INATIVO' || status === 'CANCELADO') {
                statusCancelados++;
            } else if (status === 'ATRASO' || status === 'DOACAO') {
                // Considerando Doação como ativo ou separado? 
                // Por enquanto, vamos agrupar Doação com Ativos se for o caso, ou Atraso se for pendente.
                // Vou mapear 'DOACAO' como Ativo para contagem geral de "Titulares Ativos" se fizer sentido, 
                // mas manterei separado nos status. Se 'ATRASO' existir, conta aqui.
                if (status === 'DOACAO') statusAtivos++; 
                else statusAtraso++;
            }

            // Novos Clientes (Aquisição)
            if (createdAt >= currentWeekStart) newWeekCurr++;
            else if (createdAt >= lastWeekStart && createdAt <= lastWeekEnd) newWeekPrev++;

            if (createdAt >= startCurrentMonth) newMonthCurr++;
            else if (createdAt >= startLastMonth && createdAt <= endLastMonth) newMonthPrev++;
        });

        // Churn Percentual (Baseado no total acumulado de cancelados vs ativos, já que não temos log mensal)
        // Se houver histórico, idealmente seria (Cancelados no Mês / Ativos Início Mês).
        // Como proxy, usamos a taxa atual.
        const totalBase = totalAtivos + statusCancelados + statusAtraso;
        const churnRate = totalBase > 0 ? (statusCancelados / totalBase) * 100 : 0;

        return {
            titulares_ativos: totalAtivos, // Card principal
            novos_titulares_semana: { current: newWeekCurr, previous: newWeekPrev },
            novos_titulares_mes: { current: newMonthCurr, previous: newMonthPrev },
            status_ativos: statusAtivos,
            status_atraso: statusAtraso,
            status_cancelados: statusCancelados,
            churn_total: statusCancelados, // Total acumulado
            churn_percentual: { current: churnRate, previous: 0 }
        };

    } catch (e) {
        console.error("Erro no Overview Cartão Manual:", e);
        return {};
    }
}

// NOVO: Busca Manual para Vendas por Vendedor (Bim Familiar)
async function fetchSalesBySellerManual() {
    try {
        const today = new Date();
        const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const endLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);

        // Busca clientes 'Bim Familiar' criados nos últimos 2 meses
        const { data, error } = await _supabase
            .from('clients')
            .select('vendedor, created_at, plano')
            .eq('plano', 'Bim Familiar')
            .gte('created_at', startLastMonth.toISOString());

        if (error) throw error;

        let salesCurrentMonth = 0;
        let salesLastMonth = 0;
        const sellerCountsCurrentMonth = {};

        data.forEach(client => {
            const createdAt = new Date(client.created_at);
            const seller = client.vendedor ? client.vendedor.trim() : 'Não Identificado';

            if (createdAt >= startMonth) {
                salesCurrentMonth++;
                if (!sellerCountsCurrentMonth[seller]) sellerCountsCurrentMonth[seller] = 0;
                sellerCountsCurrentMonth[seller]++;
            } else if (createdAt >= startLastMonth && createdAt <= endLastMonth) {
                salesLastMonth++;
            }
        });

        // Determinar Top Vendedor
        let topSellerName = '-';
        let topSellerCount = 0;
        
        Object.entries(sellerCountsCurrentMonth).forEach(([name, count]) => {
            if (count > topSellerCount) {
                topSellerCount = count;
                topSellerName = name;
            }
        });

        // Preparar dados para o gráfico (Ranking)
        const chartData = Object.entries(sellerCountsCurrentMonth)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count); // Ordem decrescente

        return {
            kpi: {
                total_current: salesCurrentMonth,
                total_previous: salesLastMonth,
                top_seller: topSellerName,
                top_seller_count: topSellerCount
            },
            chart: chartData
        };

    } catch (e) {
        console.error("Erro ao buscar vendas por vendedor:", e);
        return { kpi: {}, chart: [] };
    }
}

// BUSCA MANUAL PARA O GRÁFICO DE CONSULTAS (MENSAL - Histórico)
async function fetchMonthlyConsultationsManual(planFilter = 'all') {
    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); 
        sixMonthsAgo.setDate(1); 
        const dateStr = sixMonthsAgo.toISOString().split('T')[0];

        let query = _supabase
            .from('appointments')
            .select(`appointment_date, status, clients!inner(plano)`)
            .gte('appointment_date', dateStr)
            .neq('status', 'cancelado');

        const { data, error } = await query;
        if (error) throw error;

        const monthlyCounts = {};
        for (let i = 0; i < 6; i++) {
            const d = new Date(sixMonthsAgo);
            d.setMonth(d.getMonth() + i);
            const key = d.toISOString().slice(0, 7); 
            monthlyCounts[key] = 0;
        }

        data.forEach(appt => {
            if (planFilter !== 'all') {
                if (appt.clients?.plano !== planFilter) return;
            }
            const monthKey = appt.appointment_date.substring(0, 7);
            if (monthlyCounts[monthKey] !== undefined) {
                monthlyCounts[monthKey]++;
            }
        });

        return Object.entries(monthlyCounts).map(([mes, count]) => ({
            mes: mes, total_consultas: count
        })).sort((a, b) => a.mes.localeCompare(b.mes));

    } catch (e) {
        console.error("Erro ao calcular consultas mensais:", e);
        return [];
    }
}

// NOVO: Busca Semanal Manual para Projeções (Últimas 12 semanas)
async function fetchWeeklyDataForProjections(planFilter = 'all') {
    try {
        // Data de 12 semanas atrás
        const weeksAgo12 = new Date();
        weeksAgo12.setDate(weeksAgo12.getDate() - (12 * 7));
        const dateStr = weeksAgo12.toISOString().split('T')[0];

        // 1. Consultas Semanais
        let consultQuery = _supabase
            .from('appointments')
            .select(`appointment_date, status, clients!inner(plano)`)
            .gte('appointment_date', dateStr)
            .neq('status', 'cancelado');

        // 2. Clientes Ativos (Acumulado) Semanais
        // Como não temos histórico diário de status, usaremos created_at para simular o crescimento da base
        let clientQuery = _supabase
            .from('clients')
            .select(`created_at, plano`)
            .gte('created_at', dateStr) // Pegamos novos para calcular delta, e faremos count total separado
            .eq('status', 'ATIVO');

        const [consultRes, clientRes] = await Promise.all([consultQuery, clientQuery]);
        
        if (consultRes.error) throw consultRes.error;
        if (clientRes.error) throw clientRes.error;

        // --- Processamento Semanal ---
        const weeklyConsultations = Array(12).fill(0);
        const weeklyNewClients = Array(12).fill(0);
        const labels = [];

        // Definir buckets de semanas
        const now = new Date();
        // Ajusta para o domingo da semana atual
        const currentWeekEnd = new Date(now);
        currentWeekEnd.setDate(now.getDate() + (6 - now.getDay()));
        
        for (let i = 11; i >= 0; i--) {
            const end = new Date(currentWeekEnd);
            end.setDate(end.getDate() - (i * 7));
            const start = new Date(end);
            start.setDate(start.getDate() - 6);
            
            labels.push(start.toISOString().split('T')[0]); // Data de início da semana

            // Filtrar Consultas nesta semana
            const countConsults = consultRes.data.filter(c => {
                const d = new Date(c.appointment_date);
                const matchPlan = planFilter === 'all' || c.clients?.plano === planFilter;
                return d >= start && d <= end && matchPlan;
            }).length;
            weeklyConsultations[11 - i] = countConsults;

            // Filtrar Novos Clientes nesta semana
            const countClients = clientRes.data.filter(c => {
                const d = new Date(c.created_at);
                // NOTA: Para projeção de aquisição, geralmente olhamos o cartão (Bim Familiar)
                // Mas seguiremos o filtro se for aplicável
                const matchPlan = planFilter === 'all' || c.plano === planFilter; 
                return d >= start && d <= end && matchPlan;
            }).length;
            weeklyNewClients[11 - i] = countClients;
        }

        // Precisamos do TOTAL acumulado por semana para calcular a taxa de uso
        // Pegamos o total geral ANTES das 12 semanas
        const { count: totalPrior, error: countError } = await _supabase
            .from('clients')
            .select('*', { count: 'exact', head: true })
            .lt('created_at', dateStr)
            .eq('status', 'ATIVO')
            .match(planFilter !== 'all' ? { plano: planFilter } : {});
            
        let runningTotal = totalPrior || 0;
        const weeklyCumulativeClients = weeklyNewClients.map(newCount => {
            runningTotal += newCount;
            return runningTotal;
        });

        return {
            consultations: weeklyConsultations,
            activeClients: weeklyCumulativeClients,
            newClients: weeklyNewClients,
            weekLabels: labels
        };

    } catch (e) {
        console.error("Erro ao buscar dados semanais:", e);
        return null;
    }
}

// NOVO: Busca Manual para o Gráfico de Titulares (Substitui RPC bugada)
async function fetchWeeklyTitularesManual() {
    try {
        const planFilter = 'Bim Familiar';
        
        // Data de 12 semanas atrás (aproximada)
        const weeksAgo13 = new Date();
        weeksAgo13.setDate(weeksAgo13.getDate() - (13 * 7)); // Pegamos um pouco mais para garantir
        const dateStr = weeksAgo13.toISOString().split('T')[0];

        // 1. Clientes criados recentemente
        let clientQuery = _supabase
            .from('clients')
            .select(`created_at`)
            .gte('created_at', dateStr) 
            .eq('status', 'ATIVO')
            .eq('plano', planFilter);

        // 2. Contagem total anterior a data de corte
        let countQuery = _supabase
            .from('clients')
            .select('*', { count: 'exact', head: true })
            .lt('created_at', dateStr)
            .eq('status', 'ATIVO')
            .eq('plano', planFilter);

        const [clientRes, countRes] = await Promise.all([clientQuery, countQuery]);
        
        if (clientRes.error) throw clientRes.error;
        if (countRes.error) throw countRes.error;

        let runningTotal = countRes.count || 0;
        const resultData = [];

        // Definir buckets de semanas
        const now = new Date();
        const currentWeekEnd = new Date(now);
        // Ajusta para o próximo Sábado (fim da semana)
        currentWeekEnd.setDate(now.getDate() + (6 - now.getDay()));
        currentWeekEnd.setHours(23, 59, 59, 999);

        // Gera 12 semanas (11 passadas + atual)
        for (let i = 11; i >= 0; i--) {
            const end = new Date(currentWeekEnd);
            end.setDate(end.getDate() - (i * 7));
            
            const start = new Date(end);
            start.setDate(start.getDate() - 6);
            start.setHours(0, 0, 0, 0);
            
            // Filtra clientes nesta semana
            const countNew = clientRes.data.filter(c => {
                const d = new Date(c.created_at);
                return d >= start && d <= end;
            }).length;

            runningTotal += countNew;

            // Formata label DD/MM
            const day = String(start.getDate()).padStart(2, '0');
            const month = String(start.getMonth() + 1).padStart(2, '0');
            
            resultData.push({
                week_label: `${day}/${month}`,
                cumulative_count: runningTotal
            });
        }

        return resultData;

    } catch (e) {
        console.error("Erro ao calcular titulares semanais:", e);
        return [];
    }
}


async function fetchChartData(planFilter = 'all') {
    // REGRA DE NEGÓCIO: 
    // Métricas de Agenda/Clínica seguem o filtro selecionado.
    // Métricas do Cartão são FIXAS no "Bim Familiar".
    const clinicParams = { plan_filter: planFilter };
    const cardParams = { plan_filter: 'Bim Familiar' }; 
    
    const [
        titularesData, consultasProfissionalData,
        cohortData, // forecastData (RPC antigo ignorado)
        funnelData, // acquisitionForecastData (RPC antigo ignorado)
        churnRiskData, consultasPlanoData,
        churnData, inadimplenciaData,
        tempoMedioData, ocupacaoData,
        consultasChartData,
        weeklyData, // NOVO: Dados semanais para projeção inteligente
        salesData // NOVO: Dados de Vendas por Vendedor
    ] = await Promise.all([
        fetchWeeklyTitularesManual(), // CORREÇÃO: Substitui RPC get_weekly_titulares
        safeRpc('get_consultations_by_professional', clinicParams), // CLÍNICA
        safeRpc('get_monthly_cohorts', cardParams), // CARTÃO
        safeRpc('get_today_funnel_status', clinicParams), // CLÍNICA
        safeRpc('get_churn_risk_clients'), // GERAL
        safeRpc('get_consultations_by_plan', clinicParams), // CLÍNICA
        safeRpc('get_churn_data', cardParams), // CARTÃO
        safeRpc('get_inadimplencia_data', cardParams), // CARTÃO
        safeRpc('get_tempo_medio_consultas', clinicParams), // CLÍNICA
        safeRpc('get_taxa_ocupacao', clinicParams), // CLÍNICA (Gráfico de barras)
        fetchMonthlyConsultationsManual(planFilter), // CLÍNICA (Histórico Mensal)
        fetchWeeklyDataForProjections(planFilter), // CLÍNICA/CARTÃO (Dados para projeção)
        fetchSalesBySellerManual() // NOVO
    ]);

    // --- PROCESSAMENTO DA PROJEÇÃO INTELIGENTE ---
    let smartForecasts = { acquisition: [], consultation: [] };
    let historicalConsultations = [];
    let historicalAcquisition = [];

    if (weeklyData) {
        // Gera projeções matemáticas baseadas no histórico
        smartForecasts = generateAdvancedForecasts(weeklyData.activeClients, weeklyData.consultations);
        
        // Formata histórico para os gráficos (Realizado)
        historicalConsultations = weeklyData.weekLabels.map((date, i) => ({
            week_start: date,
            count: weeklyData.consultations[i],
            is_forecast: false
        }));

        historicalAcquisition = weeklyData.weekLabels.map((date, i) => ({
            week_start: date,
            count: weeklyData.newClients[i],
            is_forecast: false
        }));
    }

    // Combina Histórico + Projeção
    const finalConsultationForecast = [...historicalConsultations, ...smartForecasts.consultation];
    const finalAcquisitionForecast = [...historicalAcquisition, ...smartForecasts.acquisition];

    return { 
        titularesData, consultasProfissionalData, 
        cohortData, funnelData,
        forecastData: finalConsultationForecast, // Substitui RPC antigo
        acquisitionForecastData: finalAcquisitionForecast, // Substitui RPC antigo
        churnRiskData, consultasPlanoData,
        churnData, inadimplenciaData,
        tempoMedioData, ocupacaoData,
        consultasChartData,
        salesData // Retorna dados de vendas
    };
}

async function fetchReportData() {
    const { data, error } = await _supabase.rpc('get_client_report_data');
    if (error) { showToast('Falha ao gerar relatório.', 'error'); return null; }
    return data;
}

// --- NEW FUNCTION: POPULATE PLAN FILTER ---
async function populatePlanFilter() {
    const filterSelect = document.getElementById('dashboardPlanFilter');
    if (!filterSelect) return;

    if (filterSelect.options.length > 1) return;

    try {
        const { data, error } = await _supabase
            .from('clients')
            .select('plano')
            .not('plano', 'is', null);

        if (error) throw error;

        const uniquePlans = [...new Set(data.map(item => item.plano?.trim()).filter(p => p))].sort();

        uniquePlans.forEach(plan => {
            const option = document.createElement('option');
            option.value = plan;
            option.textContent = plan;
            filterSelect.appendChild(option);
        });

    } catch (error) {
        console.error('Erro ao carregar planos para filtro:', error);
    }
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

    // CORREÇÃO AQUI: Adicionei a lógica faltante e a chave de fechamento
    const percentageChange = ((current - previous) / previous) * 100;
    if (percentageChange >= 0) {
        compEl.textContent = `+${percentageChange.toFixed(1)}% vs ${period} anterior`;
        compEl.classList.add('positive');
    } else {
        compEl.textContent = `${percentageChange.toFixed(1)}% vs ${period} anterior`;
        compEl.classList.add('negative');
    }
}

function updateSalesKpi(kpiData) {
    const totalEl = document.getElementById('vendas-mes-valor');
    const compEl = document.getElementById('vendas-mes-comp');
    const topNameEl = document.getElementById('top-vendedor-nome');
    const topValEl = document.getElementById('top-vendedor-valor');

    if (!totalEl || !compEl || !topNameEl || !topValEl) return;

    // KPI 1: Total Vendas
    const current = kpiData.total_current || 0;
    const previous = kpiData.total_previous || 0;
    
    totalEl.textContent = current;
    compEl.classList.remove('positive', 'negative');

    if (previous === 0) {
        compEl.textContent = current > 0 ? `+${current} vs mês anterior` : `vs mês anterior`;
        if (current > 0) compEl.classList.add('positive');
    } else {
        const change = ((current - previous) / previous) * 100;
        compEl.textContent = `${change > 0 ? '+' : ''}${change.toFixed(1)}% vs mês anterior`;
        if (change >= 0) compEl.classList.add('positive');
        else compEl.classList.add('negative');
    }

    // KPI 2: Top Vendedor
    topNameEl.textContent = kpiData.top_seller || '-';
    topValEl.textContent = `${kpiData.top_seller_count || 0} vendas`;
}

// --- CHARTS INITIALIZATION ---

function clearCharts() {
    if (window.Chart) {
        Object.values(window.Chart.instances).forEach(chart => chart.destroy());
    }
    const cohortContainer = document.getElementById('cohort-chart-container');
    if (cohortContainer) cohortContainer.innerHTML = 'Carregando...';
}

function initializeSalesBySellerChart(data) {
    const ctx = document.getElementById('vendasVendedorChart')?.getContext('2d');
    if (!ctx) return;
    
    const safeData = data || [];

    // Cores (Laranja Bim)
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: safeData.map(d => d.name),
            datasets: [{
                label: 'Vendas',
                data: safeData.map(d => d.count),
                backgroundColor: hexToRgba(primaryColor, 0.8),
                borderColor: primaryColor,
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y', // Barra horizontal para melhor leitura dos nomes
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.parsed.x + ' vendas';
                        }
                    }
                }
            },
            scales: { x: { beginAtZero: true } }
        }
    });
}

function initializeForecastChart(data, elementId) {
    const ctx = document.getElementById(elementId)?.getContext('2d');
    if (!ctx) return;
    
    if (!data || data.length === 0) {
        return; 
    }

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
                    label: 'Projeção (Tendência)',
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
    if (!ctx) return;
    
    const safeData = data || [];

    const labels = safeData.map(d => d.status_label);
    const values = safeData.map(d => d.count);
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
        container.innerHTML = '<p style="text-align:center; padding: 20px;">Dados insuficientes para análise de coorte.</p>';
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
    if (!ctx) return;
    
    const safeData = data || [];

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: safeData.map(d => d.week_label),
            datasets: [{
                label: 'Titulares Ativos (Acumulado)',
                data: safeData.map(d => d.cumulative_count),
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
    if (!ctx) return;
    
    const safeData = data || [];

    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: safeData.map(d => d.professional_name),
            datasets: [{
                label: 'Consultas',
                data: safeData.map(d => d.count),
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
    if (!ctx) return;
    
    const safeData = data || [];

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: safeData.map(d => d.mes),
            datasets: [{
                label: 'Churn Rate (%)',
                data: safeData.map(d => d.taxa_churn),
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
    if (!ctx) return;
    
    const safeData = data || [];

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: safeData.map(d => d.mes),
            datasets: [{
                label: 'Inadimplência (%)',
                data: safeData.map(d => d.taxa_inadimplencia),
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
    if (!ctx) return;
    
    const safeData = data || [];

    new Chart(ctx, {
        type: 'bar',
        data: {
            // Formata YYYY-MM para MM/YYYY
            labels: safeData.map(d => {
                const parts = d.mes.split('-');
                return `${parts[1]}/${parts[0]}`;
            }),
            datasets: [{
                label: 'Consultas Realizadas',
                data: safeData.map(d => d.total_consultas),
                backgroundColor: hexToRgba('#27ae60', 0.8),
                borderColor: '#27ae60',
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

function initializeTempoMedioChart(data) {
    const ctx = document.getElementById('tempoMedioChart')?.getContext('2d');
    if (!ctx) return;
    
    const safeData = data || [];

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: safeData.map(d => d.mes),
            datasets: [{
                label: 'Tempo Médio (minutos)',
                data: safeData.map(d => d.tempo_medio),
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
    if (!ctx) return;
    
    // Se não houver dados, não tenta renderizar
    if (!data || data.length === 0) return;

    // 1. Extrair lista única de meses (Eixo X)
    const months = [...new Set(data.map(d => d.mes))].sort();
    
    // 2. Extrair lista única de salas (Legenda)
    const rooms = [...new Set(data.map(d => d.sala))].sort();

    // 3. Paleta de cores para diferenciar as salas
    const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#34495e'];

    // 4. Montar os Datasets (uma série de dados para cada sala)
    const datasets = rooms.map((room, index) => {
        return {
            label: room,
            data: months.map(m => {
                // Procura o valor específico para este Mês e Sala
                const record = data.find(d => d.mes === m && d.sala === room);
                return record ? record.taxa_ocupacao : 0;
            }),
            backgroundColor: hexToRgba(colors[index % colors.length], 0.7),
            borderColor: colors[index % colors.length],
            borderWidth: 1
        };
    });

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months.map(m => {
                // Formata 'YYYY-MM' para 'MM/YYYY'
                const [year, month] = m.split('-');
                return `${month}/${year}`;
            }),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'top' }, // Mostra a legenda para identificar as salas
                tooltip: { 
                    mode: 'index', 
                    intersect: false 
                }
            },
            scales: { 
                y: { 
                    beginAtZero: true, 
                    max: 100, // Limite visual de 100%, embora possa passar se houver overbooking
                    title: {
                        display: true,
                        text: 'Ocupação (%)'
                    }
                },
                x: {
                    stacked: false // Garante que as barras fiquem lado a lado para comparação
                }
            }
        }
    });
}

function initializeConsultasPlanoChart(data) {
    const ctx = document.getElementById('consultasPlanoChart')?.getContext('2d');
    if (!ctx) return;
    
    const safeData = data || [];

    const colors = ['#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6'];

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: safeData.map(d => d.plano),
            datasets: [{
                label: 'Consultas por Plano',
                data: safeData.map(d => d.count),
                backgroundColor: colors.slice(0, safeData.length),
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

    // Carrega as opções do filtro dinamicamente
    await populatePlanFilter();

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
    // NOVA LÓGICA DE FILTRO (Dropdown)
    const filterSelect = document.getElementById('dashboardPlanFilter');
    const planFilter = filterSelect ? filterSelect.value : 'all';

    const filterBtn = document.getElementById('filter-dashboard-btn');
    if(filterBtn) { filterBtn.disabled = true; filterBtn.textContent = 'Carregando...'; }

    try {
        const [financialData, clinicData, cardData, chartsData] = await Promise.all([
            fetchFinancialData(planFilter), // Financeiro segue a regra da clínica/agenda
            fetchClinicOverviewManual(planFilter), // Clínica segue o filtro, agora com cálculo manual ajustado
            fetchCardOverviewManual(), // REGRA: Cartão SEMPRE "Bim Familiar", calculado manualmente
            fetchChartData(planFilter) // Passa o filtro, mas dentro ele separa Card vs Clínica
        ]);

        // Update Financial KPIs
        updateFinancialCard('faturamento-bruto', financialData.faturamento_bruto);
        updateFinancialCard('faturamento-liquido', financialData.faturamento_liquido);
        
        const expectativaEl = document.getElementById('expectativa-faturamento-valor');
        if (expectativaEl) {
            const expVal = financialData.expectativa_faturamento?.current;
            expectativaEl.textContent = (typeof expVal === 'number') 
                ? expVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                : 'R$ 0,00';
        }

        // Update Clinic Overview
        const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
        setTxt('consultas-hoje', clinicData.consultas_hoje || 0);
        updateKpiCard('consultas-semana', clinicData.consultas_semana, 'semana');
        updateKpiCard('consultas-mes', clinicData.consultas_mes, 'mês');
        updateKpiCardPercentage('ocupacao-salas', clinicData.ocupacao_salas, 'mês');

        // Update Card Overview (Agora fixo em Bim Familiar)
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

        // NOVO: Update Sales KPIs
        if (chartsData.salesData?.kpi) {
            updateSalesKpi(chartsData.salesData.kpi);
        }

        // Initialize Charts
        initializeTitularesChart(chartsData.titularesData);
        initializeCohortChart(chartsData.cohortData);
        initializeFunnelChart(chartsData.funnelData);
        // Agora usa dados com inteligência preditiva
        initializeForecastChart(chartsData.forecastData, 'forecastChart');
        initializeForecastChart(chartsData.acquisitionForecastData, 'acquisitionForecastChart');
        initializeConsultasProfissionalChart(chartsData.consultasProfissionalData);
        initializeConsultasPlanoChart(chartsData.consultasPlanoData);
        initializeChurnChart(chartsData.churnData);
        initializeInadimplenciaChart(chartsData.inadimplenciaData);
        
        // NOVO: Gráfico de Vendas
        initializeSalesBySellerChart(chartsData.salesData?.chart);

        // Agora inicializamos o gráfico de consultas com dados reais processados
        initializeConsultasChart(chartsData.consultasChartData);
        
        initializeTempoMedioChart(chartsData.tempoMedioData);
        initializeOcupacaoChart(chartsData.ocupacaoData);

    } catch (e) {
        console.error("Erro no dashboard:", e);
        showToast('Erro parcial ao atualizar dashboard. Verifique o console.', 'info'); 
    } finally {
        if(filterBtn) { filterBtn.disabled = false; filterBtn.textContent = 'Filtrar'; }
    }
}
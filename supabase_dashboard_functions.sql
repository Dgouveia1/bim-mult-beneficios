-- =============================================================================
-- DASHBOARD RPC FUNCTIONS – CORREÇÃO FINAL
-- =============================================================================
-- CORREÇÃO: Palavra reservada 'exists' substituída por 'function_exists'
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. get_dashboard_overview_cartao
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_dashboard_overview_cartao()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result json;
    v_inicio_mes_atual  date := date_trunc('month', current_date)::date;
    v_inicio_mes_ant    date := date_trunc('month', current_date - interval '1 month')::date;
    v_fim_mes_ant       date := (date_trunc('month', current_date) - interval '1 day')::date;
    v_total_ativos       bigint;
    v_taxa_inadimplencia numeric;
    v_tempo_medio_atraso numeric;
BEGIN
    -- Total de titulares ativos (ATIVO ou ATRASO)
    SELECT COUNT(*) INTO v_total_ativos
    FROM clients 
    WHERE status IN ('ATIVO', 'ATRASO') 
      AND EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = clients.id);
    
    -- Taxa de inadimplência (% de titulares ativos com cobrança em atraso)
    SELECT COALESCE(
        ROUND(
            COUNT(DISTINCT ap.client_id)::numeric / 
            NULLIF(v_total_ativos, 0) * 100, 
        2), 0)
    INTO v_taxa_inadimplencia
    FROM asaas_payments ap
    JOIN clients c ON c.id = ap.client_id
    WHERE ap.status = 'OVERDUE' 
      AND EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = c.id)
      AND c.status IN ('ATIVO', 'ATRASO');
    
    -- Tempo médio de atraso em dias
    SELECT COALESCE(
        ROUND(AVG(current_date - ap.due_date)::numeric, 0), 0)
    INTO v_tempo_medio_atraso
    FROM asaas_payments ap
    JOIN clients c ON c.id = ap.client_id
    WHERE ap.status = 'OVERDUE' 
      AND EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = c.id)
      AND ap.due_date < current_date;

    SELECT json_build_object(
        'receita_mes',
            COALESCE((
                SELECT SUM(ap.amount)
                FROM asaas_payments ap
                JOIN clients c ON c.id = ap.client_id 
                WHERE EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = c.id)
                  AND ap.status IN ('RECEIVED', 'CONFIRMED')
                  AND ap.payment_date >= v_inicio_mes_atual
            ), 0),
        'receita_mes_anterior',
            COALESCE((
                SELECT SUM(ap.amount)
                FROM asaas_payments ap
                JOIN clients c ON c.id = ap.client_id
                WHERE EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = c.id)
                  AND ap.status IN ('RECEIVED', 'CONFIRMED')
                  AND ap.payment_date >= v_inicio_mes_ant
                  AND ap.payment_date <= v_fim_mes_ant
            ), 0),
        'clientes_ativos', v_total_ativos,
        'taxa_inadimplencia', v_taxa_inadimplencia,
        'tempo_medio_atraso', v_tempo_medio_atraso
    ) INTO v_result;
    
    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. get_clinic_overview_new (MANTIDA IGUAL - já estava correta)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_clinic_overview_new()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result            json;
    v_hoje              date := current_date;
    v_ontem             date := current_date - 1;
    v_semana_inicio     date := date_trunc('week', current_date)::date;
    v_semana_ant_inicio date := (date_trunc('week', current_date) - interval '7 days')::date;
    v_semana_ant_fim    date := date_trunc('week', current_date)::date - 1;
    v_mes_inicio        date := date_trunc('month', current_date)::date;
    v_mes_ant_inicio    date := date_trunc('month', current_date - interval '1 month')::date;
    v_mes_ant_fim       date := (date_trunc('month', current_date) - interval '1 day')::date;
    v_cap_min_dia_util  int  := 660; 
    v_cap_min_sabado    int  := 300; 
    v_duracao_media_min int  := 30;  
    v_slots_mes         int;
    v_consultas_mes_cnt int;
BEGIN
    SELECT
        SUM(CASE
            WHEN EXTRACT(DOW FROM gs.d) BETWEEN 1 AND 5 THEN v_cap_min_dia_util / v_duracao_media_min
            WHEN EXTRACT(DOW FROM gs.d) = 6 THEN v_cap_min_sabado / v_duracao_media_min
            ELSE 0
        END)
    INTO v_slots_mes
    FROM generate_series(v_mes_inicio, current_date - 1, '1 day'::interval) AS gs(d);

    SELECT COUNT(*) INTO v_consultas_mes_cnt
    FROM appointments
    WHERE appointment_date >= v_mes_inicio
      AND appointment_date < v_mes_inicio + interval '1 month'
      AND status = 'finalizado';

    SELECT json_build_object(
        'consultas_hoje',
            (SELECT COUNT(*) FROM appointments WHERE appointment_date = v_hoje AND status != 'cancelado'),
        'consultas_ontem',
            (SELECT COUNT(*) FROM appointments WHERE appointment_date = v_ontem AND status != 'cancelado'),
        'consultas_semana', json_build_object(
            'current', (SELECT COUNT(*) FROM appointments WHERE appointment_date >= v_semana_inicio AND appointment_date < v_semana_inicio + 7 AND status != 'cancelado'),
            'previous', (SELECT COUNT(*) FROM appointments WHERE appointment_date >= v_semana_ant_inicio AND appointment_date <= v_semana_ant_fim AND status != 'cancelado')
        ),
        'consultas_mes', json_build_object(
            'current',  (SELECT COUNT(*) FROM appointments WHERE appointment_date >= v_mes_inicio AND appointment_date < v_mes_inicio + interval '1 month' AND status != 'cancelado'),
            'previous', (SELECT COUNT(*) FROM appointments WHERE appointment_date >= v_mes_ant_inicio AND appointment_date <= v_mes_ant_fim AND status != 'cancelado')
        ),
        'taxa_ocupacao', CASE WHEN v_slots_mes > 0 THEN ROUND((v_consultas_mes_cnt::numeric / v_slots_mes) * 100, 1) ELSE 0 END
    ) INTO v_result;
    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. get_card_metrics
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_card_metrics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result            json;
    v_semana_inicio     date := date_trunc('week', current_date)::date;
    v_semana_ant_inicio date := (date_trunc('week', current_date) - interval '7 days')::date;
    v_semana_ant_fim    date := date_trunc('week', current_date)::date - 1;
    v_mes_inicio        date := date_trunc('month', current_date)::date;
    v_mes_ant_inicio    date := date_trunc('month', current_date - interval '1 month')::date;
    v_mes_ant_fim       date := (date_trunc('month', current_date) - interval '1 day')::date;
    v_total_ativos       bigint;
    v_taxa_inadimplencia numeric;
    v_tempo_medio_atraso numeric;
BEGIN
    -- Total de titulares ativos
    SELECT COUNT(*) INTO v_total_ativos
    FROM clients 
    WHERE status IN ('ATIVO', 'ATRASO') 
      AND EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = clients.id);
    
    -- Taxa de inadimplência
    SELECT COALESCE(
        ROUND(
            COUNT(DISTINCT ap.client_id)::numeric / 
            NULLIF(v_total_ativos, 0) * 100, 
        2), 0)
    INTO v_taxa_inadimplencia
    FROM asaas_payments ap
    JOIN clients c ON c.id = ap.client_id
    WHERE ap.status = 'OVERDUE' 
      AND EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = c.id)
      AND c.status IN ('ATIVO', 'ATRASO');
    
    -- Tempo médio de atraso
    SELECT COALESCE(
        ROUND(AVG(current_date - ap.due_date)::numeric, 0), 0)
    INTO v_tempo_medio_atraso
    FROM asaas_payments ap
    JOIN clients c ON c.id = ap.client_id
    WHERE ap.status = 'OVERDUE' 
      AND EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = c.id)
      AND ap.due_date < current_date;

    SELECT json_build_object(
        'total_ativos', v_total_ativos,
        'novos_semana', json_build_object(
            'current',  COALESCE((SELECT COUNT(*) FROM clients WHERE EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = clients.id) AND created_at::date >= v_semana_inicio), 0),
            'previous', COALESCE((SELECT COUNT(*) FROM clients WHERE EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = clients.id) AND created_at::date >= v_semana_ant_inicio AND created_at::date <= v_semana_ant_fim), 0)
        ),
        'novos_mes', json_build_object(
            'current',  COALESCE((SELECT COUNT(*) FROM clients WHERE EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = clients.id) AND created_at::date >= v_mes_inicio), 0),
            'previous', COALESCE((SELECT COUNT(*) FROM clients WHERE EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = clients.id) AND created_at::date >= v_mes_ant_inicio AND created_at::date <= v_mes_ant_fim), 0)
        ),
        'taxa_inadimplencia', v_taxa_inadimplencia,
        'tempo_medio_atraso', v_tempo_medio_atraso
    ) INTO v_result;
    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. get_active_clients_history
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_active_clients_history()
RETURNS TABLE (week_start text, week_label text, active_clients bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH weeks AS (
        SELECT generate_series(
            date_trunc('week', current_date - interval '16 weeks'),
            date_trunc('week', current_date),
            '1 week'::interval
        )::date AS week_start
    )
    SELECT
        to_char(w.week_start, 'YYYY-MM-DD'),
        to_char(w.week_start, 'DD/MM'),
        COUNT(c.id)::bigint
    FROM weeks w
    LEFT JOIN clients c ON
        EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = c.id)
        AND c.created_at::date <= (w.week_start + 6)
        AND c.status NOT IN ('CANCELADO', 'INATIVO')
    GROUP BY w.week_start
    ORDER BY w.week_start;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. get_overdue_pct_cumulative
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_overdue_pct_cumulative()
RETURNS TABLE (week_start text, week_label text, overdue_pct_cumulative numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH weeks AS (
        SELECT generate_series(
            date_trunc('week', current_date - interval '16 weeks'),
            date_trunc('week', current_date),
            '1 week'::interval
        )::date AS ws
    ),
    totals AS (
        SELECT COUNT(*) AS total_titulares 
        FROM clients 
        WHERE EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = clients.id)
    )
    SELECT
        to_char(w.ws, 'YYYY-MM-DD'),
        to_char(w.ws, 'DD/MM'),
        COALESCE(ROUND(
            COUNT(DISTINCT ap.client_id)::numeric / 
            NULLIF((SELECT total_titulares FROM totals), 0) * 100,
        2), 0)
    FROM weeks w
    LEFT JOIN asaas_payments ap ON ap.status = 'OVERDUE' AND ap.due_date <= w.ws + 6
    LEFT JOIN clients c ON c.id = ap.client_id AND EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = c.id)
    GROUP BY w.ws
    ORDER BY w.ws;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. get_cohort_overdue_by_safra
--    Linhas = safra (mês de aquisição YYYY/MM)
--    Colunas = Mês 0 (mês de aquisição), Mês 1, Mês 2...
--    Célula = % dos clientes dessa safra que tiveram pagamento OVERDUE
--             pela 1ª vez naquele mês desde o cadastro
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_cohort_overdue_by_safra()
RETURNS TABLE (
    acquisition_month text,
    month_number      int,
    total_in_cohort   bigint,
    overdue_count     bigint,
    overdue_pct       numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH titulares AS (
        -- data de aquisição e 1ª data de vencimento OVERDUE de cada titular
        SELECT
            c.id,
            date_trunc('month', c.created_at)::date AS cohort_start,
            (SELECT date_trunc('month', MIN(ap.due_date))::date
             FROM asaas_payments ap
             WHERE ap.client_id = c.id AND ap.status = 'OVERDUE'
            ) AS first_overdue_month
        FROM clients c
        WHERE EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = c.id)
          AND c.created_at >= current_date - interval '18 months'
    ),
    safra_totals AS (
        SELECT cohort_start, COUNT(*)::bigint AS total
        FROM titulares
        GROUP BY cohort_start
    ),
    safra_overdue AS (
        -- para cada titular inadimplente: month_number = quantos meses depois do cadastro
        SELECT
            t.cohort_start,
            EXTRACT(YEAR FROM AGE(t.first_overdue_month, t.cohort_start))::int * 12
            + EXTRACT(MONTH FROM AGE(t.first_overdue_month, t.cohort_start))::int AS mn,
            COUNT(*)::bigint AS cnt
        FROM titulares t
        WHERE t.first_overdue_month IS NOT NULL
        GROUP BY t.cohort_start, mn
    )
    SELECT
        to_char(st.cohort_start, 'YYYY/MM'),
        COALESCE(so.mn, 0)::int,
        st.total,
        COALESCE(so.cnt, 0)::bigint,
        ROUND(COALESCE(so.cnt, 0)::numeric / NULLIF(st.total, 0) * 100, 1)
    FROM safra_totals st
    LEFT JOIN safra_overdue so ON so.cohort_start = st.cohort_start
    WHERE so.mn IS NOT NULL
    ORDER BY st.cohort_start, so.mn;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. get_plan_segmentation
--    Apenas Bim Familiar e Bim Individual
--    + uso_clinica_pct: % de titulares cujos membros (titular+dependentes)
--      tiveram ao menos 1 consulta no mês atual
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_plan_segmentation()
RETURNS TABLE (
    plan_name            text,
    total_ativos         bigint,
    novos_semana         bigint,
    novos_semana_anterior bigint,
    novos_mes            bigint,
    novos_mes_anterior   bigint,
    taxa_inadimplencia   numeric,
    tempo_medio_atraso   numeric,
    uso_clinica_pct      numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_semana_inicio     date := date_trunc('week', current_date)::date;
    v_semana_ant_inicio date := (date_trunc('week', current_date) - interval '7 days')::date;
    v_semana_ant_fim    date := date_trunc('week', current_date)::date - 1;
    v_mes_inicio        date := date_trunc('month', current_date)::date;
    v_mes_ant_inicio    date := date_trunc('month', current_date - interval '1 month')::date;
    v_mes_ant_fim       date := (date_trunc('month', current_date) - interval '1 day')::date;
BEGIN
    RETURN QUERY
    WITH plan_base AS (
        SELECT 
            c.plano,
            COUNT(DISTINCT c.id) FILTER (WHERE c.status IN ('ATIVO', 'ATRASO')) AS totais,
            COUNT(DISTINCT c.id) FILTER (WHERE c.created_at::date >= v_semana_inicio) AS n_sem,
            COUNT(DISTINCT c.id) FILTER (WHERE c.created_at::date >= v_semana_ant_inicio AND c.created_at::date <= v_semana_ant_fim) AS n_sem_ant,
            COUNT(DISTINCT c.id) FILTER (WHERE c.created_at::date >= v_mes_inicio) AS n_mes,
            COUNT(DISTINCT c.id) FILTER (WHERE c.created_at::date >= v_mes_ant_inicio AND c.created_at::date <= v_mes_ant_fim) AS n_mes_ant
        FROM clients c
        WHERE EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = c.id)
          AND c.plano IN ('Bim Familiar', 'Bim Individual')
        GROUP BY c.plano
    ),
    overdue_stats AS (
        SELECT 
            c.plano,
            COUNT(DISTINCT c.id) AS qtd_em_divida,
            AVG(current_date - ap.due_date) AS avg_delay
        FROM clients c
        JOIN asaas_payments ap ON ap.client_id = c.id AND ap.status = 'OVERDUE'
        WHERE c.plano IN ('Bim Familiar', 'Bim Individual')
          AND ap.due_date < current_date
        GROUP BY c.plano
    ),
    -- % de titulares cujos membros (titular OU dependente) tiveram consulta no mês atual
    clinica_uso AS (
        SELECT c.plano, COUNT(DISTINCT c.id) AS titulares_com_uso
        FROM clients c
        WHERE c.plano IN ('Bim Familiar', 'Bim Individual')
          AND EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = c.id)
          AND (
              -- titular usou
              EXISTS (
                  SELECT 1 FROM appointments a
                  WHERE a.client_id = c.id
                    AND a.appointment_date >= v_mes_inicio
                    AND a.appointment_date < v_mes_inicio + interval '1 month'
                    AND a.status != 'cancelado'
              )
              OR
              -- dependente usou
              EXISTS (
                  SELECT 1 FROM appointments a
                  JOIN dependents d ON d.id = a.client_id
                  WHERE d.titular_id = c.id
                    AND a.appointment_date >= v_mes_inicio
                    AND a.appointment_date < v_mes_inicio + interval '1 month'
                    AND a.status != 'cancelado'
              )
          )
        GROUP BY c.plano
    )
    SELECT
        pb.plano::text,
        COALESCE(pb.totais, 0)::bigint,
        COALESCE(pb.n_sem, 0)::bigint,
        COALESCE(pb.n_sem_ant, 0)::bigint,
        COALESCE(pb.n_mes, 0)::bigint,
        COALESCE(pb.n_mes_ant, 0)::bigint,
        ROUND(COALESCE(os.qtd_em_divida, 0)::numeric / NULLIF(pb.totais, 0) * 100, 2),
        COALESCE(ROUND(os.avg_delay::numeric, 0), 0),
        ROUND(COALESCE(cu.titulares_com_uso, 0)::numeric / NULLIF(pb.totais, 0) * 100, 1)
    FROM plan_base pb
    LEFT JOIN overdue_stats os ON os.plano = pb.plano
    LEFT JOIN clinica_uso cu ON cu.plano = pb.plano
    ORDER BY pb.totais DESC NULLS LAST;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. get_sales_dashboard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_sales_dashboard()
RETURNS TABLE (
    vendedor            text,
    vendas_mes          bigint,
    vendas_mes_anterior bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_mes_inicio     date := date_trunc('month', current_date)::date;
    v_mes_ant_inicio date := date_trunc('month', current_date - interval '1 month')::date;
    v_mes_ant_fim    date := (date_trunc('month', current_date) - interval '1 day')::date;
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(c.vendedor, 'Sem Vendedor')::text,
        COUNT(DISTINCT c.id) FILTER (WHERE c.created_at::date >= v_mes_inicio)::bigint,
        COUNT(DISTINCT c.id) FILTER (WHERE c.created_at::date >= v_mes_ant_inicio AND c.created_at::date <= v_mes_ant_fim)::bigint
    FROM clients c
    WHERE EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = c.id)
    GROUP BY c.vendedor 
    ORDER BY vendas_mes DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. get_card_usage_cohort  – Coorte de Uso da Clínica
--    Safra = mês de aquisição do TITULAR
--    Uso = titular OU algum dependente fez >= 1 consulta naquele mês
--    Retorna: cohort_month (YYYY/MM), month_number, total_in_cohort, used_clinic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_card_usage_cohort(plan_filter text DEFAULT 'Bim Familiar,Bim Individual')
RETURNS TABLE (
    cohort_month    text,
    month_number    int,
    total_in_cohort bigint,
    used_clinic     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_plans text[];
BEGIN
    IF plan_filter = 'all' OR plan_filter IS NULL THEN
        v_plans := ARRAY(SELECT DISTINCT plano FROM clients WHERE plano IS NOT NULL);
    ELSE
        v_plans := string_to_array(plan_filter, ',');
    END IF;
    v_plans := ARRAY(SELECT trim(x) FROM unnest(v_plans) x);

    RETURN QUERY
    WITH titulares AS (
        -- Um titular por linha, com sua safra
        SELECT
            c.id AS titular_id,
            date_trunc('month', c.created_at)::date AS cohort_start
        FROM clients c
        WHERE EXISTS (SELECT 1 FROM dependents d WHERE d.titular_id = c.id)
          AND c.plano = ANY(v_plans)
          AND c.created_at >= '2023-01-01'
    ),
    months AS (
        SELECT generate_series(0, 11) AS mn
    ),
    -- Para cada combinação titular × mês, verificar se usou a clínica
    uso AS (
        SELECT
            t.titular_id,
            t.cohort_start,
            m.mn,
            -- mês alvo = cohort_start + mn meses
            (t.cohort_start + (m.mn || ' months')::interval)::date AS mes_alvo_inicio,
            (t.cohort_start + ((m.mn + 1) || ' months')::interval)::date AS mes_alvo_fim
        FROM titulares t
        CROSS JOIN months m
        WHERE t.cohort_start + (m.mn || ' months')::interval <= current_date
    )
    SELECT
        to_char(u.cohort_start, 'YYYY/MM'),
        u.mn::int,
        COUNT(DISTINCT u.titular_id)::bigint,
        -- Titular usou OU algum dependente seu usou no mês alvo
        COUNT(DISTINCT u.titular_id) FILTER (
            WHERE
                EXISTS (
                    SELECT 1 FROM appointments a
                    WHERE a.client_id = u.titular_id
                      AND a.appointment_date >= u.mes_alvo_inicio
                      AND a.appointment_date < u.mes_alvo_fim
                      AND a.status != 'cancelado'
                )
                OR EXISTS (
                    SELECT 1 FROM appointments a
                    JOIN dependents d ON d.id = a.client_id
                    WHERE d.titular_id = u.titular_id
                      AND a.appointment_date >= u.mes_alvo_inicio
                      AND a.appointment_date < u.mes_alvo_fim
                      AND a.status != 'cancelado'
                )
        )::bigint
    FROM uso u
    GROUP BY u.cohort_start, u.mn
    HAVING COUNT(DISTINCT u.titular_id) > 0
    ORDER BY u.cohort_start, u.mn;
END;
$$;

-- ---------------------------------------------------------------------------
-- Função de diagnóstico para verificar se as funções foram criadas
-- CORRIGIDA: 'exists' é palavra reservada, substituído por 'function_exists'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_dashboard_functions()
RETURNS TABLE (function_name text, function_exists boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.function_name,
        EXISTS (
            SELECT 1 
            FROM pg_proc p 
            JOIN pg_namespace n ON p.pronamespace = n.oid 
            WHERE n.nspname = 'public' 
              AND p.proname = f.function_name
        ) as function_exists
    FROM (VALUES 
        ('get_dashboard_overview_cartao'),
        ('get_clinic_overview_new'),
        ('get_card_metrics'),
        ('get_active_clients_history'),
        ('get_overdue_pct_cumulative'),
        ('get_cohort_overdue_by_safra'),
        ('get_plan_segmentation'),
        ('get_sales_dashboard'),
        ('get_card_usage_cohort')
    ) AS f(function_name);
END;
$$;
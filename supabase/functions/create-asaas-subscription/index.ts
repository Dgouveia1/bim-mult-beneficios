// Supabase Edge Function: create-asaas-subscription
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // CORRIGIDO: desestrutura nextDueDate do body
    const { record, titularData, nextDueDate } = await req.json()

    const ASAAS_API_URL = 'https://api.asaas.com/v3';
    const ASAAS_API_KEY = '$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmY2ODUyYWU0LWFjZTktNDFkMy04NjAwLTQzZDQxNjk4NDNiZTo6JGFhY2hfMjY1M2Y1OTYtZmJjMy00ZGVjLTk0MjUtYWIyYWMxZDkxOTVk';

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (!ASAAS_API_KEY) {
      throw new Error('API Key do Asaas não configurada no servidor.')
    }

    // 1. Verificar se cliente já existe no Asaas (pelo CPF)
    const cpfLimpo = titularData.cpf.replace(/\D/g, '');
    let asaasCustomerId = null;

    const searchResponse = await fetch(`${ASAAS_API_URL}/customers?cpfCnpj=${cpfLimpo}`, {
      headers: { 'access_token': ASAAS_API_KEY }
    });
    const searchResult = await searchResponse.json();

    if (searchResult.data && searchResult.data.length > 0) {
      asaasCustomerId = searchResult.data[0].id;
    } else {
      // 2. Se não existe, cria o cliente no Asaas
      // CORRIGIDO: removido nextDueDate do payload do cliente (não é um campo de cliente)
      const createCustomerRes = await fetch(`${ASAAS_API_URL}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': ASAAS_API_KEY
        },
        body: JSON.stringify({
          name: `${titularData.nome} ${titularData.sobrenome}`,
          cpfCnpj: cpfLimpo,
          email: titularData.email || `cliente_${cpfLimpo}@sememail.com`,
          mobilePhone: titularData.telefone ? titularData.telefone.replace(/\D/g, '') : undefined,
          address: titularData.endereco,
          postalCode: titularData.cep,
          externalReference: record.id.toString()
        })
      });
      const newCustomer = await createCustomerRes.json();
      if (newCustomer.errors) throw new Error(`Erro Asaas Cliente: ${newCustomer.errors[0].description}`);
      asaasCustomerId = newCustomer.id;
    }

    // 3. Atualiza o cliente no Supabase com o ID do Asaas
    await supabaseAdmin
      .from('clients')
      .update({ asaas_customer_id: asaasCustomerId })
      .eq('id', record.id);

    // 4. Busca o valor do plano na tabela plans
    const { data: planData, error: planError } = await supabaseAdmin
      .from('plans')
      .select('price')
      .ilike('name', titularData.plano)
      .maybeSingle();

    if (planError || !planData?.price) {
      throw new Error(`Plano "${titularData.plano}" não encontrado ou sem preço configurado.`);
    }

    const valorAssinatura = Number(planData.price);

    // 5. Criar Assinatura
    // Usa nextDueDate vindo do frontend (dia de vencimento escolhido). Fallback para hoje.
    const dueDateToUse = nextDueDate || new Date().toISOString().split('T')[0];

    const subscriptionPayload = {
      customer: asaasCustomerId,
      billingType: 'UNDEFINED',
      value: valorAssinatura,
      nextDueDate: dueDateToUse,
      cycle: 'MONTHLY',
      description: `Assinatura ${titularData.plano}`,
      externalReference: record.id.toString()
    };

    const subResponse = await fetch(`${ASAAS_API_URL}/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': ASAAS_API_KEY
      },
      body: JSON.stringify(subscriptionPayload)
    });

    const subData = await subResponse.json();
    if (subData.errors) throw new Error(`Erro Asaas Assinatura: ${subData.errors[0].description}`);

    // Busca a cobrança gerada para pegar o link direto
    let paymentLink = null;
    const chargesRes = await fetch(`${ASAAS_API_URL}/subscriptions/${subData.id}/payments`, {
      headers: { 'access_token': ASAAS_API_KEY }
    });
    const chargesData = await chargesRes.json();

    if (chargesData.data && chargesData.data.length > 0) {
      paymentLink = chargesData.data[0].invoiceUrl;
    }

    // 5. Salva dados da assinatura no Supabase
    await supabaseAdmin
      .from('asaas_subscriptions')
      .insert({
        client_id: record.id,
        asaas_subscription_id: subData.id,
        status: subData.status,
        value: subData.value,
        payment_link: paymentLink
      });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Integração Asaas realizada com sucesso',
        asaas_id: asaasCustomerId,
        subscription_id: subData.id,
        payment_link: paymentLink
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

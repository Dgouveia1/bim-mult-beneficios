import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { clientId, nextDueDate, diaVencimento } = await req.json();

    if (!clientId || !nextDueDate) {
      return new Response(
        JSON.stringify({ success: false, error: 'clientId e nextDueDate são obrigatórios.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY') || '$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmY2ODUyYWU0LWFjZTktNDFkMy04NjAwLTQzZDQxNjk4NDNiZTo6JGFhY2hfMjY1M2Y1OTYtZmJjMy00ZGVjLTk0MjUtYWIyYWMxZDkxOTVk';
    const asaasBaseUrl = 'https://api.asaas.com/v3';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Busca o asaas_subscription_id do cliente
    const { data: subscription, error: subError } = await supabase
      .from('asaas_subscriptions')
      .select('asaas_subscription_id')
      .eq('client_id', clientId)
      .single();

    if (subError || !subscription?.asaas_subscription_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Assinatura Asaas não encontrada para este cliente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const subscriptionId = subscription.asaas_subscription_id;

    // Chama a API do Asaas para atualizar o nextDueDate da assinatura
    const asaasResponse = await fetch(`${asaasBaseUrl}/subscriptions/${subscriptionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'access_token': asaasApiKey,
      },
      body: JSON.stringify({ nextDueDate }),
    });

    const asaasData = await asaasResponse.json();

    if (!asaasResponse.ok) {
      console.error('Erro Asaas update subscription:', asaasData);
      return new Response(
        JSON.stringify({ success: false, error: asaasData?.errors?.[0]?.description || 'Erro ao atualizar assinatura no Asaas.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    return new Response(
      JSON.stringify({ success: true, nextDueDate, subscriptionId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro inesperado:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

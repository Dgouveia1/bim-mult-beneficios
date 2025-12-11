import { _supabase } from './supabase.js';
import { showToast } from './utils.js';

let whatsappSubscription = null;

// Formata minutos para "Xh Ym"
function formatMinutes(minutes) {
    if (!minutes || minutes === 0) return '-';
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function formatPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    
    // Se tiver 12 ou 13 dígitos (ex: 55179...), remove o 55 inicial
    let finalPhone = cleaned;
    if (cleaned.length > 11 && cleaned.startsWith('55')) {
        finalPhone = cleaned.substring(2);
    }

    // Formata (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
    if (finalPhone.length === 11) {
        return `(${finalPhone.substring(0,2)}) ${finalPhone.substring(2,7)}-${finalPhone.substring(7)}`;
    } else if (finalPhone.length === 10) {
        return `(${finalPhone.substring(0,2)}) ${finalPhone.substring(2,6)}-${finalPhone.substring(6)}`;
    }
    
    return phone; // Retorna original se não casar com padrão
}

// Carrega os dados da View
async function loadWhatsAppControlData() {
    const tableBody = document.getElementById('whatsappControlBody');
    if (!tableBody) return;

    // Se já tem conteúdo, não mostra "carregando" para não piscar a tela, apenas atualiza
    if (tableBody.children.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Carregando conversas...</td></tr>';
    }

    try {
        console.log('[WPP ADMIN] Buscando dados da view...');
        const { data, error } = await _supabase
            .from('view_whatsapp_control')
            .select('*');

        if (error) throw error;

        // --- LÓGICA DE DEDUPLICAÇÃO POR TELEFONE ---
        const uniqueDataMap = new Map();

        data.forEach(row => {
            // Ignora registros sem telefone
            if (!row.telefone) return;

            // Normaliza o telefone para usar como chave (apenas números)
            const cleanPhone = row.telefone.replace(/\D/g, '');

            if (!uniqueDataMap.has(cleanPhone)) {
                // Se é a primeira vez que vemos este telefone, adiciona ao mapa
                uniqueDataMap.set(cleanPhone, { ...row });
            } else {
                // Se já existe, mescla as informações para não duplicar a linha
                const existing = uniqueDataMap.get(cleanPhone);
                
                // 1. LÓGICA DE NOME: Sem concatenação, prioriza Titular
                // Se o registro atual for Titular, usamos o nome dele (sobrescrevendo dependente se houver)
                if (row.tipo_vinculo === 'Titular') {
                    existing.nome = row.nome;
                }
                // Se não for Titular, mantemos o nome que já estava (seja Titular anterior ou primeiro Dependente)

                // 2. Prioriza status de cliente
                if (row.is_client && !existing.is_client) {
                    existing.is_client = true;
                    existing.tipo_vinculo = row.tipo_vinculo;
                } else if (row.is_client && existing.is_client) {
                    // Se ambos são clientes, combina os vínculos se diferentes (Ex: Titular / Dependente)
                    // Mantemos a concatenação aqui apenas para o VÍNCULO, para saber que o numero representa ambos
                    if (row.tipo_vinculo && existing.tipo_vinculo && !existing.tipo_vinculo.includes(row.tipo_vinculo)) {
                        existing.tipo_vinculo += ` / ${row.tipo_vinculo}`;
                    }
                }

                // 3. Mescla informações de consulta (se algum tiver consulta, a linha marca como sim)
                if (row.tem_consulta_marcada) {
                    existing.tem_consulta_marcada = true;
                }

                // 4. Se algum dos duplicados estiver aguardando resposta, a conversa inteira está aguardando
                if (row.aguardando_resposta) {
                    existing.aguardando_resposta = true;
                    // Mantém a data da mensagem mais relevante (a que está esperando)
                    existing.last_msg_time = row.last_msg_time;
                }
            }
        });

        // Converte o mapa de volta para um array para ordenação e renderização
        const uniqueData = Array.from(uniqueDataMap.values());

        // ORDENAÇÃO INTELIGENTE (Prioridade no tempo de espera)
        uniqueData.sort((a, b) => {
            // 1º Critério: Quem está aguardando resposta vem primeiro
            if (a.aguardando_resposta && !b.aguardando_resposta) return -1;
            if (!a.aguardando_resposta && b.aguardando_resposta) return 1;

            // 2º Critério: Se ambos estão aguardando, quem espera HÁ MAIS TEMPO (mensagem mais antiga) vem primeiro
            if (a.aguardando_resposta) {
                return new Date(a.last_msg_time) - new Date(b.last_msg_time);
            }

            // 3º Critério: Se ninguém está aguardando (respondidos), mostra o mais recente primeiro (histórico)
            return new Date(b.last_msg_time) - new Date(a.last_msg_time);
        });

        renderWhatsAppTable(uniqueData);
        
        // Garante que o listener seja configurado apenas uma vez
        setupRealtimeListener();

    } catch (error) {
        console.error('Erro ao carregar controle WhatsApp:', error);
        tableBody.innerHTML = '<tr><td colspan="8" style="color:red; text-align:center;">Erro ao carregar dados. (Verifique se a View SQL foi criada)</td></tr>';
    }
}

// Renderiza a tabela
function renderWhatsAppTable(data) {
    const tableBody = document.getElementById('whatsappControlBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhuma conversa encontrada.</td></tr>';
        return;
    }

    data.forEach(chat => {
        const row = document.createElement('tr');
        
        // Estilização baseada em status
        const waitingClass = chat.aguardando_resposta ? 'status-waiting' : 'status-ok';
        
        // CORREÇÃO DE FUSO HORÁRIO (VISUALIZAÇÃO)
        const dateObj = new Date(chat.last_msg_time);
        const day = String(dateObj.getUTCDate()).padStart(2, '0');
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const hour = String(dateObj.getUTCHours()).padStart(2, '0');
        const minute = String(dateObj.getUTCMinutes()).padStart(2, '0');
        
        const lastMsgDate = `${day}/${month}, ${hour}:${minute}`;

        // CORREÇÃO DE CÁLCULO DE TEMPO DE ESPERA
        let waitingTimeDisplay = '';
        if (chat.aguardando_resposta) {
            const timezoneOffsetMs = new Date().getTimezoneOffset() * 60000;
            const msgTimeCorrected = dateObj.getTime() + timezoneOffsetMs;
            const diffMs = Date.now() - msgTimeCorrected;
            const diffMins = Math.floor(diffMs / 60000);
            const displayMins = diffMins > 0 ? diffMins : 0;
            
            waitingTimeDisplay = `<div style="font-size:0.8em; color:#d97706;">(Esp.: ${formatMinutes(displayMins)})</div>`;
        }

        row.innerHTML = `
            <td>
                <div class="user-info">
                    <span class="user-name">${chat.nome}</span>
                    <span class="user-phone">${formatPhone(chat.telefone)}</span>
                </div>
            </td>
            <td>
                ${chat.is_client 
                    ? `<span class="badge badge-success">Cliente (${chat.tipo_vinculo || 'T'})</span>` 
                    : '<span class="badge badge-gray">Lead</span>'}
            </td>
            <td>
                ${chat.tem_consulta_marcada 
                    ? '<span class="badge badge-info"><i class="fas fa-calendar-check"></i> Sim</span>' 
                    : '<span class="text-muted">Não</span>'}
            </td>
            <td>
                <span class="status-indicator ${waitingClass}">
                    ${chat.aguardando_resposta ? '⏳ Aguardando' : '✅ Respondido'}
                </span>
                ${waitingTimeDisplay}
            </td>
            <td>
                <div class="response-time">
                    <small>Online: ${formatMinutes(chat.tempo_medio_online)}</small>
                    <small>Off: ${formatMinutes(chat.tempo_medio_off)}</small>
                </div>
            </td>
            <td class="last-msg-cell" title="${chat.last_msg_content || ''}">
                <div class="msg-preview">${chat.last_msg_content || ''}</div>
                <small class="msg-time">${lastMsgDate}</small>
            </td>
            <td>
                <a href="https://wa.me/55${chat.telefone.replace(/\D/g, '')}" target="_blank" class="btn btn-small btn-success">
                    <i class="fab fa-whatsapp"></i> Abrir
                </a>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Configura o Realtime
function setupRealtimeListener() {
    if (whatsappSubscription) {
        // Se já existe, não recria
        return; 
    }

    console.log('[WPP ADMIN] Configurando listener Realtime...');

    // Ouve INSERT na tabela RAW (mensagens chegando)
    whatsappSubscription = _supabase
        .channel('public:raw_atendimentos_whatsapp_control')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'raw_atendimentos_whatsapp' }, (payload) => {
            console.log('[WPP CONTROL] Nova mensagem recebida!', payload);
            showToast('Nova mensagem WhatsApp recebida!');
            
            // Adiciona um pequeno delay para garantir que o banco processou o insert antes da view ler
            setTimeout(() => {
                loadWhatsAppControlData();
            }, 1000);
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('[WPP ADMIN] Realtime conectado com sucesso!');
            }
        });
}

function setupWhatsAppAdminPage() {
    loadWhatsAppControlData();
}

export { setupWhatsAppAdminPage };
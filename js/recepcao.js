import { _supabase } from './supabase.js';
import { allPeople } from './clientes.js';
import { logAction } from './logger.js';
import { showToast } from './utils.js';

// Variável para guardar a inscrição e poder removê-la depois
let receptionSubscription = null;
let currentAppointments = [];

// Lista de salas (deve ser consistente com o index.html e agenda.js)
const ROOMS_LIST = [
    'Consultório 1',
    'Consultório 2',
    'Consultório 3 (Dentista)',
    'Consultório 4',
    'Consultório 5'
];

// Função para remover a inscrição anterior e evitar duplicatas
function unsubscribeReception() {
    if (receptionSubscription) {
        _supabase.removeChannel(receptionSubscription);
        receptionSubscription = null;
        console.log('🏥 [RECEPTION] Inscrição de tempo real removida.');
    }
}

// Função principal que agora também ouve as mudanças
async function loadReceptionQueue() {
    console.log('🏥 [RECEPTION] Iniciando carregamento da fila de recepção...');
    const queueContainer = document.getElementById('receptionQueue');
    if (!queueContainer) return;

    // Primeiro, remove qualquer inscrição anterior para evitar múltiplas execuções
    unsubscribeReception();

    // Carrega os dados iniciais
    await renderReceptionQueue();

    // Agora, cria a inscrição para futuras mudanças na tabela 'appointments'
    receptionSubscription = _supabase.channel('public:appointments_recepcao')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => {
            console.log('🏥 [RECEPTION] Mudança detectada nos agendamentos!', payload);

            // Verifica se a mudança é no dia de hoje
            const changedDate = (payload.new?.appointment_date || payload.old?.appointment_date || '').split('T')[0];
            const today = new Date().toISOString().split('T')[0];

            // Se a data alterada for hoje OU se a data não estiver presente (ex: payload de delete pode não ter data completa dependendo da réplica), atualiza.
            // Para garantir: sempre atualiza se for hoje.
            if (changedDate === today) {
                renderReceptionQueue();
            }
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('🏥 [RECEPTION] Conectado ao Realtime.');
            }
        });
}

// Função de utilitário para criar o HTML do card do paciente
function createPatientCard(appt) {
    let statusClass = 'pending'; // Padrão (agendado)
    let statusText = appt.status.replace('_', ' ').toUpperCase();

    if (appt.status === 'chegou') {
        statusClass = 'active'; // Azul (aguardando)
    } else if (appt.status === 'em_atendimento') {
        statusClass = 'info'; // Laranja (em atendimento)
        statusText = "EM ATENDIMENTO";
    } else if (appt.status === 'finalizado') {
        statusClass = 'confirmed'; // Verde (finalizado)
    } else if (appt.status === 'cancelado') {
        statusClass = 'cancelled'; // Vermelho
    }

    const isCheckinDisabled = appt.status !== 'agendado' && appt.status !== 'confirmado';
    const isPaymentDisabled = appt.payment_status === 'pago' || appt.status === 'cancelado';
    const paymentButtonText = appt.payment_status === 'pago' ? 'Pago' : 'Registrar Pagamento';

    // --- LÓGICA MANTIDA: Alerta de Inadimplência apenas visual na recepção ---
    // Verifica se o objeto 'clients' veio populado e se o status é ATRASO
    const isOverdue = appt.clients && appt.clients.status === 'ATRASO';

    // HTML do alerta visual
    const overdueAlertHtml = isOverdue ? `
        <div style="margin-top: 10px; background-color: #ffebee; border: 1px solid #ffcdd2; color: #c62828; padding: 8px; border-radius: 6px; font-size: 0.85rem; display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-exclamation-triangle"></i>
            <span style="font-weight: 600;">PENDÊNCIA FINANCEIRA</span>
        </div>
    ` : '';

    // Adiciona uma borda vermelha extra ao card se estiver em atraso
    const extraStyle = isOverdue ? 'border-left: 5px solid #c62828 !important;' : '';

    // Lógica do botão de Check-in (Fica verde se já foi)
    let checkinBtnClass = 'btn-secondary';
    let checkinIcon = 'fa-check';
    let checkinText = 'Check-in';

    if (appt.status === 'chegou' || appt.status === 'em_atendimento' || appt.status === 'finalizado') {
        checkinBtnClass = 'btn-success';
        checkinIcon = 'fa-check-double';
        checkinText = 'Realizado';
    }

    return `
        <div class="patient-card" data-appointment-id="${appt.id}" style="${extraStyle}">
            <div class="patient-card-header">
                <h4>${appt.patient_name}</h4>
                <span>Agendado para: ${appt.start_time.substring(0, 5)}</span>
            </div>
            <div class="patient-card-body">
                <p><strong>Profissional:</strong> ${appt.professionals.name}</p>
                <p><strong>Status:</strong> <span class="status status-${statusClass}">${statusText}</span></p>
                ${appt.procedure ? `<p><strong>Observações:</strong> ${appt.procedure}</p>` : ''}
                ${overdueAlertHtml}
            </div>
            <div class="patient-card-actions">
                <button class="btn ${checkinBtnClass} checkin-btn" data-id="${appt.id}" ${isCheckinDisabled ? 'disabled' : ''} style="width: 100%;">
                    <i class="fas ${checkinIcon}"></i> ${checkinText}
                </button>
            </div>
        </div>
    `;
}

// Função separada para a lógica de renderização
async function renderReceptionQueue() {
    const queueContainer = document.getElementById('receptionQueue');
    if (!queueContainer) return;

    // Mantém a estrutura de colunas se já existir, para evitar piscar tela inteira, ou recria
    // Se o container estiver vazio, recria a estrutura base
    if (queueContainer.children.length === 0) {
        let columnsHtml = '';
        ROOMS_LIST.forEach(room => {
            const roomId = room.replace(/[\s()]+/g, '-');
            columnsHtml += `
                <div class="reception-column" data-room-name="${room}">
                    <div class="reception-column-header">
                        <h3>${room}</h3>
                        <span class="room-status livre" id="status-${roomId}">Livre</span>
                    </div>
                    <div class="reception-column-body" id="column-${roomId}">
                        <p id="empty-msg-${roomId}" style="display: none; text-align: center; color: var(--gray-medium);">Sala vazia.</p>
                    </div>
                </div>
            `;
        });
        queueContainer.innerHTML = columnsHtml;
    }

    // Limpa apenas o CORPO das colunas para re-renderizar os cards
    ROOMS_LIST.forEach(room => {
        const roomId = room.replace(/[\s()]+/g, '-');
        const columnBody = document.getElementById(`column-${roomId}`);
        if (columnBody) columnBody.innerHTML = `<p id="empty-msg-${roomId}" style="display: none; text-align: center; color: var(--gray-medium);">Sala vazia.</p>`;
    });

    const today = new Date().toISOString().split('T')[0];

    try {
        // --- ATUALIZAÇÃO IMPORTANTE: Join com 'clients' para pegar o status financeiro ---
        const { data: appointments, error } = await _supabase
            .from('appointments')
            .select(`*, professionals ( name ), clients ( status )`)
            .eq('appointment_date', today)
            .not('status', 'eq', 'finalizado')
            .not('status', 'eq', 'cancelado')
            .order('start_time');

        if (error) throw error;

        currentAppointments = appointments;

        // Distribui os pacientes nas colunas
        appointments.forEach(appt => {
            const cardHtml = createPatientCard(appt);

            if (appt.room) {
                const roomId = appt.room.replace(/[\s()]+/g, '-');
                const roomColumn = document.getElementById(`column-${roomId}`);
                if (roomColumn) {
                    roomColumn.insertAdjacentHTML('beforeend', cardHtml);
                }
            }
        });

        // Atualiza o status visual de cada sala (Livre/Ocupada)
        const allColumns = document.querySelectorAll('.reception-column');
        allColumns.forEach(column => {
            const roomName = column.dataset.roomName;
            const roomId = roomName.replace(/[\s()]+/g, '-');
            const columnBody = document.getElementById(`column-${roomId}`);
            const statusIndicator = document.getElementById(`status-${roomId}`);

            if (!columnBody) return;

            const isOccupied = columnBody.querySelector('.status-info') !== null; // Em atendimento
            const isWaiting = columnBody.querySelector('.status-active') !== null; // Chegou

            if (statusIndicator) {
                if (isOccupied) {
                    statusIndicator.textContent = 'Em Atendimento';
                    statusIndicator.className = 'room-status ocupada';
                } else if (isWaiting) {
                    statusIndicator.textContent = 'Aguardando';
                    statusIndicator.className = 'room-status ocupada';
                } else {
                    statusIndicator.textContent = 'Livre';
                    statusIndicator.className = 'room-status livre';
                }
            }

            // Controle da mensagem "Sala vazia"
            const emptyMsg = document.getElementById(`empty-msg-${roomId}`);
            if (emptyMsg) {
                // Conta apenas os cards reais (ignorando a mensagem vazia)
                const cardCount = columnBody.querySelectorAll('.patient-card').length;
                emptyMsg.style.display = cardCount === 0 ? 'block' : 'none';
            }
        });

    } catch (error) {
        console.error('❌ [RECEPTION] ERRO AO ATUALIZAR FILA:', error);
        showToast('Erro ao atualizar a fila: ' + error.message, 'error');
    }
}

// Marca a chegada do paciente (check-in) e gera transação pendente no caixa
async function markArrival(appointmentId) {
    const appt = currentAppointments.find(a => a.id == appointmentId);
    if (!appt) {
        console.error('Atendimento não encontrado na fila para o ID:', appointmentId);
        return;
    }

    try {
        // 1. Fazer o check-in na agenda
        const updateData = {
            status: 'chegou',
            checkin_time: new Date().toISOString()
        };

        const { data: appointment, error } = await _supabase
            .from('appointments')
            .update(updateData)
            .eq('id', appointmentId)
            .select()
            .single();

        if (error) throw error;

        // 2. Criar a transação financeira PENDENTE para o Caixa
        const transacaoData = {
            paciente_id: appt.client_id,
            paciente_nome: appt.patient_name,
            atendimento_id: appointmentId,
            tipo_cobranca: 'CONSULTA',
            valor_original: 0, // Será editado/preenchido no Caixa
            desconto_aplicado: 0,
            valor_final: 0, // Será editado/preenchido no Caixa
            status_pagamento: 'PENDENTE',
            created_by: (await _supabase.auth.getUser()).data.user.id
        };

        const { error: txError } = await _supabase.from('transacoes_financeiras').insert(transacaoData);
        if (txError) throw txError;

        await logAction('CHECK_IN', {
            appointmentId: appointmentId,
            checkinTime: updateData.checkin_time
        });

        showToast(`Check-in de ${appointment.patient_name} realizado! Fatura gerada no Caixa.`);
        renderReceptionQueue(); // Atualiza a fila
    } catch (err) {
        console.error('Erro no check-in:', err);
        showToast('Erro ao realizar o check-in.', 'error');
    }
}

// Abre o modal de pagamento
function openPaymentModal(appointmentId, patientName) {
    const modal = document.getElementById('paymentModal');
    if (!modal) return;

    const patientData = allPeople.find(p => p.nome === patientName);

    document.getElementById('paymentAppointmentId').value = appointmentId;
    document.getElementById('paymentPatientName').textContent = patientName;
    document.getElementById('paymentPatientCPF').textContent = patientData?.cpf || 'N/A';
    document.getElementById('paymentPatientPlan').textContent = patientData?.plano || 'N/A';

    modal.style.display = 'flex';
}

// Salva o pagamento
async function savePayment(event) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');

    const paymentData = {
        appointment_id: document.getElementById('paymentAppointmentId').value,
        amount: document.getElementById('paymentAmount').value,
        method: document.getElementById('paymentMethod').value,
    };

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        const { error: paymentError } = await _supabase.from('payments').insert(paymentData);
        if (paymentError) throw paymentError;

        const { error: appointmentError } = await _supabase
            .from('appointments')
            .update({ payment_status: 'pago' })
            .eq('id', paymentData.appointment_id);
        if (appointmentError) throw appointmentError;

        await logAction('REGISTER_PAYMENT', {
            appointmentId: paymentData.appointment_id,
            amount: paymentData.amount,
            method: paymentData.method
        });

        showToast('Pagamento registrado com sucesso!');
        document.getElementById('paymentModal').style.display = 'none';
        form.reset();

    } catch (error) {
        showToast('Erro ao salvar pagamento: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Salvar Pagamento';
    }
}

export { loadReceptionQueue, markArrival, openPaymentModal, savePayment, unsubscribeReception };
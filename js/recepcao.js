import { _supabase } from './supabase.js';
import { allPeople } from './clientes.js'; // Importamos a lista de pessoas para pegar os detalhes
import { logAction } from './logger.js'; // Importando logAction
import { showToast } from './utils.js';

// Variável para guardar a inscrição e poder removê-la depois
let receptionSubscription = null;

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
    receptionSubscription = _supabase.channel('public:appointments')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => {
            console.log('🏥 [RECEPTION] Mudança detectada nos agendamentos!', payload);
            
            // Verifica se a mudança é no dia de hoje
            const changedDate = (payload.new?.appointment_date || payload.old?.appointment_date || '').split('T')[0];
            const today = new Date().toISOString().split('T')[0];
            
            if (changedDate === today) {
                // Ao detectar qualquer mudança no dia de HOJE, renderiza a fila novamente
                renderReceptionQueue();
            }
        })
        .subscribe();
    
    console.log('🏥 [RECEPTION] Inscrição de tempo real ativada.');
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

    return `
        <div class="patient-card" data-appointment-id="${appt.id}">
            <div class="patient-card-header">
                <h4>${appt.patient_name}</h4>
                <span>Agendado para: ${appt.start_time.substring(0, 5)}</span>
            </div>
            <div class="patient-card-body">
                <p><strong>Profissional:</strong> ${appt.professionals.name}</p>
                <p><strong>Status:</strong> <span class="status status-${statusClass}">${statusText}</span></p>
                ${appt.procedure ? `<p><strong>Observações:</strong> ${appt.procedure}</p>` : ''}
            </div>
            <div class="patient-card-actions">
                <button class="btn btn-secondary checkin-btn" data-id="${appt.id}" ${isCheckinDisabled ? 'disabled' : ''}>
                    <i class="fas fa-check"></i> Check-in
                </button>
                <button class="btn btn-success payment-btn" data-id="${appt.id}" data-name="${appt.patient_name}" ${isPaymentDisabled ? 'disabled' : ''}>
                    ${paymentButtonText}
                </button>
            </div>
        </div>
    `;
}

// Função separada para a lógica de renderização
async function renderReceptionQueue() {
    const queueContainer = document.getElementById('receptionQueue');
    if (!queueContainer) return;

    queueContainer.innerHTML = ''; // Limpa o container
    
    // 1. Cria a estrutura de colunas
    let columnsHtml = '';
    // REMOVIDA a coluna "Aguardando Chegada"

    // Adiciona as colunas das salas
    ROOMS_LIST.forEach(room => {
        const roomId = room.replace(/[\s()]+/g, '-'); // Cria um ID único
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


    // 2. Busca os agendamentos do dia
    const today = new Date().toISOString().split('T')[0];
    try {
        console.log("🏥 [RECEPTION] Buscando dados do Supabase...");
        const { data: appointments, error } = await _supabase
            .from('appointments')
            .select(`*, professionals ( name )`)
            .eq('appointment_date', today)
            .not('status', 'eq', 'finalizado') // Ignora pacientes finalizados
            .not('status', 'eq', 'cancelado') // Ignora pacientes cancelados
            .order('start_time');

        if (error) throw error; 

        console.log("🏥 [RECEPTION] Dados recebidos. Distribuindo pacientes...");
        
        if (appointments.length === 0) {
            console.log("🏥 [RECEPTION] Nenhum paciente agendado para hoje.");
        }

        // 3. Distribui os pacientes nas colunas
        appointments.forEach(appt => {
            const cardHtml = createPatientCard(appt);
            
            // --- LÓGICA MODIFICADA ---
            // Se o agendamento tem uma sala definida, coloca na coluna da sala.
            // Isso agora inclui 'agendado', 'confirmado', 'chegou' e 'em_atendimento'
            if (appt.room) {
                const roomId = appt.room.replace(/[\s()]+/g, '-');
                const roomColumn = document.getElementById(`column-${roomId}`);
                if (roomColumn) {
                    roomColumn.innerHTML += cardHtml;
                } else {
                     console.warn(`Sala "${appt.room}" do agendamento ${appt.id} não encontrada no layout.`);
                }
            } else {
                // Pacientes sem sala definida não serão exibidos nas colunas de sala
                 console.warn(`Agendamento ${appt.id} (${appt.patient_name}) está sem sala definida.`);
            }
        });

        // 4. Atualiza o status de cada sala
        const allColumns = document.querySelectorAll('.reception-column');
        allColumns.forEach(column => {
            const roomName = column.dataset.roomName;
            const roomId = roomName.replace(/[\s()]+/g, '-');
            const columnBody = document.getElementById(`column-${roomId}`);
            const statusIndicator = document.getElementById(`status-${roomId}`);
            
            // Procura por pacientes "Em Atendimento" (status-info)
            const isOccupied = columnBody.querySelector('.status-info') !== null;
            
            if (statusIndicator) {
                 if (isOccupied) {
                    statusIndicator.textContent = 'Em Atendimento';
                    statusIndicator.className = 'room-status ocupada';
                } else {
                    // Se não estiver ocupada, verificamos se há alguém esperando NAQUELA SALA
                    const isWaiting = columnBody.querySelector('.status-active') !== null; // status-active = 'chegou'
                    if (isWaiting) {
                         statusIndicator.textContent = 'Aguardando';
                         statusIndicator.className = 'room-status ocupada'; // Usar a cor laranja
                    } else {
                        statusIndicator.textContent = 'Livre';
                        statusIndicator.className = 'room-status livre';
                    }
                }
            }
            
            // Mostra mensagem de "vazio" se a coluna não tiver cards
            const emptyMsg = document.getElementById(`empty-msg-${roomId}`);
            if (emptyMsg) {
                 const cardCount = columnBody.querySelectorAll('.patient-card').length;
                 // REMOVIDA A LÓGICA DE CONTAGEM DO "Aguardando"
                 emptyMsg.style.display = cardCount === 0 ? 'block' : 'none';
            }
        });


    } catch (error) {
        console.error('❌ [RECEPTION] ERRO CRÍTICO AO BUSCAR DADOS:', error); 
        queueContainer.innerHTML = `<p style="color:red;">Erro ao carregar a fila de agendamentos: ${error.message}</p>`;
    }
}


// Marca a chegada do paciente (check-in)
async function markArrival(appointmentId) {
    const checkinButton = document.querySelector(`.checkin-btn[data-id="${appointmentId}"]`);
    if(checkinButton) {
        checkinButton.disabled = true;
        checkinButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        // CORREÇÃO 1: Adicionado 'checkin_time' ao fazer o check-in
        const updateData = { 
            status: 'chegou', 
            checkin_time: new Date().toISOString() 
        };

        const { data: appointment, error } = await _supabase
            .from('appointments')
            .update(updateData)
            .eq('id', appointmentId)
            .select() // Pede ao Supabase para retornar o registro atualizado
            .single(); 
            
        if (error) throw error;
        
        // Log da ação
        await logAction('CHECK_IN', { 
            appointmentId: appointmentId, 
            checkinTime: updateData.checkin_time 
        });

        // A inscrição em tempo real (loadReceptionQueue) cuidará de mover o card.
        // Não precisamos fazer nada manualmente aqui.
        
        // Apenas mostramos um toast de sucesso
        showToast(`Check-in de ${appointment.patient_name} realizado!`);


    } catch (error) {
        showToast('Não foi possível realizar o check-in.');
        console.error("Erro no check-in:", error); // Adiciona log de erro
        if(checkinButton) {
            checkinButton.disabled = false;
            checkinButton.innerHTML = '<i class="fas fa-check"></i> Check-in';
        }
    }
}

// Abre o modal de pagamento e preenche com os dados do paciente
function openPaymentModal(appointmentId, patientName) {
    const modal = document.getElementById('paymentModal');
    if (!modal) return;
    
    // Encontra os dados completos do paciente na lista global
    const patientData = allPeople.find(p => p.nome === patientName);

    // Preenche os campos do modal
    document.getElementById('paymentAppointmentId').value = appointmentId;
    document.getElementById('paymentPatientName').textContent = patientName;
    document.getElementById('paymentPatientCPF').textContent = patientData?.cpf || 'N/A';
    document.getElementById('paymentPatientPlan').textContent = patientData?.plano || 'N/A';
    
    modal.style.display = 'flex';
}

// Salva o pagamento no Supabase
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
        // 1. Insere o registro na tabela 'payments'
        const { error: paymentError } = await _supabase.from('payments').insert(paymentData);
        if (paymentError) throw paymentError;

        // 2. Atualiza o status do agendamento para 'pago'
        const { error: appointmentError } = await _supabase
            .from('appointments')
            .update({ payment_status: 'pago' })
            .eq('id', paymentData.appointment_id);
        if (appointmentError) throw appointmentError;
        
        // Log da ação
        await logAction('REGISTER_PAYMENT', { 
            appointmentId: paymentData.appointment_id, 
            amount: paymentData.amount,
            method: paymentData.method
        });

        showToast('Pagamento registrado com sucesso!');
        document.getElementById('paymentModal').style.display = 'none';
        form.reset();
        // A inscrição em tempo real (loadReceptionQueue) cuidará de atualizar o botão.

    } catch (error) {
        showToast('Erro ao salvar pagamento: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Salvar Pagamento';
    }
}

export { loadReceptionQueue, markArrival, openPaymentModal, savePayment, unsubscribeReception };
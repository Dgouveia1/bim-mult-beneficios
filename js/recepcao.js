import { _supabase } from './supabase.js';
import { allPeople } from './clientes.js'; // Importamos a lista de pessoas para pegar os detalhes
import { logAction } from './logger.js'; // Importando logAction

// Variável para guardar a inscrição e poder removê-la depois
let receptionSubscription = null;

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
            // Ao detectar qualquer mudança, simplesmente renderiza a fila novamente
            renderReceptionQueue();
        })
        .subscribe();
    
    console.log('🏥 [RECEPTION] Inscrição de tempo real ativada.');
}

// Criamos uma função separada para a lógica de renderização
async function renderReceptionQueue() {
    const queueContainer = document.getElementById('receptionQueue');
    if (!queueContainer) return;

    queueContainer.innerHTML = '<p>Carregando agendamentos do dia...</p>';
    const today = new Date().toISOString().split('T')[0];

    try {
        console.log("🏥 [RECEPTION] Buscando dados do Supabase..."); // LOG DE DEBUG
        const { data: appointments, error } = await _supabase
            .from('appointments')
            .select(`*, professionals ( name )`)
            .eq('appointment_date', today)
            .order('start_time');

        // Se houver um erro na busca, ele será capturado pelo 'catch' abaixo
        if (error) throw error; 

        console.log("🏥 [RECEPTION] Dados recebidos com sucesso. Renderizando..."); // LOG DE DEBUG
        queueContainer.innerHTML = '';
        if (appointments.length === 0) {
            queueContainer.innerHTML = '<p>Nenhum paciente agendado para hoje.</p>';
            return;
        }

        appointments.forEach(appt => {
            const card = document.createElement('div');
            card.className = 'patient-card';
            card.dataset.appointmentId = appt.id;

            let statusClass = 'pending';
            if (appt.status === 'chegou') statusClass = 'active';
            if (appt.status === 'em_atendimento') statusClass = 'info';
            if (appt.status === 'finalizado') statusClass = 'confirmed';

            card.innerHTML = `
                <div class="patient-card-header">
                    <h4>${appt.patient_name}</h4>
                    <span>Agendado para: ${appt.start_time.substring(0, 5)}</span>
                </div>
                <div class="patient-card-body">
                    <p><strong>Profissional:</strong> ${appt.professionals.name}</p>
                    <p><strong>Status:</strong> <span class="status status-${statusClass}">${appt.status.replace('_', ' ').toUpperCase()}</span></p>
                    ${appt.procedure ? `<p><strong>Observações:</strong> ${appt.procedure}</p>` : ''}
                </div>
                <div class="patient-card-actions">
                    <button class="btn btn-secondary checkin-btn" data-id="${appt.id}" ${appt.status !== 'agendado' ? 'disabled' : ''}>
                        <i class="fas fa-check"></i> Check-in
                    </button>
                    <button class="btn btn-success payment-btn" data-id="${appt.id}" data-name="${appt.patient_name}" ${appt.payment_status === 'pago' ? 'disabled' : ''}>
                        ${appt.payment_status === 'pago' ? 'Pago' : 'Registrar Pagamento'}
                    </button>
                </div>
            `;
            queueContainer.appendChild(card);
        });

    } catch (error) {
        console.error('❌ [RECEPTION] ERRO CRÍTICO AO BUSCAR DADOS:', error); 
        queueContainer.innerHTML = `<p style="color:red;">Erro ao carregar a fila de agendamentos. Verifique o console (F12).</p>`;
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

        const { error } = await _supabase.from('appointments').update(updateData).eq('id', appointmentId);
        if (error) throw error;
        
        // Log da ação
        await logAction('CHECK_IN', { 
            appointmentId: appointmentId, 
            checkinTime: updateData.checkin_time 
        });

        // Atualiza visualmente o botão imediatamente enquanto espera o realtime
        if(checkinButton) {
            checkinButton.innerHTML = '<i class="fas fa-check"></i> Chegou';
            checkinButton.classList.remove('btn-secondary');
            checkinButton.classList.add('btn-success');
        }   
        // Não precisamos mais chamar loadReceptionQueue() aqui, a inscrição em tempo real fará isso.

    } catch (error) {
        alert('Não foi possível realizar o check-in.');
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

        alert('Pagamento registrado com sucesso!');
        document.getElementById('paymentModal').style.display = 'none';
        form.reset();
        // Não precisa recarregar a fila aqui, o realtime fará isso.

    } catch (error) {
        alert('Erro ao salvar pagamento: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Salvar Pagamento';
    }
}

export { loadReceptionQueue, markArrival, openPaymentModal, savePayment, unsubscribeReception };

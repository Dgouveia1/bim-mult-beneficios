import { _supabase } from './supabase.js';
import { allPeople } from './clientes.js'; // Importamos a lista de pessoas para pegar os detalhes

// Carrega a fila de pacientes agendados para o dia de hoje
async function loadReceptionQueue() {
    console.log('🏥 [RECEPTION] Iniciando carregamento da fila de recepção...');
    const queueContainer = document.getElementById('receptionQueue');
    if (!queueContainer) return;
    
    queueContainer.innerHTML = '<p>Carregando agendamentos do dia...</p>';
    const today = new Date().toISOString().split('T')[0];

    try {
        const { data: appointments, error } = await _supabase
            .from('appointments')
            .select(`*, professionals ( name )`)
            .eq('appointment_date', today)
            .order('start_time');

        if (error) throw error;

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
        console.error('❌ [RECEPTION] Erro ao carregar fila:', error);
        queueContainer.innerHTML = `<p style="color:red;">Erro ao carregar a fila de agendamentos.</p>`;
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
        const { error } = await _supabase.from('appointments').update({ status: 'chegou' }).eq('id', appointmentId);
        if (error) throw error;
        await loadReceptionQueue();

    } catch (error) {
        alert('Não foi possível realizar o check-in.');
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
        
        alert('Pagamento registrado com sucesso!');
        document.getElementById('paymentModal').style.display = 'none';
        form.reset();
        await loadReceptionQueue(); // Recarrega a fila para atualizar o botão

    } catch (error) {
        alert('Erro ao salvar pagamento: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Salvar Pagamento';
    }
}

export { loadReceptionQueue, markArrival, openPaymentModal, savePayment };
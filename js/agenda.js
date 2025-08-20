// =================================================================
// FUNÇÕES DE AGENDA
// =================================================================
import { _supabase } from './supabase.js';
import { allPeople, openModal } from './clientes.js';

let currentScheduleDate = new Date(); // Inicia com a data de hoje

// Paleta de cores para os profissionais. Adicione mais cores se necessário.
const professionalColors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22'];

// --- FUNÇÕES DE NAVEGAÇÃO DE DATA ---
function changeDay(offset) {
    currentScheduleDate.setDate(currentScheduleDate.getDate() + offset);
    loadScheduleView(); // Recarrega toda a visualização para o novo dia
}

function updateDateDisplay() {
    const display = document.getElementById('currentDateDisplay');
    if (display) {
        // Formata a data para "dd de [Mês] de yyyy"
        display.textContent = currentScheduleDate.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    }
}

// --- BUSCA DE PACIENTES (AUTOCOMPLETE) ---
function setupPatientSearch() {
    const searchInput = document.getElementById('appointmentPatientSearch');
    const resultsContainer = document.getElementById('patientSearchResults');
    const patientNameInput = document.getElementById('appointmentPatientName');
    const patientCPFInput = document.getElementById('appointmentPatientCPF');
    const newClientModal = document.getElementById('newClientModal');

    if (!searchInput || !resultsContainer || !patientNameInput || !patientCPFInput) return;

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        resultsContainer.innerHTML = '';
        patientNameInput.value = '';
        patientCPFInput.value = '';

        if (query.length < 2) {
            resultsContainer.style.display = 'none';
            return;
        }

        const filtered = allPeople.filter(p =>
            p.nome.toLowerCase().includes(query) ||
            (p.cpf && p.cpf.replace(/\D/g, '').includes(query))
        );

        filtered.forEach(person => {
            const div = document.createElement('div');
            div.textContent = `${person.nome} (${person.cpf || 'CPF não cadastrado'})`;
            div.dataset.name = person.nome;
            div.dataset.cpf = person.cpf || '';
            resultsContainer.appendChild(div);
        });

        const addNewDiv = document.createElement('div');
        addNewDiv.textContent = '➕ Adicionar Novo Cliente';
        addNewDiv.className = 'add-new-patient';
        resultsContainer.appendChild(addNewDiv);

        resultsContainer.style.display = 'block';
    });

    resultsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('add-new-patient')) {
            closeAppointmentModal();
            openModal(newClientModal);
        } else if (e.target.dataset.name) {
            searchInput.value = e.target.dataset.name;
            patientNameInput.value = e.target.dataset.name;
            patientCPFInput.value = e.target.dataset.cpf;
            resultsContainer.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-container')) {
            resultsContainer.style.display = 'none';
        }
    });
}

// --- CARREGAMENTO DA AGENDA E AGENDAMENTOS ---

// Função principal que agora desenha a agenda por CONSULTÓRIO
async function loadScheduleView() {
    const container = document.getElementById('scheduleContainer');
    const legendContainer = document.getElementById('professionalLegend');
    if (!container || !legendContainer) return;

    container.innerHTML = 'Carregando agenda...';
    legendContainer.innerHTML = '';

    const rooms = ['Consultório 1', 'Consultório 2', 'Consultório 3 (Dentista)'];

    try {
        const { data: professionals, error } = await _supabase.from('professionals').select('*').order('name');
        if (error) throw error;

        professionals.forEach((prof, index) => {
            const color = professionalColors[index % professionalColors.length];
            prof.color = color;
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            legendItem.innerHTML = `<div class="legend-color-box" style="background-color: ${color};"></div> ${prof.name}`;
            legendContainer.appendChild(legendItem);
        });
        
        let html = '<div class="time-column"><div class="schedule-header">Hora</div>';
        for(let h = 7; h < 19; h++) {
            html += `<div class="time-slot">${String(h).padStart(2, '0')}:00</div>`;
            html += `<div class="time-slot">${String(h).padStart(2, '0')}:30</div>`;
        }
        html += '</div>';

        html += '<div class="professionals-grid">';
        rooms.forEach(room => {
            html += `<div class="professional-column" data-room-name="${room}">`;
            html += `<div class="schedule-header">${room}</div>`;
            for(let h = 7; h < 19; h++) {
                html += `<div class="time-slot" data-time="${h}:00"></div>`;
                html += `<div class="time-slot" data-time="${h}:30"></div>`;
            }
            html += '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
        
        loadAppointments(professionals);
        updateDateDisplay();

    } catch (error) {
        container.innerHTML = `<div style="color:red;">Erro ao carregar a agenda: ${error.message}</div>`;
    }
}

// Carrega e posiciona os agendamentos, agora com as cores
async function loadAppointments(professionals) {
    const selectedDate = currentScheduleDate.toISOString().split('T')[0];
    const tableBody = document.getElementById('proximosAgendamentosBody');

    try {
        const { data: appointments, error } = await _supabase
            .from('appointments')
            .select('*, professionals(name)')
            .eq('appointment_date', selectedDate)
            .order('start_time');

        if (error) throw error;

        document.querySelectorAll('.appointment-card').forEach(card => card.remove());
        if (tableBody) tableBody.innerHTML = '';

        if (appointments.length === 0) {
            if (tableBody) tableBody.innerHTML = '<tr><td colspan="4">Nenhum agendamento para este dia.</td></tr>';
            return;
        }

        appointments.forEach(appointment => {
            const professional = professionals.find(p => p.id === appointment.professional_id);
            const profColor = professional ? professional.color : '#7f8c8d';

            const roomColumn = document.querySelector(`.professional-column[data-room-name="${appointment.room}"]`);
            if(roomColumn) {
                const [startHour, startMinute] = appointment.start_time.split(':').map(Number);
                const top = ((startHour - 7) * 120) + (startMinute / 30 * 60) + 50;
                const height = 58;

                const card = document.createElement('div');
                card.className = 'appointment-card';
                card.style.top = `${top}px`;
                card.style.height = `${height}px`;
                card.dataset.appointmentId = appointment.id;

                card.innerHTML = `
                    <div class="professional-flag" style="background-color: ${profColor};"></div>
                    <strong>${appointment.patient_name}</strong>
                    <small>${appointment.professionals.name}</small>
                `;
                roomColumn.appendChild(card);
            }
            
            if (tableBody) {
                 const row = document.createElement('tr');
                let statusClass = 'pending';
                if (appointment.status === 'chegou') statusClass = 'active';

                row.innerHTML = `
                    <td>${appointment.patient_name}</td>
                    <td>${appointment.start_time.substring(0, 5)}</td>
                    <td>${appointment.professionals.name || 'N/A'}</td>
                    <td><span class="status status-${statusClass}">${appointment.status.replace('_', ' ').toUpperCase()}</span></td>
                `;
                tableBody.appendChild(row);
            }
        });
        
    } catch(error) {
        console.error('Erro ao carregar agendamentos:', error);
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="4" style="color:red;">Erro ao carregar.</td></tr>';
    }
}


// --- FUNÇÕES DE MODAIS (NOVO, DETALHES, SALVAR, ATUALIZAR, EXCLUIR) ---

async function openNewAppointmentModal() {
    const modal = document.getElementById('appointmentModal');
    if (!modal) return;

    // --- CORREÇÃO ADICIONADA AQUI ---
    // Busca e preenche a lista de profissionais sempre que o modal é aberto
    const professionalSelect = document.getElementById('appointmentProfessional');
    if (professionalSelect) {
        professionalSelect.innerHTML = '<option>Carregando...</option>';
        try {
            const { data: professionals, error } = await _supabase.from('professionals').select('*').order('name');
            if (error) throw error;
            
            professionalSelect.innerHTML = '<option value="">Selecione um profissional</option>';
            professionals.forEach(prof => {
                const option = document.createElement('option');
                option.value = prof.id;
                option.textContent = prof.name;
                professionalSelect.appendChild(option);
            });
        } catch (error) {
            professionalSelect.innerHTML = '<option value="">Erro ao carregar</option>';
        }
    }
    document.getElementById('appointmentDate').valueAsDate = new Date();
    setupPatientSearch();
    modal.style.display = 'flex';
}

function closeAppointmentModal() {
    const modal = document.getElementById('appointmentModal');
    if (!modal) return;
    document.getElementById('appointmentForm').reset();
    document.getElementById('patientSearchResults').style.display = 'none';
    modal.style.display = 'none';
}

async function openAppointmentDetails(appointmentId) {
    const modal = document.getElementById('appointmentDetailsModal');
    if (!modal) return;

    try {
        const { data: appointment, error } = await _supabase.from('appointments').select('*, professionals(name)').eq('id', appointmentId).single();
        if (error) throw error;
        
        const patientData = allPeople.find(p => p.nome === appointment.patient_name);

        document.getElementById('detailsPatientName').textContent = appointment.patient_name;
        document.getElementById('detailsPatientCPF').textContent = patientData?.cpf || 'N/A';
        document.getElementById('detailsPatientPhone').textContent = patientData?.telefone || 'N/A';
        document.getElementById('detailsPatientPlan').textContent = patientData?.plano || 'N/A';
        document.getElementById('detailsPatientStatus').textContent = patientData?.status || 'N/A';

        document.getElementById('detailsAppointmentId').value = appointment.id;
        document.getElementById('detailsAppointmentDate').value = appointment.appointment_date;
        document.getElementById('detailsAppointmentTime').value = appointment.start_time.substring(0, 5);
        document.getElementById('detailsAppointmentRoom').value = appointment.room;

        const profSelect = document.getElementById('detailsAppointmentProfessional');
        const allProfessionals = await _supabase.from('professionals').select('*');
        profSelect.innerHTML = '';
        allProfessionals.data.forEach(prof => {
            const option = document.createElement('option');
            option.value = prof.id;
            option.textContent = prof.name;
            if (prof.id === appointment.professional_id) {
                option.selected = true;
            }
            profSelect.appendChild(option);
        });

        modal.style.display = 'flex';

    } catch (error) {
        alert('Erro ao carregar detalhes do agendamento: ' + error.message);
    }
}

function closeAppointmentDetailsModal() {
    const modal = document.getElementById('appointmentDetailsModal');
    if (modal) modal.style.display = 'none';
}

async function saveAppointment(event) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');

    const appointmentData = {
        patient_name: form.patient.value,
        procedure: form.procedure.value,
        appointment_date: form.date.value,
        start_time: form.time.value,
        professional_id: form.professionalId.value,
        room: form.room.value,
    };

    if (!appointmentData.patient_name) {
        alert('Por favor, selecione um paciente da lista ou cadastre um novo.');
        return;
    }

    // Calcula o end_time (assumindo 30 minutos de duração)
    const [hour, minute] = appointmentData.start_time.split(':').map(Number);
    const endTimeObject = new Date();
    endTimeObject.setHours(hour, minute + 30, 0, 0);
    appointmentData.end_time = endTimeObject.toTimeString().split(' ')[0];

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

    try {
        // =================================================================
        //  LÓGICA DE VERIFICAÇÃO MODIFICADA - INÍCIO
        // =================================================================

        // A consulta agora verifica se existe algum agendamento que se sobrepõe
        // ao novo intervalo de tempo.
        // Condição de sobreposição: O início do novo é antes do fim do existente
        // E o fim do novo é depois do início do existente.
        const { data: conflictingAppointments, error: checkError } = await _supabase
            .from('appointments')
            .select('id, patient_name, start_time, end_time')
            .eq('appointment_date', appointmentData.appointment_date)
            .eq('room', appointmentData.room)
            .lt('start_time', appointmentData.end_time) // O início do agendamento existente é MENOR que o FIM do novo
            .gt('end_time', appointmentData.start_time);  // O fim do agendamento existente é MAIOR que o INÍCIO do novo

        if (checkError) throw checkError;

        // Se a consulta retornar qualquer resultado, significa que há um conflito.
        if (conflictingAppointments && conflictingAppointments.length > 0) {
            const conflict = conflictingAppointments[0];
            const errorMessage = `Conflito de agendamento! O ${appointmentData.room} já está reservado para "${conflict.patient_name}" das ${conflict.start_time.substring(0, 5)} às ${conflict.end_time.substring(0, 5)}.`;
            throw new Error(errorMessage);
        }

        // =================================================================
        //  LÓGICA DE VERIFICAÇÃO MODIFICADA - FIM
        // =================================================================

        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        const { error: insertError } = await _supabase.from('appointments').insert(appointmentData);
        if (insertError) throw insertError;

        alert('Agendamento salvo com sucesso!');
        closeAppointmentModal();
        loadScheduleView();

    } catch (error) {
        // O alerta agora mostrará a mensagem de erro específica e amigável
        alert(error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Agendar';
    }
}

async function updateAppointment(event) {
    event.preventDefault();
    const form = event.target;
    const appointmentId = document.getElementById('detailsAppointmentId').value;
    const submitButton = form.querySelector('button[type="submit"]');

    const updatedData = {
        appointment_date: form.date.value,
        start_time: form.time.value,
        professional_id: form.professionalId.value,
        room: form.room.value,
    };
    
    const [hour, minute] = updatedData.start_time.split(':').map(Number);
    const endTime = new Date();
    endTime.setHours(hour, minute + 30, 0, 0);
    updatedData.end_time = endTime.toTimeString().split(' ')[0];
    
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        const { error } = await _supabase.from('appointments').update(updatedData).eq('id', appointmentId);
        if (error) throw error;

        alert('Agendamento atualizado com sucesso!');
        closeAppointmentDetailsModal();
        loadAppointments((await _supabase.from('professionals').select('*')).data);

    } catch (error) {
        alert('Erro ao atualizar o agendamento: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Salvar Alterações';
    }
}

async function deleteAppointment() {
    const appointmentId = document.getElementById('detailsAppointmentId').value;
    if (!confirm('Tem certeza que deseja excluir este agendamento?')) return;

    try {
        const { error } = await _supabase.from('appointments').delete().eq('id', appointmentId);
        if (error) throw error;
        
        alert('Agendamento excluído com sucesso!');
        closeAppointmentDetailsModal();
        loadAppointments((await _supabase.from('professionals').select('*')).data);

    } catch (error) {
        alert('Erro ao excluir agendamento: ' + error.message);
    }
}

export {
    loadScheduleView,
    openNewAppointmentModal,
    closeAppointmentModal,
    saveAppointment,
    openAppointmentDetails,
    updateAppointment,
    deleteAppointment,
    closeAppointmentDetailsModal,
    changeDay
};
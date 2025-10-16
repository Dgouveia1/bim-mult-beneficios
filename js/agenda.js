import { _supabase } from './supabase.js';
import { openModal } from './clientes.js';
import { logAction } from './logger.js';

let currentScheduleDate = new Date();
let scheduleSubscription = null;
let calendarDate = new Date();
let isCalendarListenerAttached = false;
let isPatientSearchListenerAttached = false;
let allProfessionals = [];

const professionalColors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22'];

function unsubscribeSchedule() {
    if (scheduleSubscription) {
        _supabase.removeChannel(scheduleSubscription);
        scheduleSubscription = null;
        console.log('📅 [AGENDA] Inscrição de tempo real removida.');
    }
}

function changeDay(offset) {
    currentScheduleDate.setDate(currentScheduleDate.getDate() + offset);
    loadScheduleView();
}

function updateDateDisplay() {
    const display = document.getElementById('currentDateDisplay');
    if (display) {
        display.textContent = currentScheduleDate.toLocaleDateString('pt-BR', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
        });
    }
}

function renderMiniCalendar() {
    const container = document.getElementById('miniCalendarContainer');
    if (!container) return;

    calendarDate.setDate(1);
    const month = calendarDate.getMonth();
    const year = calendarDate.getFullYear();
    const monthName = new Date(year, month).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = `
        <div class="mini-calendar-header">
            <button id="calendarPrevMonth"><i class="fas fa-chevron-left"></i></button>
            <span>${monthName}</span>
            <button id="calendarNextMonth"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="mini-calendar-grid">
            <div class="mini-calendar-day">D</div><div class="mini-calendar-day">S</div><div class="mini-calendar-day">T</div><div class="mini-calendar-day">Q</div><div class="mini-calendar-day">Q</div><div class="mini-calendar-day">S</div><div class="mini-calendar-day">S</div>`;

    for (let i = 0; i < firstDay; i++) {
        html += `<div class="mini-calendar-date other-month"></div>`;
    }

    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        let classes = 'mini-calendar-date';
        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            classes += ' today';
        }
        html += `<div class="${classes}" data-day="${day}">${day}</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
}

function setupCalendarEventListeners() {
    if (isCalendarListenerAttached) return;

    const toggleBtn = document.getElementById('calendarToggleBtn');
    const container = document.getElementById('miniCalendarContainer');
    if (!toggleBtn || !container) return;

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = container.style.display === 'block';
        if (!isVisible) {
            calendarDate = new Date(currentScheduleDate);
            renderMiniCalendar();
        }
        container.style.display = isVisible ? 'none' : 'block';
    });

    container.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.target;
        if (target.closest('#calendarPrevMonth')) {
            calendarDate.setMonth(calendarDate.getMonth() - 1);
            renderMiniCalendar();
        } else if (target.closest('#calendarNextMonth')) {
            calendarDate.setMonth(calendarDate.getMonth() + 1);
            renderMiniCalendar();
        } else if (target.classList.contains('mini-calendar-date') && !target.classList.contains('other-month')) {
            const day = parseInt(target.dataset.day, 10);
            currentScheduleDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
            loadScheduleView();
            container.style.display = 'none';
        }
    });

    document.addEventListener('click', () => {
        if (container.style.display === 'block') {
            container.style.display = 'none';
        }
    });

    isCalendarListenerAttached = true;
}

async function fetchAndCacheProfessionals() {
    try {
        const { data: professionals, error: profError } = await _supabase.from('professionals').select('*');
        if (profError) throw profError;
        
        professionals.forEach((prof, index) => {
            prof.color = professionalColors[index % professionalColors.length];
        });
        allProfessionals = professionals;
    } catch (error) {
        console.error("Falha ao buscar profissionais:", error);
        allProfessionals = [];
    }
}

async function loadScheduleView() {
    const container = document.getElementById('scheduleContainer');
    if (!container) return;

    unsubscribeSchedule();
    container.innerHTML = 'Carregando agenda...';
    
    await fetchAndCacheProfessionals();
    await renderSchedule();

    scheduleSubscription = _supabase.channel('public:appointments_agenda')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, async (payload) => {
            
            const changedDate = (payload.new?.appointment_date || payload.old?.appointment_date || '').split('T')[0];
            const currentDateStr = currentScheduleDate.toISOString().split('T')[0];

            if (changedDate !== currentDateStr) {
                return; // Ignora alterações de outros dias
            }

            if (payload.eventType === 'INSERT') {
                 const { data: newAppt, error } = await _supabase.from('appointments').select('*, professionals(name)').eq('id', payload.new.id).single();
                 if (!error && newAppt) {
                    placeAppointmentCard(newAppt);
                 }
            } else if (payload.eventType === 'UPDATE') {
                removeAppointmentCard(payload.old.id);
                const { data: updatedAppt, error } = await _supabase.from('appointments').select('*, professionals(name)').eq('id', payload.new.id).single();
                 if (!error && updatedAppt) {
                    placeAppointmentCard(updatedAppt);
                 }
            } else if (payload.eventType === 'DELETE') {
                removeAppointmentCard(payload.old.id);
            }
        })
        .subscribe();
}

async function renderSchedule() {
    const container = document.getElementById('scheduleContainer');
    if (!container) return;
    
    const rooms = ['Consultório 1', 'Consultório 2', 'Consultório 3 (Dentista)', 'Consultório 4 (segundo andar)', 'Consultório 5'];

    try {
        let html = '<div class="time-column"><div class="schedule-header">Hora</div>';
        for (let h = 7; h < 22; h++) {
            html += `<div class="time-slot">${String(h).padStart(2, '0')}:00</div>`;
            html += `<div class="time-slot">${String(h).padStart(2, '0')}:30</div>`;
        }
        html += '</div><div class="professionals-grid">';
        rooms.forEach(room => {
            html += `<div class="professional-column" data-room-name="${room}"><div class="schedule-header">${room}</div>`;
            for (let h = 7; h < 22; h++) {
                html += `<div class="time-slot" data-time="${h}:00"></div><div class="time-slot" data-time="${h}:30"></div>`;
            }
            html += '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
        
        await loadAppointments();
        updateDateDisplay();
        setupCalendarEventListeners();

    } catch (error) {
        container.innerHTML = `<div style="color:red;">Erro ao carregar a agenda: ${error.message}</div>`;
    }
}

function placeAppointmentCard(appointment) {
    const roomColumn = document.querySelector(`.professional-column[data-room-name="${appointment.room}"]`);
    if (!roomColumn) return;

    const headerHeight = document.querySelector('.schedule-header')?.offsetHeight || 50;
    const [startHour, startMinute] = appointment.start_time.split(':').map(Number);
    const [endHour, endMinute] = appointment.end_time.split(':').map(Number);
    const duration = Math.max(0.5, (endHour + endMinute / 60) - (startHour + startMinute / 60));

    const top = ((startHour - 7) * 120) + (startMinute / 30 * 60) + headerHeight;
    const height = (duration * 120) - 2;

    const card = document.createElement('div');
    card.className = 'appointment-card';
    card.dataset.appointmentId = appointment.id;
    card.style.top = `${top}px`;
    card.style.height = `${height}px`;

    const professional = allProfessionals.find(p => p.id === appointment.professional_id);
    const profColor = professional ? professional.color : '#7f8c8d';
    const professionalName = appointment.professionals?.name || (professional ? professional.name : 'N/A');

    card.innerHTML = `<div class="professional-flag" style="background-color: ${profColor};"></div><strong>${appointment.patient_name}</strong><small>${professionalName}</small>`;
    roomColumn.appendChild(card);
}

function removeAppointmentCard(appointmentId) {
    const cardToRemove = document.querySelector(`[data-appointment-id="${appointmentId}"]`);
    if (cardToRemove) {
        cardToRemove.remove();
    }
}

async function loadAppointments() {
    const year = currentScheduleDate.getFullYear();
    const month = String(currentScheduleDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentScheduleDate.getDate()).padStart(2, '0');
    const selectedDate = `${year}-${month}-${day}`;
    
    document.querySelectorAll('.appointment-card').forEach(card => card.remove());

    try {
        const { data: appointments, error } = await _supabase.from('appointments')
            .select('*, professionals(name)').eq('appointment_date', selectedDate).order('start_time');
        if (error) throw error;

        if (appointments) {
            appointments.forEach(appointment => {
                placeAppointmentCard(appointment);
            });
        }
        
    } catch(error) {
        console.error('Erro ao carregar agendamentos:', error);
    }
}

function setupPatientSearch() {
    if (isPatientSearchListenerAttached) return;

    const searchInput = document.getElementById('appointmentPatientSearch');
    const resultsContainer = document.getElementById('patientSearchResults');
    const patientNameInput = document.getElementById('appointmentPatientName');
    const patientCPFInput = document.getElementById('appointmentPatientCPF');
    const clientIdInput = document.getElementById('appointmentClientId');
    const newClientModal = document.getElementById('newClientModal');

    if (!searchInput || !resultsContainer || !patientNameInput || !patientCPFInput || !clientIdInput) return;

    let searchTimeout;

    searchInput.addEventListener('input', (event) => {
        const query = event.target.value.toLowerCase().trim();
        resultsContainer.innerHTML = '';
        resultsContainer.style.display = 'none';

        if (query.length < 3) return;

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            resultsContainer.innerHTML = '<div>Buscando...</div>';
            resultsContainer.style.display = 'block';

            try {
                const [titularesRes, dependentesRes] = await Promise.all([
                    _supabase.from('clients').select('id, nome, sobrenome, cpf').or(`nome.ilike.%${query}%,sobrenome.ilike.%${query}%,cpf.ilike.%${query}%`).limit(5),
                    _supabase.from('dependents').select('nome, sobrenome, cpf, titular_id, clients!inner(nome, sobrenome)').or(`nome.ilike.%${query}%,sobrenome.ilike.%${query}%,cpf.ilike.%${query}%`).limit(5)
                ]);

                if (titularesRes.error) throw titularesRes.error;
                if (dependentesRes.error) throw dependentesRes.error;

                const combinedResults = [
                    ...(titularesRes.data || []).map(t => ({ ...t, type: 'Titular', clientId: t.id })),
                    ...(dependentesRes.data || []).map(d => {
                        const titularName = d.clients ? `${d.clients.nome} ${d.clients.sobrenome}`.trim() : 'N/A';
                        return { ...d, type: `Dependente de ${titularName}`, clientId: d.titular_id };
                    })
                ];

                resultsContainer.innerHTML = '';
                
                const addNewDiv = document.createElement('div');
                addNewDiv.textContent = '➕ Adicionar Novo Cliente';
                addNewDiv.className = 'add-new-patient';
                resultsContainer.appendChild(addNewDiv);

                if (combinedResults.length > 0) {
                    combinedResults.forEach(person => {
                        const fullName = `${person.nome} ${person.sobrenome || ''}`.trim();
                        const div = document.createElement('div');
                        div.dataset.name = fullName;
                        div.dataset.cpf = person.cpf || '';
                        div.dataset.clientId = person.clientId;
                        div.innerHTML = `${fullName} <br><small>${person.cpf || 'CPF não cadastrado'} - <strong>${person.type}</strong></small>`;
                        resultsContainer.appendChild(div);
                    });
                } else {
                     resultsContainer.innerHTML += '<div>Nenhum cliente encontrado.</div>';
                }

            } catch (error) {
                console.error("Erro na busca de pacientes:", error);
                resultsContainer.innerHTML = '<div>Erro ao buscar.</div>';
            }
        }, 300);
    });
    
    resultsContainer.addEventListener('click', (e) => {
        const targetDiv = e.target.closest('div');
        if (!targetDiv) return;

        if (targetDiv.classList.contains('add-new-patient')) {
            closeAppointmentModal();
            openModal(newClientModal);
        } else if (targetDiv.dataset.name) {
            searchInput.value = targetDiv.dataset.name;
            patientNameInput.value = targetDiv.dataset.name;
            patientCPFInput.value = targetDiv.dataset.cpf;
            clientIdInput.value = targetDiv.dataset.clientId;
            resultsContainer.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-container')) {
            resultsContainer.style.display = 'none';
        }
    });

    isPatientSearchListenerAttached = true;
}

async function openNewAppointmentModal() {
    const modal = document.getElementById('appointmentModal');
    const form = document.getElementById('appointmentForm');
    form.reset();
    document.getElementById('patientSearchResults').innerHTML = '';

    const professionalSelect = document.getElementById('appointmentProfessional');
    professionalSelect.innerHTML = '<option value="">Carregando...</option>';
    try {
        const { data: professionals, error } = await _supabase.from('professionals').select('id, name').order('name');
        if (error) throw error;
        professionalSelect.innerHTML = '<option value="">Selecione</option>';
        professionals.forEach(p => {
            professionalSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        });
    } catch (error) {
        console.error('Erro ao carregar profissionais:', error);
        professionalSelect.innerHTML = '<option value="">Erro ao carregar</option>';
    }

    modal.style.display = 'flex';
    setupPatientSearch();
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
        const { data: appointment, error } = await _supabase.from('appointments').select('*, client_id, professionals(name)').eq('id', appointmentId).single();
        if (error) throw error;
        
        let patientData = null;

        if (appointment.client_id) {
            const { data: titular, error: titularError } = await _supabase.from('clients').select('*, dependents(*)').eq('id', appointment.client_id).single();
            if (titularError) throw titularError;

            if (`${titular.nome} ${titular.sobrenome || ''}`.trim() === appointment.patient_name) {
                patientData = titular;
            } else {
                const dependent = titular.dependents.find(d => `${d.nome} ${d.sobrenome || ''}`.trim() === appointment.patient_name);
                if (dependent) {
                    patientData = { ...dependent, plano: titular.plano, status: titular.status };
                }
            }
        } else {
            console.warn(`Agendamento ${appointment.id} sem client_id. A busca por nome pode ser imprecisa.`);
        }

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
        profSelect.innerHTML = '';
        allProfessionals.forEach(prof => {
            const option = document.createElement('option');
            option.value = prof.id;
            option.textContent = prof.name;
            if (prof.id === appointment.professional_id) option.selected = true;
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
        patient_name: document.getElementById('appointmentPatientName').value,
        client_id: document.getElementById('appointmentClientId').value,
        procedure: form.procedure.value,
        appointment_date: form.date.value,
        start_time: form.time.value,
        professional_id: form.professionalId.value,
        room: form.room.value,
    };

    if (!appointmentData.patient_name || !appointmentData.client_id) {
        alert('Por favor, selecione um paciente válido da lista.');
        return;
    }

    const [hour, minute] = appointmentData.start_time.split(':').map(Number);
    const endTimeObject = new Date();
    endTimeObject.setHours(hour, minute + 30, 0, 0);
    appointmentData.end_time = endTimeObject.toTimeString().split(' ')[0];

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

    try {
        const { data: conflictingAppointments, error: checkError } = await _supabase.from('appointments').select('id').eq('appointment_date', appointmentData.appointment_date).eq('room', appointmentData.room).lt('start_time', appointmentData.end_time).gt('end_time', appointmentData.start_time);
        if (checkError) throw checkError;

        if (conflictingAppointments && conflictingAppointments.length > 0) {
            throw new Error(`Conflito de agendamento! O consultório já está reservado neste horário.`);
        }

        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        const { error: insertError } = await _supabase.from('appointments').insert(appointmentData);
        if (insertError) throw insertError;

        await logAction('CREATE_APPOINTMENT', { patient: appointmentData.patient_name, date: appointmentData.appointment_date, time: appointmentData.start_time, room: appointmentData.room });
        alert('Agendamento salvo com sucesso!');
        closeAppointmentModal();
        
    } catch (error) {
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

        await logAction('UPDATE_APPOINTMENT', { appointmentId: appointmentId, changes: updatedData });
        alert('Agendamento atualizado com sucesso!');
        closeAppointmentDetailsModal();

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
        const { data: apptToDelete, error: fetchError } = await _supabase.from('appointments').select('*').eq('id', appointmentId).single();
        if(fetchError) throw fetchError;

        const { error } = await _supabase.from('appointments').delete().eq('id', appointmentId);
        if (error) throw error;
        
        await logAction('DELETE_APPOINTPOINTMENT', { appointmentId: appointmentId, patient: apptToDelete.patient_name, date: apptToDelete.appointment_date });
        alert('Agendamento excluído com sucesso!');
        closeAppointmentDetailsModal();

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
    changeDay,
    unsubscribeSchedule
};

import { _supabase } from './supabase.js';
import { allPeople, openModal } from './clientes.js';
import { getCurrentUserProfile } from './auth.js';

let currentScheduleDate = new Date();
let scheduleSubscription = null;
let calendarDate = new Date();
let isCalendarListenerAttached = false; // Variável de controle

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



// =================================================================
// LÓGICA DO MINI-CALENDÁRIO (CORRIGIDA)
// =================================================================

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
    // Evita adicionar os mesmos listeners várias vezes
    if (isCalendarListenerAttached) return;

    const toggleBtn = document.getElementById('calendarToggleBtn');
    const container = document.getElementById('miniCalendarContainer');
    if (!toggleBtn || !container) return;

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Impede que o clique feche o menu imediatamente
        const isVisible = container.style.display === 'block';
        if (!isVisible) {
            calendarDate = new Date(currentScheduleDate);
            renderMiniCalendar();
        }
        container.style.display = isVisible ? 'none' : 'block';
    });

    container.addEventListener('click', (e) => {
        e.stopPropagation(); // Impede que o clique dentro do calendário o feche
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

    // Fecha o calendário se clicar fora
    document.addEventListener('click', () => {
        if (container.style.display === 'block') {
            container.style.display = 'none';
        }
    });

    isCalendarListenerAttached = true; // Marca que os listeners foram configurados
}

// =================================================================
// LÓGICA DA AGENDA
// =================================================================

async function loadScheduleView() {
    const container = document.getElementById('scheduleContainer');
    if (!container) return;

    unsubscribeSchedule();
    container.innerHTML = 'Carregando agenda...';
    await renderSchedule();

    scheduleSubscription = _supabase.channel('public:appointments_agenda')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, async () => {
            await loadAppointments();
        })
        .subscribe();
}

async function renderSchedule() {
    const container = document.getElementById('scheduleContainer');
    if (!container) return;
    
    const rooms = ['Consultório 1', 'Consultório 2', 'Consultório 3 (Dentista)', 'Consultório 4', 'Consultório 5'];

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
        setupCalendarEventListeners(); // Configura os eventos do calendário AQUI

    } catch (error) {
        container.innerHTML = `<div style="color:red;">Erro ao carregar a agenda: ${error.message}</div>`;
    }
}


async function loadAppointments() {

    const year = currentScheduleDate.getFullYear();
    const month = String(currentScheduleDate.getMonth() + 1).padStart(2, '0'); // getMonth() é 0-11
    const day = String(currentScheduleDate.getDate()).padStart(2, '0');
    const selectedDate = `${year}-${month}-${day}`;
    
    try {
        const { data: professionals, error: profError } = await _supabase.from('professionals').select('*');
        if (profError) throw profError;
        
        professionals.forEach((prof, index) => {
            prof.color = professionalColors[index % professionalColors.length];
        });

        const { data: appointments, error } = await _supabase.from('appointments')
            .select('*, professionals(name)').eq('appointment_date', selectedDate).order('start_time');
        if (error) throw error;

        document.querySelectorAll('.appointment-card').forEach(card => card.remove());

        if (!appointments) return;

        appointments.forEach(appointment => {
            const roomColumn = document.querySelector(`.professional-column[data-room-name="${appointment.room}"]`);
            if (roomColumn) {
                const [startHour, startMinute] = appointment.start_time.split(':').map(Number);
                const [endHour, endMinute] = appointment.end_time.split(':').map(Number);
                const startTime = startHour + startMinute / 60;
                const endTime = endHour + endMinute / 60;
                const duration = Math.max(0.5, endTime - startTime); // Garante duração mínima

                const top = ((startHour - 7) * 120) + (startMinute / 30 * 60) + 50;
                const height = (duration * 120) - 2;

                const card = document.createElement('div');
                card.className = 'appointment-card';
                card.dataset.appointmentId = appointment.id;
                card.style.top = `${top}px`;
                card.style.height = `${height}px`;
                
                const professional = professionals.find(p => p.id === appointment.professional_id);
                const profColor = professional ? professional.color : '#7f8c8d';

                card.innerHTML = `<div class="professional-flag" style="background-color: ${profColor};"></div><strong>${appointment.patient_name}</strong><small>${appointment.professionals.name}</small>`;
                roomColumn.appendChild(card);
            }
        });
        
    } catch(error) {
        console.error('Erro ao carregar agendamentos:', error);
    }
}

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
async function openNewAppointmentModal() {
    const modal = document.getElementById('appointmentModal');
    const form = document.getElementById('appointmentForm');
    form.reset();
    document.getElementById('patientSearchResults').innerHTML = ''; // Limpa resultados antigos

    // Carrega os profissionais no select (código que você já tem)
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

    // =================================================================
    // ================ INÍCIO DO CÓDIGO DE CORREÇÃO ===================
    // =================================================================
    const searchInput = document.getElementById('appointmentPatientSearch');
    const searchResultsContainer = document.getElementById('patientSearchResults');
    const patientNameInput = document.getElementById('appointmentPatientName');
    const patientCPFInput = document.getElementById('appointmentPatientCPF');
    
    let searchTimeout;

    const handleSearch = (event) => {
        const query = event.target.value.toLowerCase().trim();
        searchResultsContainer.innerHTML = '';
        searchResultsContainer.style.display = 'none';

        if (query.length < 3) {
            return;
        }
        
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            // =================================================================
            // ================ INÍCIO DA LÓGICA CORRIGIDA ===================
            // =================================================================
            
            // 1. Busca nos TITULARES
            const { data: titulares, error: titularesError } = await _supabase
                .from('clients')
                .select('nome, sobrenome, cpf')
                .or(`nome.ilike.%${query}%,sobrenome.ilike.%${query}%,cpf.ilike.%${query}%`);

            if (titularesError) {
                console.error('Erro na busca de titulares:', titularesError);
            }

            // 2. Busca nos DEPENDENTES
            const { data: dependentes, error: dependentesError } = await _supabase
                .from('dependents')
                .select('nome, sobrenome, cpf') // Puxa o nome do titular
                .or(`nome.ilike.%${query}%,sobrenome.ilike.%${query}%,cpf.ilike.%${query}%`);
            
            if (dependentesError) {
                console.error('Erro na busca de dependentes:', dependentesError);
            }

            // 3. Combina os resultados
            const results = [];
            
            if (titulares) {
                titulares.forEach(titular => {
                    results.push({ ...titular, isDependente: false }); 
                });
            }

            if (dependentes) {
                dependentes.forEach(dep => {
                    const titularName = dep.titulares ? `${dep.titulares.nome} ${dep.titulares.sobrenome}` : 'N/A';
                    results.push({ ...dep, titularName: titularName, isDependente: true });
                });
            }

            // =================================================================
            // ================== FIM DA LÓGICA CORRIGIDA ====================
            // =================================================================

            // O código para exibir os resultados permanece o mesmo
            searchResultsContainer.innerHTML = ''; // Limpa antes de adicionar novos
            if (results.length > 0) {
                searchResultsContainer.style.display = 'block';
                results.forEach(person => {
                    const item = document.createElement('div');
                    item.classList.add('autocomplete-item');
                    
                    let text = `${person.nome} ${person.sobrenome} (CPF: ${person.cpf || 'N/A'})`;
                    if (person.isDependente) {
                        text += ` - [Dependente de: ${person.titularName}]`;
                    }
                    item.textContent = text;
                    
                    item.addEventListener('click', () => {
                        searchInput.value = `${person.nome} ${person.sobrenome}`;
                        patientNameInput.value = `${person.nome} ${person.sobrenome}`;
                        patientCPFInput.value = person.cpf || '';
                        searchResultsContainer.style.display = 'none';
                    });

                    searchResultsContainer.appendChild(item);
                });
            } else {
                 searchResultsContainer.style.display = 'block';
                 searchResultsContainer.innerHTML = '<div class="autocomplete-item-not-found">Nenhum cliente encontrado.</div>';
            }
        }, 300);
    }

    // Limpa o listener antigo para evitar duplicação e adiciona o novo
    searchInput.removeEventListener('input', handleSearch);
    searchInput.addEventListener('input', handleSearch);
    // =================================================================
    // ================== FIM DO CÓDIGO DE CORREÇÃO ====================
    // =================================================================
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
        const { data: allProfessionals, error: profError } = await _supabase.from('professionals').select('*');
        if (profError) throw profError;

        profSelect.innerHTML = '';
        allProfessionals.forEach(prof => {
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

    const [hour, minute] = appointmentData.start_time.split(':').map(Number);
    const endTimeObject = new Date();
    endTimeObject.setHours(hour, minute + 30, 0, 0);
    appointmentData.end_time = endTimeObject.toTimeString().split(' ')[0];

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

    try {
        const { data: conflictingAppointments, error: checkError } = await _supabase
            .from('appointments')
            .select('id, patient_name, start_time, end_time')
            .eq('appointment_date', appointmentData.appointment_date)
            .eq('room', appointmentData.room)
            .lt('start_time', appointmentData.end_time)
            .gt('end_time', appointmentData.start_time);

        if (checkError) throw checkError;

        if (conflictingAppointments && conflictingAppointments.length > 0) {
            const conflict = conflictingAppointments[0];
            const errorMessage = `Conflito de agendamento! O ${appointmentData.room} já está reservado para "${conflict.patient_name}" das ${conflict.start_time.substring(0, 5)} às ${conflict.end_time.substring(0, 5)}.`;
            throw new Error(errorMessage);
        }

        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        const { error: insertError } = await _supabase.from('appointments').insert(appointmentData);
        if (insertError) throw insertError;

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
        const { error } = await _supabase.from('appointments').delete().eq('id', appointmentId);
        if (error) throw error;
        
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
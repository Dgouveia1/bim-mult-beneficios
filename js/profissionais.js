import { _supabase } from './supabase.js';
import { logAction } from './logger.js';
import { getCurrentUserProfile } from './auth.js';
// ATUALIZADO: Importa showConfirm
import { showToast, showConfirm } from './utils.js';

const professionalModal = document.getElementById('professionalModal');
const professionalForm = document.getElementById('professionalForm');
const professionalIdInput = document.getElementById('professionalId');

// NOVO: Elementos do Modal de Disponibilidade
const eventModal = document.getElementById('professionalEventModal');
const eventForm = document.getElementById('professionalEventForm');
const eventProfessionalIdInput = document.getElementById('eventProfessionalId');
const eventDateInput = document.getElementById('eventDate');
const myEventsListContainer = document.getElementById('myEventsListContainer');


// Carrega os profissionais e renderiza na tabela
async function loadProfessionalsData() {
    const tableBody = document.getElementById('professionalsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';

    try {
        const { data: professionals, error } = await _supabase
            .from('professionals')
            .select('*')
            .order('name');
        if (error) throw error;

        tableBody.innerHTML = '';
        if (professionals.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Nenhum profissional cadastrado.</td></tr>';
            return;
        }

        professionals.forEach(prof => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${prof.name}</td>
                <td>${prof.specialty || ''}</td>
                <td>${prof.CRM || ''}</td>
                <td class="actions">
                    <button class="btn btn-secondary btn-small edit-professional-btn" data-id="${prof.id}">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="4" style="color:red;">Erro ao carregar os profissionais.</td></tr>';
        console.error(error);
    }
}

// Abre o modal para editar um profissional (Admin)
async function openProfessionalModal(id) {
    professionalForm.reset();
    
    try {
        const { data: prof, error } = await _supabase.from('professionals').select('*').eq('id', id).single();
        if (error) throw error;

        professionalIdInput.value = prof.id;
        document.getElementById('professionalName').value = prof.name;
        document.getElementById('professionalSpecialty').value = prof.specialty;
        document.getElementById('professionalCRM').value = prof.CRM;
        
        professionalModal.style.display = 'flex';

    } catch (error) {
        showToast('Não foi possível carregar os dados do profissional.');
    }
}

// Salva as alterações do profissional (Admin)
async function saveProfessional(event) {
    event.preventDefault();
    const submitButton = professionalForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    const professionalData = {
        name: document.getElementById('professionalName').value,
        specialty: document.getElementById('professionalSpecialty').value,
        CRM: document.getElementById('professionalCRM').value,
    };

    const id = professionalIdInput.value;

    try {
        const { error } = await _supabase.from('professionals').update(professionalData).eq('id', id);
        if (error) throw error;

        await logAction('UPDATE_PROFESSIONAL', { professionalId: id, name: professionalData.name });

        professionalModal.style.display = 'none';
        await loadProfessionalsData(); // Recarrega a tabela

    } catch (error) {
        showToast('Erro ao salvar as alterações: ' + error.message);
    } finally {
        submitButton.disabled = false;
    }
}


// =================================================================
// NOVAS FUNÇÕES: GERENCIAR DISPONIBILIDADE (PROFISSIONAL LOGADO)
// =================================================================

/**
 * Abre o modal para o profissional logado gerenciar seus bloqueios.
 */
async function openMyAvailabilityModal() {
    const user = getCurrentUserProfile();
    if (user.role !== 'medicos') {
        showToast('Acesso negado. Esta função é apenas para profissionais de saúde.');
        return;
    }

    try {
        // 1. Encontra o ID do profissional com base no user_id logado
        const { data: professional, error } = await _supabase
            .from('professionals')
            .select('id')
            .eq('user_id', user.id)
            .single();

        if (error || !professional) {
            throw new Error('Perfil profissional não encontrado. Contate o administrador.');
        }

        // 2. Reseta o formulário e define a data padrão
        eventForm.reset();
        eventProfessionalIdInput.value = professional.id;
        const today = new Date().toISOString().split('T')[0];
        eventDateInput.value = today;

        // 3. Carrega os eventos para o dia de hoje
        await loadMyEvents(professional.id, today);

        // 4. Abre o modal
        eventModal.style.display = 'flex';

    } catch (error) {
        showToast('Erro ao abrir gerenciador: ' + error.message);
        console.error(error);
    }
}

/**
 * Carrega e exibe os eventos de bloqueio para um profissional e data específicos.
 */
async function loadMyEvents(professionalId, date) {
    if (!myEventsListContainer) return;
    myEventsListContainer.innerHTML = '<p>Carregando bloqueios...</p>';

    try {
        const { data: events, error } = await _supabase
            .from('professional_events')
            .select('*')
            .eq('professional_id', professionalId)
            .eq('event_date', date)
            .order('start_time');

        if (error) throw error;

        if (events.length === 0) {
            myEventsListContainer.innerHTML = '<p>Nenhum bloqueio encontrado para esta data.</p>';
            return;
        }

        myEventsListContainer.innerHTML = '';
        events.forEach(event => {
            const item = document.createElement('div');
            item.className = 'event-item';
            item.innerHTML = `
                <div class="event-item-details">
                    <strong>${event.title}</strong>
                    <span>${event.start_time.substring(0, 5)} - ${event.end_time.substring(0, 5)}</span>
                </div>
                <button class="event-item-delete" data-event-id="${event.id}" title="Excluir bloqueio">
                    <i class="fas fa-trash-alt"></i>
                </button>
            `;
            myEventsListContainer.appendChild(item);
        });

    } catch (error) {
        myEventsListContainer.innerHTML = '<p style="color:red;">Erro ao carregar bloqueios.</p>';
    }
}

/**
 * Salva um novo evento de bloqueio no banco de dados.
 */
async function saveProfessionalEvent(event) {
    event.preventDefault();
    const submitButton = eventForm.querySelector('button[type="submit"]');
    
    const formData = {
        professional_id: eventProfessionalIdInput.value,
        title: document.getElementById('eventTitle').value,
        event_date: eventDateInput.value,
        start_time: document.getElementById('eventStartTime').value,
        end_time: document.getElementById('eventEndTime').value,
    };

    // Validação simples
    if (formData.end_time <= formData.start_time) {
        showToast('A hora de fim deve ser maior que a hora de início.');
        return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        // Verifica conflito com outros eventos do PRÓPRIO profissional
        const { data: conflictingEvents, error: checkError } = await _supabase
            .from('professional_events')
            .select('id')
            .eq('professional_id', formData.professional_id)
            .eq('event_date', formData.event_date)
            .lt('start_time', formData.end_time)
            .gt('end_time', formData.start_time);

        if (checkError) throw checkError;

        if (conflictingEvents.length > 0) {
            throw new Error('Você já possui um bloqueio que conflita com este horário.');
        }

        // Insere o novo evento
        const { error: insertError } = await _supabase
            .from('professional_events')
            .insert(formData);

        if (insertError) throw insertError;

        await logAction('CREATE_PROFESSIONAL_EVENT', { professionalId: formData.professional_id, date: formData.event_date, title: formData.title });

        // Limpa o formulário (exceto data e ID) e recarrega a lista
        document.getElementById('eventTitle').value = '';
        document.getElementById('eventStartTime').value = '';
        document.getElementById('eventEndTime').value = '';
        
        await loadMyEvents(formData.professional_id, formData.event_date);

    } catch (error) {
        showToast('Erro ao salvar bloqueio: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-plus"></i> Adicionar Bloqueio';
    }
}

/**
 * Exclui um evento de bloqueio.
 */
async function deleteProfessionalEvent(eventId) {
    // ATUALIZADO: Substitui confirm() por showConfirm()
    const confirmed = await showConfirm('Tem certeza que deseja excluir este bloqueio?');
    if (!confirmed) return;

    try {
        const { error } = await _supabase
            .from('professional_events')
            .delete()
            .eq('id', eventId);

        if (error) throw error;
        
        await logAction('DELETE_PROFESSIONAL_EVENT', { eventId: eventId });
        showToast('Bloqueio removido com sucesso.'); // Adiciona feedback

        // Recarrega a lista
        const professionalId = eventProfessionalIdInput.value;
        const date = eventDateInput.value;
        await loadMyEvents(professionalId, date);

    } catch (error) {
        showToast('Erro ao excluir bloqueio: ' + error.message);
    }
}

export { 
    loadProfessionalsData, 
    openProfessionalModal, 
    saveProfessional,
    openMyAvailabilityModal,
    saveProfessionalEvent,
    loadMyEvents,
    deleteProfessionalEvent
};
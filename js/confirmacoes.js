import { _supabase } from './supabase.js';
import { allPeople, loadClientsData } from './clientes.js';

/**
 * Carrega e exibe os agendamentos dos próximos 5 dias para confirmação.
 */
async function loadConfirmationsData() {
    const tableBody = document.getElementById('confirmationsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="6">Carregando agendamentos...</td></tr>';

    try {
        if (allPeople.length === 0) {
            await loadClientsData();
        }

        const today = new Date();
        const fiveDaysLater = new Date();
        fiveDaysLater.setDate(today.getDate() + 5);

        const startDate = today.toISOString().split('T')[0];
        const endDate = fiveDaysLater.toISOString().split('T')[0];

        const { data: appointments, error } = await _supabase
            .from('appointments')
            .select(`
                id,
                patient_name,
                appointment_date,
                start_time,
                procedure,
                confirmacao, 
                professionals ( name )
            `)
            .gte('appointment_date', startDate)
            .lte('appointment_date', endDate)
            .order('appointment_date')
            .order('start_time');

        if (error) throw error;

        if (appointments.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6">Nenhum agendamento encontrado para os próximos 5 dias.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';

        appointments.forEach(appt => {
            const person = allPeople.find(p => p.nome.toLowerCase() === appt.patient_name.toLowerCase());
            const telefone = person ? person.telefone : 'Não encontrado';

            const row = document.createElement('tr');
            
            const date = new Date(appt.appointment_date + 'T00:00:00').toLocaleDateString('pt-BR');
            const time = appt.start_time.substring(0, 5);
            const isChecked = appt.confirmacao ? 'checked' : '';

            row.innerHTML = `
                <td data-label="Paciente">${appt.patient_name}</td>
                <td data-label="Telefone">${telefone}</td>
                <td data-label="Data/Hora">${date} às ${time}</td>
                <td data-label="Profissional">${appt.professionals.name}</td>
                <td data-label="Observações">${appt.procedure || ''}</td>
                <td data-label="Confirmado" class="confirmation-cell">
                    <input type="checkbox" class="confirmation-checkbox" data-appointment-id="${appt.id}" ${isChecked}>
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (error) {
        console.error('Erro ao carregar confirmações:', error);
        tableBody.innerHTML = `<tr><td colspan="6" style="color:red;">Erro ao carregar os agendamentos: ${error.message}</td></tr>`;
    }
}

/**
 * Atualiza o status de confirmação de um agendamento no banco de dados.
 * @param {string} appointmentId - O ID do agendamento a ser atualizado.
 * @param {boolean} isConfirmed - O novo status da confirmação.
 */
async function updateConfirmationStatus(appointmentId, isConfirmed) {
    try {
        const { error } = await _supabase
            .from('appointments')
            .update({ confirmacao: isConfirmed })
            .eq('id', appointmentId);
        
        if (error) throw error;

    } catch (error) {
        console.error('Erro ao atualizar confirmação:', error);
        showToast('Não foi possível salvar a confirmação. Tente novamente.');
    }
}


export { loadConfirmationsData, updateConfirmationStatus };
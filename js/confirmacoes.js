import { _supabase } from './supabase.js';
// ATUALIZAÇÃO: Não precisamos mais importar 'clientes.js'
import { showToast } from './utils.js';

/**
 * Carrega e exibe os agendamentos dos próximos 5 dias para confirmação.
 */
async function loadConfirmationsData() {
    const tableBody = document.getElementById('confirmationsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="6">Carregando agendamentos...</td></tr>';

    try {
        // CORREÇÃO: Removemos o 'loadClientsData(null, true)'

        const today = new Date();
        const fiveDaysLater = new Date();
        fiveDaysLater.setDate(today.getDate() + 5);

        const startDate = today.toISOString().split('T')[0];
        const endDate = fiveDaysLater.toISOString().split('T')[0];

        // CORREÇÃO: A sintaxe do select foi alterada para resolver o erro de relação.
        // Usamos "clients:clients!inner!client_id(...)" para dizer:
        // 1. "clients:" -> Queremos que o resultado venha no objeto `appt.clients`
        // 2. "clients"   -> A tabela de destino é a 'clients'
        // 3. "!inner!client_id" -> Use a coluna 'client_id' da tabela 'appointments' para fazer um INNER JOIN.
        const { data: appointments, error } = await _supabase
            .from('appointments')
            .select(`
                id,
                patient_name,
                appointment_date,
                start_time,
                procedure,
                confirmacao, 
                professionals ( name ),
                clients:clients!inner!client_id ( 
                    nome, 
                    sobrenome, 
                    telefone, 
                    dependents ( nome, sobrenome, telefone )
                )
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
            
            // --- INÍCIO: LÓGICA DE BUSCA DE TELEFONE (NOVA E EFICIENTE) ---
            let telefone = 'Não encontrado';
            const titular = appt.clients; // Objeto 'clients' (titular) vindo da query

            if (titular) {
                const titularFullName = `${titular.nome || ''} ${titular.sobrenome || ''}`.trim();

                // 1. Verifica se o paciente é o próprio titular
                if (titularFullName.toLowerCase() === appt.patient_name.toLowerCase()) {
                    telefone = titular.telefone;
                } 
                // 2. Se não for o titular, procura nos dependentes
                else if (titular.dependents && titular.dependents.length > 0) {
                    const dependent = titular.dependents.find(d => 
                        `${d.nome || ''} ${d.sobrenome || ''}`.trim().toLowerCase() === appt.patient_name.toLowerCase()
                    );
                    
                    if (dependent) {
                        // Usa o telefone do dependente, ou o do titular como fallback
                        telefone = dependent.telefone || titular.telefone;
                    } else {
                        // Fallback: Nome não bateu com titular nem dependentes (pode ser dado antigo)
                        telefone = titular.telefone; 
                    }
                }
                // 3. Se o titular não tem dependentes, usa o telefone do titular
                else {
                     telefone = titular.telefone;
                }
            }
            telefone = telefone || 'Não encontrado'; // Garante que 'null' ou 'undefined' sejam tratados
            // --- FIM: LÓGICA DE BUSCA DE TELEFONE ---


            // --- INÍCIO: LÓGICA DO BOTÃO WHATSAPP ---
            const cleanedPhone = (telefone || '').replace(/\D/g, '');
            let whatsappButton = '';
            if (cleanedPhone && (cleanedPhone.length === 10 || cleanedPhone.length === 11)) {
                const whatsappLink = `https://wa.me/55${cleanedPhone}`;
                whatsappButton = `
                    <a href="${whatsappLink}" target="_blank" class="btn btn-success btn-small whatsapp-btn" title="Abrir WhatsApp">
                        <i class="fab fa-whatsapp"></i>
                    </a>
                `;
            }
            // --- FIM: LÓGICA DO BOTÃO WHATSAPP ---

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
                <td data-label="Ações" class="confirmation-cell">
                    <div style="display: inline-flex; gap: 15px; align-items: center;">
                        <input type="checkbox" class="confirmation-checkbox" data-appointment-id="${appt.id}" ${isChecked} title="Confirmado">
                        ${whatsappButton}
                    </div>
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
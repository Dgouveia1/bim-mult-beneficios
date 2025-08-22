import { _supabase } from './supabase.js';
import { allPeople } from './clientes.js';
import { getCurrentUserProfile } from './auth.js';

let allExams = [];
let selectedExams = [];
let patientsSubscription = null; // Variável para a inscrição em tempo real

// Função para remover a inscrição
function unsubscribePatients() {
    if (patientsSubscription) {
        _supabase.removeChannel(patientsSubscription);
        patientsSubscription = null;
        console.log('👨‍⚕️ [PACIENTES] Inscrição de tempo real removida.');
    }
}

async function initializeExamsCache() {
    try {
        const { data, error } = await _supabase.from('exams').select('*');
        if (error) throw error;
        allExams = data;
    } catch (error) {
        console.error("Erro ao carregar cache de exames:", error);
    }
}
initializeExamsCache();

// Carrega a lista de pacientes que fizeram check-in para o médico logado
async function loadPatientsData() {
    const patientListContainer = document.getElementById('patientQueueList');
    if (!patientListContainer) return;

    patientListContainer.innerHTML = '<p>Carregando...</p>';
    
    const currentUser = getCurrentUserProfile();
    if (!currentUser || currentUser.role !== 'medicos') {
        patientListContainer.innerHTML = '<p>Acesso restrito a usuários da clínica.</p>';
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    try {
        // Primeiro, remove qualquer inscrição anterior
        unsubscribePatients();
        
        // Busca o ID do profissional
        const { data: professional, error: profError } = await _supabase
            .from('professionals')
            .select('id')
            .eq('user_id', currentUser.id)
            .single();

        if (profError || !professional) {
            throw new Error('Perfil profissional não encontrado para este usuário.');
        }
        
        const professionalId = professional.id;

        // Busca os agendamentos
        const { data, error } = await _supabase
            .from('appointments')
            .select('*')
            .eq('appointment_date', today)
            .eq('professional_id', professionalId)
            .in('status', ['chegou', 'em_atendimento'])
            .order('start_time');

        if (error) throw error;
        
        renderPatientsList(data);
        
        // Cria a inscrição para mudanças futuras
        patientsSubscription = _supabase.channel('public:appointments_medico')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'appointments',
                filter: `professional_id=eq.${professionalId}` // Filtra apenas para este médico
            }, (payload) => {
                console.log('👨‍⚕️ [PACIENTES] Mudança detectada nos agendamentos!', payload);
                // Recarrega a lista quando houver mudanças
                loadPatientsData();
            })
            .subscribe();
        
        console.log('👨‍⚕️ [PACIENTES] Inscrição de tempo real ativada.');

    } catch (error) {
        patientListContainer.innerHTML = `<p style="color:red">${error.message}</p>`;
        console.error(error);
    }
}

// Função separada para renderizar a lista de pacientes
function renderPatientsList(data) {
    const patientListContainer = document.getElementById('patientQueueList');
    if (!patientListContainer) return;
    
    patientListContainer.innerHTML = '';
    if (data.length === 0) {
        patientListContainer.innerHTML = '<p>Nenhum paciente na fila de espera.</p>';
        return;
    }

    data.forEach(appt => {
        const item = document.createElement('div');
        item.className = 'paciente-espera-item';
        if (appt.status === 'em_atendimento') item.classList.add('active');
        item.dataset.appointmentId = appt.id;
        item.innerHTML = `<span class="nome">${appt.patient_name}</span><span class="horario">${appt.start_time.substring(0, 5)}</span>`;
        patientListContainer.appendChild(item);
    });
}

// Lida com a seleção de um paciente na fila
async function selectPatient(appointmentId) {
    if (!appointmentId) return;

    selectedExams = [];
    renderSelectedExams();
    
    document.querySelectorAll('.paciente-espera-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`.paciente-espera-item[data-appointment-id="${appointmentId}"]`)?.classList.add('active');

    document.getElementById('consultationWorkspace').style.display = 'flex';
    document.getElementById('noPatientSelected').style.display = 'none';
    
    try {
        await _supabase.from('appointments').update({ status: 'em_atendimento' }).eq('id', appointmentId);
        
        const { data: appt, error } = await _supabase.from('appointments').select('*').eq('id', appointmentId).single();
        if (error) throw error;

        const patientData = allPeople.find(p => p.nome === appt.patient_name);

        document.getElementById('currentPatientName').textContent = patientData?.nome || 'N/A';
        document.getElementById('currentPatientAge').textContent = '-';
        document.getElementById('currentPatientPlan').textContent = patientData?.plano || 'N/A';
        document.getElementById('currentAppointmentId').value = appointmentId;

        await loadPatientHistory(patientData.cpf);
        setupExamSearch();

    } catch (error) {
        alert('Erro ao selecionar o paciente.');
        console.error(error);
    }
}

// Carrega o histórico de consultas passadas do paciente
// Carrega o histórico de consultas passadas do paciente
// Carrega o histórico de consultas passadas do paciente
async function loadPatientHistory(patientCpf) {
    const historyContainer = document.getElementById('patientHistoryContainer');
    historyContainer.innerHTML = '<p>Carregando histórico...</p>';
    
    // Obter o nome do paciente da interface, que já deve estar preenchido por selectPatient
    const patientName = document.getElementById('currentPatientName').textContent;

    if (!patientName || patientName === 'Selecione um paciente') {
        historyContainer.innerHTML = '<p>Selecione um paciente para ver o histórico.</p>';
        return;
    }

    try {
        // 1. Buscar todos os appointments (agendamentos) para este paciente
        const { data: patientAppointments, error: apptError } = await _supabase
            .from('appointments')
            .select('id, appointment_date, start_time, professional_id, professionals(name)') // Inclui professional(name) para exibir o nome
            .eq('patient_name', patientName)
            .order('appointment_date', { ascending: false })
            .order('start_time', { ascending: false });

        if (apptError) throw apptError;

        if (patientAppointments.length === 0) {
            historyContainer.innerHTML = '<p>Nenhuma consulta anterior registrada para este paciente.</p>';
            return;
        }

        // Extrair os IDs dos agendamentos
        const appointmentIds = patientAppointments.map(appt => appt.id);

        // 2. Usar os IDs dos agendamentos para buscar as consultations (consultas)
        const { data: history, error: consultError } = await _supabase
            .from('consultations')
            .select('*') // Seleciona todas as colunas da consulta
            .in('appointment_id', appointmentIds)
            .order('created_at', { ascending: false });

        if (consultError) throw consultError;
        
        historyContainer.innerHTML = ''; // Limpa o container antes de renderizar
        
        if (history.length === 0) {
            historyContainer.innerHTML = '<p>Nenhuma consulta anterior registrada para este paciente.</p>';
            return;
        }

        history.forEach(consultation => {
            // Encontrar o agendamento correspondente para obter a data e o nome do profissional
            const correspondingAppointment = patientAppointments.find(appt => appt.id === consultation.appointment_id);
            const professionalName = correspondingAppointment?.professionals?.name || 'N/A';
            const consultationDate = correspondingAppointment?.appointment_date ? new Date(correspondingAppointment.appointment_date).toLocaleDateString('pt-BR') : 'N/A';


            const item = document.createElement('div');
            item.className = 'historico-item card';
            item.innerHTML = `
                <p><strong>Data:</strong> ${consultationDate}</p>
                <p><strong>Profissional:</strong> ${professionalName}</p>
                <p><strong>Queixa Principal:</strong> ${consultation.queixa_principal || 'N/A'}</p>
                <p><strong>Diagnóstico:</strong> ${consultation.diagnostico || 'N/A'}</p>
                <p class="details-link" style="color: var(--primary-color); cursor: pointer;">Ver Detalhes</p>
                <div class="full-details" style="display: none; margin-top: 10px; border-top: 1px dashed #eee; padding-top: 10px;">
                    <p><strong>Exame Físico:</strong> ${consultation.exame_fisico || 'N/A'}</p>
                    <p><strong>Receituário:</strong> ${consultation.receituario || 'N/A'}</p>
                    <p><strong>Pedidos de Exames:</strong> ${consultation.pedido_exames ? JSON.parse(consultation.pedido_exames).join(', ') : 'N/A'}</p>
                </div>
            `;
            // Adicionar listener para expandir/recolher detalhes
            item.querySelector('.details-link').addEventListener('click', (e) => {
                const fullDetails = e.target.nextElementSibling;
                if (fullDetails) {
                    fullDetails.style.display = fullDetails.style.display === 'none' ? 'block' : 'none';
                    e.target.textContent = fullDetails.style.display === 'none' ? 'Ver Detalhes' : 'Esconder Detalhes';
                }
            });

            historyContainer.appendChild(item);
        });
        
    } catch (error) {
        historyContainer.innerHTML = `<p style="color:red;">Erro ao carregar o histórico: ${error.message}</p>`;
        console.error('Erro ao carregar o histórico de consultas:', error);
    }
}


// Lógica da Aba de Exames (sem alterações)
function setupExamSearch() {
    const searchInput = document.getElementById('examSearchInput');
    const resultsContainer = document.getElementById('examSearchResults');

    if (!searchInput || !resultsContainer) return;

    // Evento de digitação no campo de busca
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        resultsContainer.innerHTML = '';

        if (query.length < 2) {
            resultsContainer.style.display = 'none';
            return;
        }

        const filteredExams = allExams.filter(exam =>
            exam.name.toLowerCase().includes(query)
        );

        if (filteredExams.length === 0) {
            resultsContainer.style.display = 'none';
            return;
        }

        filteredExams.forEach(exam => {
            const div = document.createElement('div');
            // Armazena o ID do exame no elemento para fácil acesso
            div.dataset.examId = exam.id;
            div.textContent = `${exam.name} - R$ ${exam.value ? exam.value.toFixed(2).replace('.', ',') : '0,00'}`;
            resultsContainer.appendChild(div);
        });

        resultsContainer.style.display = 'block';
    });

    // Evento de clique nos resultados da busca
    resultsContainer.addEventListener('click', (event) => {
        const examId = parseInt(event.target.dataset.examId);
        if (examId) {
            handleExamSelection(examId);
            searchInput.value = ''; // Limpa o campo de busca
            resultsContainer.style.display = 'none'; // Esconde os resultados
        }
    });

    // Esconde os resultados se clicar fora
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.autocomplete-container')) {
            resultsContainer.style.display = 'none';
        }
    });
}


// ADICIONE ESTA NOVA FUNÇÃO ABAIXO DE setupExamSearch
function handleExamSelection(examId) {
    // Verifica se o exame já foi adicionado
    if (selectedExams.some(exam => exam.id === examId)) {
        alert('Este exame já foi adicionado.');
        return;
    }

    // Encontra o exame completo na lista de todos os exames
    const examToAdd = allExams.find(exam => exam.id === examId);
    if (examToAdd) {
        selectedExams.push(examToAdd);
        renderSelectedExams(); // Atualiza a lista de exames selecionados na tela
    }
}


// CÓDIGO CORRIGIDO
function renderSelectedExams() {
    const listContainer = document.getElementById('selectedExamsList');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (selectedExams.length === 0) {
        listContainer.innerHTML = '<p>Nenhum exame adicionado.</p>';
        return;
    }

    selectedExams.forEach(exam => {
        const item = document.createElement('div');
        item.className = 'selected-item';
        
        // CORREÇÃO: Converte o valor para número e formata com segurança.
        const examValue = parseFloat(exam.value);
        const formattedValue = isNaN(examValue) ? '0,00' : examValue.toFixed(2).replace('.', ',');

        item.innerHTML = `
            <span>${exam.name}</span>
            <span>R$ ${formattedValue}</span>
            <button type="button" class="btn btn-danger btn-small remove-item-btn" data-exam-id="${exam.id}">
                &times;
            </button>
        `;
        listContainer.appendChild(item);
    });
}


function removeExam(examId) {
    selectedExams = selectedExams.filter(exam => exam.id !== examId);
    renderSelectedExams();
}


async function finalizeConsultation() {
    const appointmentId = document.getElementById('currentAppointmentId').value;
    const submitButton = document.getElementById('finalizeConsultationBtn');
    const currentUser = getCurrentUserProfile();
    
    // CORREÇÃO: Busca o ID do profissional com base no ID do usuário logado
    const { data: professional, error: profError } = await _supabase
        .from('professionals')
        .select('id')
        .eq('user_id', currentUser.id)
        .single();
    
    if (profError || !professional) {
        alert('Erro: Perfil profissional não encontrado.');
        return;
    }
    
    const consultationData = {
        appointment_id: appointmentId,
        professional_id: professional.id, // <-- USANDO O ID CORRETO
        queixa_principal: document.getElementById('queixaPrincipal').value,
        exame_fisico: document.getElementById('exameFisico').value,
        diagnostico: document.getElementById('diagnostico').value,
        receituario: document.getElementById('receituario').value,
        pedido_exames: JSON.stringify(selectedExams.map(e => e.name))
    };
    
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizando...';

    try {
        const { error: consultError } = await _supabase.from('consultations').insert(consultationData);
        if (consultError) throw consultError;
        
        const { error: apptError } = await _supabase.from('appointments')
            .update({ status: 'finalizado', end_time: new Date().toTimeString().split(' ')[0] })
            .eq('id', appointmentId);
        if (apptError) throw apptError;
            
        alert('Consulta finalizada e salva com sucesso!');
        
        document.getElementById('consultationWorkspace').style.display = 'none';
        document.getElementById('noPatientSelected').style.display = 'block';
        document.querySelectorAll('#consultationWorkspace textarea').forEach(ta => ta.value = '');
        
        loadPatientsData();

    } catch (error) {
        alert('Erro ao salvar a consulta: ' + error.message);
        console.error(error);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Finalizar Consulta';
    }
}

function printContent(targetId) {
    const contentToPrint = document.getElementById(targetId)?.querySelector('textarea')?.value;
    const patientName = document.getElementById('currentPatientName').textContent;
    const currentUser = getCurrentUserProfile(); // Pega o médico logado
    
    if (!contentToPrint || contentToPrint.trim() === '') {
        alert('Não há conteúdo para imprimir.');
        return;
    }
    
    let printArea = document.getElementById('print-area');
    if (printArea) printArea.remove();
    
    printArea = document.createElement('div');
    printArea.id = 'print-area';
    printArea.style.fontFamily = 'Arial, sans-serif';
    printArea.innerHTML = `
        <div style="padding: 20px;">
            <h3 style="text-align: center;">${currentUser.full_name}</h3>
            <p style="text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 10px;">${currentUser.crm || ''}</p>
            <h4 style="margin-top: 30px;">Paciente: ${patientName}</h4>
            <pre style="white-space: pre-wrap; font-family: inherit; font-size: 14px; margin-top: 20px;">${contentToPrint}</pre>
        </div>
    `;
    
    document.body.appendChild(printArea);
    window.print();
    document.body.removeChild(printArea);
}

function printExamDocuments() {
    const patientName = document.getElementById('currentPatientName').textContent;
    const currentUser = getCurrentUserProfile(); // Pega o médico logado
    
    if (selectedExams.length === 0) {
        alert('Nenhum exame selecionado para impressão.');
        return;
    }

    const pedidoHtml = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h3 style="text-align: center;">${currentUser.full_name}</h3>
            <p style="text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 10px;">${currentUser.crm || ''}</p>
            <h4 style="margin-top: 30px;">Paciente: ${patientName}</h4>
            <h4 style="margin-top: 20px;">Solicitação de Exames:</h4>
            <ul style="list-style-position: inside; padding-left: 0;">
                ${selectedExams.map(exam => `<li>${exam.name}</li>`).join('')}
            </ul>
        </div>
    `;

    const totalValue = selectedExams.reduce((sum, exam) => sum + (exam.value || 0), 0);
    const orcamentoHtml = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h3 style="text-align: center;">Orçamento de Exames</h3>
            <p style="text-align: center;">Bim Benefícios</p>
            <h4 style="margin-top: 30px;">Paciente: ${patientName}</h4>
            <table style="width: 100%; margin-top: 20px; border-collapse: collapse;">
                <thead><tr><th style="text-align: left; border-bottom: 1px solid #ccc; padding: 8px;">Exame</th><th style="text-align: right; border-bottom: 1px solid #ccc; padding: 8px;">Valor</th></tr></thead>
                <tbody>
                    ${selectedExams.map(exam => `<tr><td style="padding: 8px;">${exam.name}</td><td style="text-align: right; padding: 8px;">R$ ${exam.value ? exam.value.toFixed(2).replace('.', ',') : '0,00'}</td></tr>`).join('')}
                </tbody>
                <tfoot>
                    <tr><td colspan="2" style="text-align: right; font-weight: bold; padding: 15px 8px; border-top: 1px solid #ccc;">
                        Valor Total: R$ ${totalValue.toFixed(2).replace('.', ',')}
                    </td></tr>
                </tfoot>
            </table>
        </div>
    `;

    const printContent = `${pedidoHtml}<div style="page-break-before: always;"></div>${orcamentoHtml}`;
    
    let printArea = document.getElementById('print-area');
    if (printArea) printArea.remove();
    
    printArea = document.createElement('div');
    printArea.id = 'print-area';
    printArea.innerHTML = printContent;
    
    document.body.appendChild(printArea);
    window.print();
    document.body.removeChild(printArea);
}

export { loadPatientsData, selectPatient, finalizeConsultation, printContent, printExamDocuments, removeExam, unsubscribePatients };
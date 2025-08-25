import { _supabase } from './supabase.js';
import { allPeople } from './clientes.js';
import { getCurrentUserProfile } from './auth.js';

let allExams = [];
let selectedExams = []; // Array de objetos {id, name, value, isManual}
let patientsSubscription = null;
let currentUploadedFiles = []; // Array para guardar os arquivos da consulta atual

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
    } catch (error) { // CORREÇÃO: Chaves {} adicionadas aqui
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
    currentUploadedFiles = []; // Limpa a lista de arquivos ao selecionar novo paciente
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

        // Adiciona listener para o input de arquivo e carrega anexos existentes
        document.getElementById('fileUploadInput').onchange = handleFileUpload;
        await loadAttachments(appointmentId);

        await loadPatientHistory(patientData.cpf);
        setupExamSearch();
        await loadProtocols(); // Carrega os protocolos para o médico
    } catch (error) {
        alert('Erro ao selecionar o paciente.');
        console.error(error);
    }
}

async function loadPatientHistory(patientCpf) {
    const historyContainer = document.getElementById('patientHistoryContainer');
    historyContainer.innerHTML = '<p>Carregando histórico...</p>';
    const patientName = document.getElementById('currentPatientName').textContent;

    if (!patientName || patientName === 'Selecione um paciente') {
        historyContainer.innerHTML = '<p>Selecione um paciente para ver o histórico.</p>';
        return;
    }

    try {
        const { data: patientAppointments, error: apptError } = await _supabase.from('appointments')
            .select('id, appointment_date, start_time, professional_id, professionals(name)')
            .eq('patient_name', patientName).order('appointment_date', { ascending: false }).order('start_time', { ascending: false });
        if (apptError) throw apptError;
        if (patientAppointments.length === 0) {
            historyContainer.innerHTML = '<p>Nenhuma consulta anterior registrada.</p>';
            return;
        }

        const appointmentIds = patientAppointments.map(appt => appt.id);
        const { data: history, error: consultError } = await _supabase.from('consultations')
            .select('*').in('appointment_id', appointmentIds).order('created_at', { ascending: false });
        if (consultError) throw consultError;
        
        historyContainer.innerHTML = '';
        if (history.length === 0) {
            historyContainer.innerHTML = '<p>Nenhuma consulta anterior registrada.</p>';
            return;
        }

        history.forEach(consultation => {
            const correspondingAppointment = patientAppointments.find(appt => appt.id === consultation.appointment_id);
            const professionalName = correspondingAppointment?.professionals?.name || 'N/A';
            const consultationDate = correspondingAppointment?.appointment_date ? new Date(correspondingAppointment.appointment_date).toLocaleDateString('pt-BR') : 'N/A';

            // FUNÇÃO ATUALIZADA AQUI
            let attachmentsHtml = '';
            if (consultation.anexos && consultation.anexos.length > 0) {
                attachmentsHtml += '<p><strong>Anexos:</strong></p><ul style="list-style: none; padding-left: 5px;">';
                consultation.anexos.forEach(file => {
                    const { data } = _supabase.storage.from('resultados-exames').getPublicUrl(file.path);
                    attachmentsHtml += `<li><a href="${data.publicUrl}" target="_blank" style="font-size: 13px;"><i class="fas fa-file-alt"></i> ${file.name}</a></li>`;
                });
                attachmentsHtml += '</ul>';
            }

            const item = document.createElement('div');
            item.className = 'historico-item card';
            item.innerHTML = `
                <p><strong>Data:</strong> ${consultationDate}</p>
                <p><strong>Profissional:</strong> ${professionalName}</p>
                <p><strong>Queixa Principal:</strong> ${consultation.queixa_principal || 'N/A'}</p>
                <p><strong>Conduta:</strong> ${consultation.conduta || 'N/A'}</p>
                <p class="details-link" style="color: var(--primary-color); cursor: pointer;">Ver Detalhes</p>
                <div class="full-details" style="display: none; margin-top: 10px; border-top: 1px dashed #eee; padding-top: 10px;">
                    <p><strong>Exame Físico:</strong> ${consultation.exame_fisico || 'N/A'}</p>
                    <p><strong>Laudo:</strong> ${consultation.laudo_texto || 'N/A'}</p>
                    <p><strong>Receituário:</strong> ${consultation.receituario || 'N/A'}</p>
                    <p><strong>Pedidos de Exames:</strong> ${consultation.pedido_exames ? JSON.parse(consultation.pedido_exames).map(e => e.name).join(', ') : 'N/A'}</p>
                    ${attachmentsHtml}
                </div>`;
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
    }
}


function setupExamSearch() {
    const searchInput = document.getElementById('examSearchInput');
    const resultsContainer = document.getElementById('examSearchResults');
    const manualInput = document.getElementById('manualExamInput');
    const addManualBtn = document.getElementById('addManualExamBtn');
    const removeBtn = document.getElementById('removeSelectedExamBtn');

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        resultsContainer.innerHTML = '';
        if (query.length < 2) { resultsContainer.style.display = 'none'; return; }
        const filtered = allExams.filter(exam => exam.name.toLowerCase().includes(query));
        if (filtered.length === 0) { resultsContainer.style.display = 'none'; return; }

        filtered.forEach(exam => {
            const div = document.createElement('div');
            div.dataset.examId = exam.id;
            div.textContent = `${exam.name} - R$ ${exam.value ? exam.value.toFixed(2).replace('.', ',') : '0,00'}`;
            resultsContainer.appendChild(div);
        });
        resultsContainer.style.display = 'block';
    });

    resultsContainer.addEventListener('click', (e) => {
        if (e.target.dataset.examId) {
            handleExamSelection(parseInt(e.target.dataset.examId));
            searchInput.value = '';
            resultsContainer.style.display = 'none';
        }
    });

    addManualBtn.addEventListener('click', () => {
        const examName = manualInput.value.trim();
        if (examName) {
            handleExamSelection(null, examName);
            manualInput.value = '';
        }
    });

    removeBtn.addEventListener('click', () => {
        const select = document.getElementById('selectedExamsList');
        const selectedOptionValue = select.value;
        if (selectedOptionValue) {
            removeExam(selectedOptionValue);
        }
    });
}

function handleExamSelection(examId, manualExamName = null) {
    let examToAdd;
    if (manualExamName) {
        examToAdd = { id: `manual_${Date.now()}`, name: manualExamName, value: 0, isManual: true };
    } else {
        examToAdd = allExams.find(exam => exam.id === examId);
        if (examToAdd) examToAdd.isManual = false;
    }

    if (examToAdd && !selectedExams.some(e => e.name.toLowerCase() === examToAdd.name.toLowerCase())) {
        selectedExams.push(examToAdd);
        renderSelectedExams();
    }
}

function renderSelectedExams() {
    const select = document.getElementById('selectedExamsList');
    if (!select) return;
    select.innerHTML = '';
    selectedExams.forEach(exam => {
        const option = document.createElement('option');
        const examValue = parseFloat(exam.value);
        const formattedValue = isNaN(examValue) ? 'N/A' : `R$ ${examValue.toFixed(2).replace('.', ',')}`;
        option.value = exam.id;
        option.textContent = `${exam.name} (${formattedValue})`;
        select.appendChild(option);
    });
}

function removeExam(examId) {
    selectedExams = selectedExams.filter(exam => exam.id.toString() !== examId.toString());
    renderSelectedExams();
}

async function saveProtocol() {
    if (selectedExams.length === 0) {
        alert('Selecione ao menos um exame para salvar como protocolo.');
        return;
    }
    const protocolName = prompt('Digite um nome para este protocolo:');
    if (!protocolName) return;

    const currentUser = getCurrentUserProfile();
    const { data: professional, error } = await _supabase.from('professionals')
        .select('id').eq('user_id', currentUser.id).single();

    if (error || !professional) {
        alert('Erro: Perfil profissional não encontrado.');
        return;
    }

    const protocolData = {
        protocol_name: protocolName,
        professional_id: professional.id,
        exams: JSON.stringify(selectedExams)
    };

    try {
        const { error } = await _supabase.from('exam_protocols').insert(protocolData);
        if (error) throw error;
        alert('Protocolo salvo com sucesso!');
        await loadProtocols();
    } catch (e) {
        alert('Erro ao salvar protocolo: ' + e.message);
    }
}

async function loadProtocols() {
    const select = document.getElementById('protocolSelect');
    select.innerHTML = '<option value="">Selecione um protocolo</option>';
    
    const currentUser = getCurrentUserProfile();
    const { data: professional, error: profError } = await _supabase.from('professionals')
        .select('id').eq('user_id', currentUser.id).single();
    if (profError || !professional) return;

    try {
        const { data, error } = await _supabase.from('exam_protocols')
            .select('*').eq('professional_id', professional.id);
        if (error) throw error;
        
        data.forEach(protocol => {
            const option = document.createElement('option');
            option.value = protocol.id;
            option.textContent = protocol.protocol_name;
            select.appendChild(option);
        });
        
        select.onchange = async (e) => {
            const protocolId = e.target.value;
            if (protocolId) {
                const selectedProtocol = data.find(p => p.id.toString() === protocolId);
                if (selectedProtocol && selectedProtocol.exams) {
                    selectedExams = JSON.parse(selectedProtocol.exams);
                    renderSelectedExams();
                }
            }
        };
    } catch (e) {
        console.error('Erro ao carregar protocolos:', e);
    }
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const statusDiv = document.getElementById('uploadStatus');
    statusDiv.textContent = `Enviando ${file.name}...`;

    const appointmentId = document.getElementById('currentAppointmentId').value;
    const patientName = document.getElementById('currentPatientName').textContent.replace(/\s+/g, '_');
    const uniqueFileName = `${Date.now()}-${file.name}`;
    const filePath = `${patientName}/${appointmentId}/${uniqueFileName}`;

    try {
        const { error } = await _supabase.storage
            .from('resultados-exames')
            .upload(filePath, file);

        if (error) throw error;

        statusDiv.textContent = 'Upload concluído com sucesso!';
        
        const fileData = { name: file.name, path: filePath };
        currentUploadedFiles.push(fileData);
        
        renderAttachments();

    } catch (error) {
        statusDiv.textContent = `Erro no upload: ${error.message}`;
    } finally {
        event.target.value = '';
    }
}

async function loadAttachments(appointmentId) {
    try {
        const { data, error } = await _supabase
            .from('consultations')
            .select('anexos, laudo_texto')
            .eq('appointment_id', appointmentId)
            .single();

        if (error || !data) {
            currentUploadedFiles = [];
            document.getElementById('laudoTexto').value = '';
        } else {
            currentUploadedFiles = data.anexos || [];
            document.getElementById('laudoTexto').value = data.laudo_texto || '';
        }
        renderAttachments();
    } catch (error) {
        console.error('Erro ao carregar anexos:', error);
    }
}

function renderAttachments() {
    const list = document.getElementById('attachmentsList');
    list.innerHTML = '';

    if (currentUploadedFiles.length === 0) {
        return;
    }

    currentUploadedFiles.forEach(file => {
        const { data } = _supabase.storage
            .from('resultados-exames')
            .getPublicUrl(file.path);

        const li = document.createElement('li');
        li.innerHTML = `<a href="${data.publicUrl}" target="_blank" style="font-size: 14px;"><i class="fas fa-file-alt"></i> ${file.name}</a>`;
        list.appendChild(li);
    });
}

async function finalizeConsultation() {
    const appointmentId = document.getElementById('currentAppointmentId').value;
    const submitButton = document.getElementById('finalizeConsultationBtn');
    const currentUser = getCurrentUserProfile();
    
    const { data: professional, error: profError } = await _supabase.from('professionals')
        .select('id').eq('user_id', currentUser.id).single();
    if (profError || !professional) { alert('Erro: Perfil profissional não encontrado.'); return; }
    
    // FUNÇÃO ATUALIZADA AQUI
    const consultationData = {
        appointment_id: appointmentId,
        professional_id: professional.id,
        queixa_principal: document.getElementById('queixaPrincipal').value,
        exame_fisico: document.getElementById('exameFisico').value,
        conduta: document.getElementById('conduta').value, // Alterado de 'diagnostico' para 'conduta'
        laudo_texto: document.getElementById('laudoTexto').value,
        receituario: document.getElementById('receituario').value,
        pedido_exames: JSON.stringify(selectedExams),
        anexos: currentUploadedFiles
    };
    
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizando...';

    try {
        const { error: consultError } = await _supabase.from('consultations').upsert(consultationData, { onConflict: 'appointment_id' });
        if (consultError) throw consultError;
        
        const { error: apptError } = await _supabase.from('appointments')
            .update({ status: 'finalizado', end_time: new Date().toTimeString().split(' ')[0] }).eq('id', appointmentId);
        if (apptError) throw apptError;
            
        alert('Consulta finalizada e salva com sucesso!');
        
        document.getElementById('consultationWorkspace').style.display = 'none';
        document.getElementById('noPatientSelected').style.display = 'block';
        document.querySelectorAll('#consultationWorkspace textarea').forEach(ta => ta.value = '');
        
        loadPatientsData();
    } catch (error) {
        alert('Erro ao salvar a consulta: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Finalizar Consulta';
    }
}

function printContent(targetId) {
    const contentToPrint = document.getElementById(targetId)?.querySelector('textarea')?.value;
    const patientName = document.getElementById('currentPatientName').textContent;
    const currentUser = getCurrentUserProfile();
    
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
    const currentUser = getCurrentUserProfile();
    
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
        </div>`;

    const totalValue = selectedExams.reduce((sum, exam) => sum + (parseFloat(exam.value) || 0), 0);
    const orcamentoHtml = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h3 style="text-align: center;">Orçamento de Exames</h3>
            <p style="text-align: center;">Bim Benefícios</p>
            <h4 style="margin-top: 30px;">Paciente: ${patientName}</h4>
            <table style="width: 100%; margin-top: 20px; border-collapse: collapse;">
                <thead><tr><th style="text-align: left; border-bottom: 1px solid #ccc; padding: 8px;">Exame</th><th style="text-align: right; border-bottom: 1px solid #ccc; padding: 8px;">Valor</th></tr></thead>
                <tbody>
                    ${selectedExams.map(exam => `<tr><td style="padding: 8px;">${exam.name}</td><td style="text-align: right; padding: 8px;">${exam.isManual ? 'N/A' : `R$ ${(parseFloat(exam.value) || 0).toFixed(2).replace('.', ',')}`}</td></tr>`).join('')}
                </tbody>
                <tfoot>
                    <tr><td colspan="2" style="text-align: right; font-weight: bold; padding: 15px 8px; border-top: 1px solid #ccc;">
                        Valor Total: R$ ${totalValue.toFixed(2).replace('.', ',')}
                    </td></tr>
                </tfoot>
            </table>
        </div>`;

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

document.getElementById('saveProtocolBtn')?.addEventListener('click', saveProtocol);

export { loadPatientsData, selectPatient, finalizeConsultation, printContent, printExamDocuments, removeExam, unsubscribePatients };
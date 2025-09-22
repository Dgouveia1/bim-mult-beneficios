import { _supabase } from './supabase.js';
import { allPeople } from './clientes.js';
import { getCurrentUserProfile } from './auth.js';

// --- ESTADO DA CONSULTA ---
let allExams = [];
let selectedExams = [];
let selectedImageExams = []; // Apenas nomes de exames, sem valores
let patientsSubscription = null;
let currentUploadedFiles = [];
let currentSelectedPatientData = null;

// --- ELEMENTOS DO DOM (CACHE) ---
const consultationWorkspaceDiv = document.getElementById('consultationWorkspace');
const noPatientSelectedDiv = document.getElementById('noPatientSelected');
const patientQueueListContainer = document.getElementById('patientQueueList');

// --- FUNÇÕES DE INICIALIZAÇÃO E CONTROLE ---

function unsubscribePatients() {
    if (patientsSubscription) {
        _supabase.removeChannel(patientsSubscription);
        patientsSubscription = null;
    }
}

async function initializeExamsCache() {
    try {
        const { data, error } = await _supabase.from('exams').select('*');
        if (error) throw error;
        allExams = data;
    } catch (error) {
        console.error("Erro ao carregar cache de exames laboratoriais:", error);
    }
}

// --- LÓGICA DA FILA DE PACIENTES ---

async function loadPatientsData() {
    if (!patientQueueListContainer) return;
    patientQueueListContainer.innerHTML = '<p>Carregando...</p>';
    const currentUser = getCurrentUserProfile();
    if (!currentUser || currentUser.role !== 'medicos') {
        patientQueueListContainer.innerHTML = '<p>Acesso restrito.</p>';
        return;
    }
    const today = new Date().toISOString().split('T')[0];
    try {
        unsubscribePatients();
        const { data: professional } = await _supabase.from('professionals').select('id').eq('user_id', currentUser.id).single();
        if (!professional) throw new Error('Perfil profissional não encontrado.');
        const { data, error } = await _supabase.from('appointments').select('*').eq('appointment_date', today).eq('professional_id', professional.id).in('status', ['chegou', 'em_atendimento']).order('start_time');
        if (error) throw error;
        renderPatientsList(data);
        patientsSubscription = _supabase.channel('public:appointments_medico').on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `professional_id=eq.${professional.id}` }, () => loadPatientsData()).subscribe();
    } catch (error) {
        patientQueueListContainer.innerHTML = `<p style="color:red">${error.message}</p>`;
    }
}

function renderPatientsList(data) {
    if (!patientQueueListContainer) return;
    patientQueueListContainer.innerHTML = data.length === 0 ? '<p>Nenhum paciente na fila.</p>' : '';
    data.forEach(appt => {
        const item = document.createElement('div');
        item.className = 'paciente-espera-item';
        if (appt.status === 'em_atendimento') item.classList.add('active');
        item.dataset.appointmentId = appt.id;
        item.innerHTML = `<span class="nome">${appt.patient_name}</span><span class="horario">${appt.start_time.substring(0, 5)}</span>`;
        patientQueueListContainer.appendChild(item);
    });
}

// --- LÓGICA PRINCIPAL DO ATENDIMENTO ---

async function selectPatient(appointmentId) {
    if (!appointmentId) return;
    
    selectedExams = [];
    selectedImageExams = [];
    currentUploadedFiles = [];
    document.querySelectorAll('#consultationWorkspace textarea').forEach(el => el.value = '');
    renderSelectedExams();
    renderSelectedImageExams();
    renderAttachments();
    
    document.querySelectorAll('.paciente-espera-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`.paciente-espera-item[data-appointment-id="${appointmentId}"]`)?.classList.add('active');
    consultationWorkspaceDiv.style.display = 'flex';
    noPatientSelectedDiv.style.display = 'none';

    try {
        await _supabase.from('appointments').update({ status: 'em_atendimento' }).eq('id', appointmentId);
        const { data: appt, error } = await _supabase.from('appointments').select('*').eq('id', appointmentId).single();
        if (error) throw error;
        
        const nameParts = appt.patient_name.split(' ');
        const firstName = nameParts.shift() || '';
        const lastName = nameParts.join(' ');
        
        const { data: clientData, error: clientError } = await _supabase.from('clients').select('*').eq('nome', firstName).eq('sobrenome', lastName).maybeSingle();
        if (clientError) throw new Error("Ocorreu um erro ao buscar os dados completos do paciente.");

        currentSelectedPatientData = clientData;
        document.getElementById('currentPatientName').textContent = appt.patient_name || 'N/A';
        document.getElementById('currentAppointmentId').value = appointmentId;

        if (currentSelectedPatientData) {
            document.getElementById('dadosNome').textContent = `${currentSelectedPatientData.nome} ${currentSelectedPatientData.sobrenome}`;
            document.getElementById('dadosCPF').textContent = currentSelectedPatientData.cpf || 'N/A';
            document.getElementById('dadosTelefone').textContent = currentSelectedPatientData.telefone || 'N/A';
            document.getElementById('dadosPlano').textContent = currentSelectedPatientData.plano || 'N/A';
        } else {
            document.getElementById('dadosNome').textContent = appt.patient_name;
        }

        await loadPatientHistory(appt.patient_name);
        await loadAttachments(appointmentId);
        await loadProtocols();
        await loadImageProtocols(); // Carrega protocolos de imagem

    } catch (error) {
        alert('Erro ao selecionar o paciente: ' + error.message);
        console.error(error);
    }
}


function showInitialScreen() {
    consultationWorkspaceDiv.style.display = 'none';
    noPatientSelectedDiv.style.display = 'block';
    document.querySelectorAll('.paciente-espera-item').forEach(item => item.classList.remove('active'));
}

async function loadPatientHistory(patientName) {
    const historyContainer = document.getElementById('patientHistoryContainer');
    historyContainer.innerHTML = '<p>Carregando histórico...</p>';
    try {
        const { data: appointments } = await _supabase.from('appointments').select('id, appointment_date, professionals(name)').eq('patient_name', patientName).order('appointment_date', { ascending: false });
        if (!appointments || appointments.length === 0) {
            historyContainer.innerHTML = '<p>Nenhuma consulta anterior registrada.</p>';
            return;
        }
        const appointmentIds = appointments.map(a => a.id);
        const { data: consultations } = await _supabase.from('consultations').select('*').in('appointment_id', appointmentIds).order('created_at', { ascending: false });
        historyContainer.innerHTML = '';
        if (!consultations || consultations.length === 0) {
            historyContainer.innerHTML = '<p>Nenhuma consulta finalizada encontrada.</p>';
            return;
        }
        consultations.forEach(consult => {
            const appointment = appointments.find(a => a.id === consult.appointment_id);
            const item = document.createElement('div');
            item.className = 'historico-item card';
            let attachmentsHtml = '';
            if (consult.anexos && consult.anexos.length > 0) {
                attachmentsHtml += '<p><strong>Anexos:</strong></p><ul>';
                consult.anexos.forEach(file => {
                    const { data } = _supabase.storage.from('resultados-exames').getPublicUrl(file.path);
                    attachmentsHtml += `<li><a href="${data.publicUrl}" target="_blank">${file.name}</a></li>`;
                });
                attachmentsHtml += '</ul>';
            }
            item.innerHTML = `
                <p><strong>Data:</strong> ${new Date(appointment.appointment_date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                <p><strong>Profissional:</strong> ${appointment.professionals?.name || 'N/A'}</p>
                <p><strong>Queixa Principal:</strong> ${consult.queixa_principal || 'N/A'}</p>
                <p class="details-link" style="color: var(--primary-color); cursor: pointer;">Ver Detalhes</p>
                <div class="full-details" style="display: none; margin-top: 10px; border-top: 1px dashed #eee; padding-top: 10px;">
                    <p><strong>Exame Físico:</strong> ${consult.exame_fisico || 'N/A'}</p>
                    <p><strong>Conduta:</strong> ${consult.conduta || 'N/A'}</p>
                    <p><strong>Receituário:</strong> ${consult.receituario || 'N/A'}</p>
                    <p><strong>Pedidos de Exames Lab:</strong> ${consult.pedido_exames && consult.pedido_exames.length > 0 ? consult.pedido_exames.map(e => e.name).join(', ') : 'N/A'}</p>
                    <p><strong>Pedidos de Exames Imagem:</strong> ${consult.pedido_exames_imagem && consult.pedido_exames_imagem.length > 0 ? consult.pedido_exames_imagem.map(e => e.name).join(', ') : 'N/A'}</p>
                    ${attachmentsHtml}
                </div>`;
            item.querySelector('.details-link').addEventListener('click', (e) => {
                const details = e.target.nextElementSibling;
                details.style.display = details.style.display === 'none' ? 'block' : 'none';
                e.target.textContent = details.style.display === 'none' ? 'Ver Detalhes' : 'Esconder Detalhes';
            });
            historyContainer.appendChild(item);
        });
    } catch (error) {
        historyContainer.innerHTML = `<p style="color:red;">Erro ao carregar histórico.</p>`;
    }
}

// --- LÓGICA DE EXAMES, PROTOCOLOS E ANEXOS ---

function setupManualExamEntry() {
    // Exames Laboratoriais
    const addManualBtnLab = document.getElementById('addManualExamBtn');
    addManualBtnLab?.addEventListener('click', () => {
        const manualInput = document.getElementById('manualExamInput');
        const examName = manualInput.value.trim();
        if (examName) {
            handleExamSelection(null, examName);
            manualInput.value = '';
        }
    });

    // Exames de Imagem
    const addManualBtnImg = document.getElementById('addManualExamBtnImg');
    addManualBtnImg?.addEventListener('click', () => {
        const manualInput = document.getElementById('manualExamInputImg');
        const examName = manualInput.value.trim();
        if (examName) {
            handleImageExamSelection(examName);
            manualInput.value = '';
        }
    });
}

function setupExamSearch() {
    const searchInput = document.getElementById('examSearchInput');
    const resultsContainer = document.getElementById('examSearchResults');
    
    searchInput?.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        resultsContainer.innerHTML = '';
        if (query.length < 2) { resultsContainer.style.display = 'none'; return; }
        const filtered = allExams.filter(exam => exam.name.toLowerCase().includes(query));
        filtered.forEach(exam => {
            const div = document.createElement('div');
            div.dataset.examId = exam.id;
            div.textContent = `${exam.name} - R$ ${exam.value ? exam.value.toFixed(2) : '0,00'}`;
            resultsContainer.appendChild(div);
        });
        resultsContainer.style.display = 'block';
    });

    resultsContainer?.addEventListener('click', e => {
        if (e.target.dataset.examId) {
            handleExamSelection(parseInt(e.target.dataset.examId));
            searchInput.value = '';
            resultsContainer.style.display = 'none';
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

function handleImageExamSelection(examName) {
    const examToAdd = { id: `manual_img_${Date.now()}`, name: examName };
    if (examToAdd && !selectedImageExams.some(e => e.name.toLowerCase() === examToAdd.name.toLowerCase())) {
        selectedImageExams.push(examToAdd);
        renderSelectedImageExams();
    }
}

function renderSelectedExams() {
    const select = document.getElementById('selectedExamsList');
    if (!select) return;
    select.innerHTML = '';
    selectedExams.forEach(exam => {
        const option = document.createElement('option');
        option.value = exam.id;
        option.textContent = `${exam.name} (R$ ${parseFloat(exam.value || 0).toFixed(2)})`;
        select.appendChild(option);
    });
}

function renderSelectedImageExams() {
    const select = document.getElementById('selectedExamsListImg');
    if (!select) return;
    select.innerHTML = '';
    selectedImageExams.forEach(exam => {
        const option = document.createElement('option');
        option.value = exam.id;
        option.textContent = exam.name; // Sem valor
        select.appendChild(option);
    });
}

function removeExam(examId) {
    selectedExams = selectedExams.filter(exam => exam.id.toString() !== examId.toString());
    renderSelectedExams();
}

function removeImageExam(examId) {
    selectedImageExams = selectedImageExams.filter(exam => exam.id.toString() !== examId.toString());
    renderSelectedImageExams();
}

async function saveProtocol() {
    if (selectedExams.length === 0) return alert('Selecione exames para salvar.');
    const protocolName = prompt('Digite um nome para o protocolo:');
    if (!protocolName) return;
    const currentUser = getCurrentUserProfile();
    const { data: professional } = await _supabase.from('professionals').select('id').eq('user_id', currentUser.id).single();
    if (!professional) return alert('Erro: Perfil profissional não encontrado.');
    try {
        await _supabase.from('exam_protocols').insert({ protocol_name: protocolName, professional_id: professional.id, exams: selectedExams });
        alert('Protocolo salvo com sucesso!');
        await loadProtocols();
    } catch (e) {
        alert('Erro ao salvar protocolo: ' + e.message);
    }
}

async function saveImageProtocol() {
    if (selectedImageExams.length === 0) return alert('Selecione exames de imagem para salvar no protocolo.');
    const protocolName = prompt('Digite um nome para o protocolo de imagem:');
    if (!protocolName) return;
    const currentUser = getCurrentUserProfile();
    const { data: professional } = await _supabase.from('professionals').select('id').eq('user_id', currentUser.id).single();
    if (!professional) return alert('Erro: Perfil profissional não encontrado.');
    try {
        const { error } = await _supabase.from('image_exam_protocols').insert({ 
            created_at: new Date().toISOString(),
            protocol_name: protocolName, 
            professional_id: professional.id, 
            exams: selectedImageExams 
        });
        if (error) throw error;
        alert('Protocolo de imagem salvo com sucesso!');
        await loadImageProtocols();
    } catch (e) {
        alert('Erro ao salvar protocolo de imagem: ' + e.message);
        console.error(e);
    }
}

async function loadProtocols() {
    const select = document.getElementById('protocolSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione um protocolo</option>';
    const currentUser = getCurrentUserProfile();
    const { data: professional } = await _supabase.from('professionals').select('id').eq('user_id', currentUser.id).single();
    if (!professional) return;
    const { data: protocols } = await _supabase.from('exam_protocols').select('*').eq('professional_id', professional.id);
    if (protocols) {
        protocols.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.protocol_name;
            select.appendChild(option);
        });
        select.onchange = () => {
            const selectedProtocol = protocols.find(p => p.id.toString() === select.value);
            if (selectedProtocol) {
                // CORREÇÃO APLICADA AQUI
                if (typeof selectedProtocol.exams === 'string') {
                    selectedExams = JSON.parse(selectedProtocol.exams);
                } else {
                    selectedExams = selectedProtocol.exams || [];
                }
                renderSelectedExams();
            }
        };
    }
}

async function loadImageProtocols() {
    const select = document.getElementById('protocolSelectImg');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione um protocolo</option>';
    const currentUser = getCurrentUserProfile();
    const { data: professional } = await _supabase.from('professionals').select('id').eq('user_id', currentUser.id).single();
    if (!professional) return;
    const { data: protocols } = await _supabase.from('image_exam_protocols').select('*').eq('professional_id', professional.id);
    if (protocols) {
        protocols.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.protocol_name;
            select.appendChild(option);
        });
        select.onchange = () => {
            const selectedProtocol = protocols.find(p => p.id.toString() === select.value);
            if (selectedProtocol) {
                // CORREÇÃO APLICADA AQUI
                if (typeof selectedProtocol.exams === 'string') {
                    selectedImageExams = JSON.parse(selectedProtocol.exams);
                } else {
                    selectedImageExams = selectedProtocol.exams || [];
                }
                renderSelectedImageExams();
            }
        };
    }
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const statusDiv = document.getElementById('uploadStatus');
    statusDiv.textContent = `Enviando ${file.name}...`;
    const appointmentId = document.getElementById('currentAppointmentId').value;
    const patientName = document.getElementById('currentPatientName').textContent.replace(/\s+/g, '_');
    const filePath = `${patientName}/${appointmentId}/${Date.now()}-${file.name}`;
    try {
        const { error } = await _supabase.storage.from('resultados-exames').upload(filePath, file);
        if (error) throw error;
        statusDiv.textContent = 'Upload concluído!';
        currentUploadedFiles.push({ name: file.name, path: filePath });
        renderAttachments();
    } catch (error) {
        statusDiv.textContent = `Erro no upload: ${error.message}`;
    } finally {
        event.target.value = '';
    }
}

async function loadAttachments(appointmentId) {
    try {
        const { data, error } = await _supabase.from('consultations').select('anexos, laudo_texto').eq('appointment_id', appointmentId).maybeSingle();
        if (error) throw error;

        currentUploadedFiles = data?.anexos || [];
        const laudoInput = document.getElementById('laudoTexto'); 
        if(laudoInput) laudoInput.value = data?.laudo_texto || '';
        renderAttachments();
    } catch (error) {
        console.error('Erro ao carregar anexos:', error);
    }
}

function renderAttachments() {
    const list = document.getElementById('attachmentsList');
    if(!list) return;
    list.innerHTML = '';
    currentUploadedFiles.forEach(file => {
        const { data } = _supabase.storage.from('resultados-exames').getPublicUrl(file.path);
        const li = document.createElement('li');
        li.innerHTML = `<a href="${data.publicUrl}" target="_blank">${file.name}</a>`;
        list.appendChild(li);
    });
}

// --- AÇÕES FINAIS E IMPRESSÃO ---

async function finalizeConsultation() {
    const appointmentId = document.getElementById('currentAppointmentId').value;
    const submitButton = document.getElementById('finalizeConsultationBtn');
    const currentUser = getCurrentUserProfile();
    const { data: professional } = await _supabase.from('professionals').select('id').eq('user_id', currentUser.id).single();
    if (!professional) return alert('Erro: Perfil profissional não encontrado.');
    
    const consultationData = {
        appointment_id: appointmentId,
        professional_id: professional.id,
        queixa_principal: document.getElementById('queixaPrincipal').value,
        exame_fisico: document.getElementById('exameFisico').value,
        conduta: document.getElementById('conduta').value,
        receituario: document.getElementById('receituario').value,
        atestado: document.getElementById('atestadoTexto').value,
        procedimentos: document.getElementById('procedimentoTexto').value,
        autorizacao_cirurgia: document.getElementById('autorizacaoCirurgiaTexto').value,
        cuidados_pos_cirurgia: document.getElementById('cuidadosPosCirurgiaTexto').value,
        orcamento: document.getElementById('orcamentoTexto').value,
        pedido_exames: selectedExams,
        pedido_exames_imagem: selectedImageExams,
        anexos: currentUploadedFiles
    };
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizando...';
    try {
        await _supabase.from('consultations').upsert(consultationData, { onConflict: 'appointment_id' });
        await _supabase.from('appointments').update({ status: 'finalizado' }).eq('id', appointmentId);
        alert('Consulta finalizada e salva com sucesso!');
        showInitialScreen();
        loadPatientsData();
    } catch (error) {
        alert('Erro ao salvar a consulta: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar e Salvar Consulta';
    }
}


function printContent(targetId) {
    const textarea = document.getElementById(targetId + 'Texto');
    const content = textarea ? textarea.value : '';
    if (!content || content.trim() === '') {
        alert('Não há conteúdo para imprimir.');
        return;
    }

    const patientName = document.getElementById('currentPatientName').textContent;
    const currentUser = getCurrentUserProfile();
    let printArea = document.getElementById('print-area');
    if (printArea) printArea.remove();
    printArea = document.createElement('div');
    printArea.id = 'print-area';
    printArea.innerHTML = `<div style="padding: 20px; font-family: Arial, sans-serif;"><h3>${currentUser.full_name || ''}</h3><p>${currentUser.crm || ''}</p><hr/><h4 style="margin-top: 20px;">Paciente: ${patientName}</h4><pre style="white-space: pre-wrap; font-family: inherit;">${content}</pre></div>`;
    document.body.appendChild(printArea);
    window.print();
    document.body.removeChild(printArea);
}


function printExamDocuments() {
    if (selectedExams.length === 0) return alert('Nenhum exame selecionado.');

    const patientName = document.getElementById('currentPatientName').textContent;
    const currentUser = getCurrentUserProfile();
    const totalValue = selectedExams.reduce((sum, exam) => sum + (parseFloat(exam.value) || 0), 0);
    const pedidoHtml = `<div style="font-family: Arial, sans-serif; padding: 20px;"><h3 style="text-align: center;">${currentUser.full_name}</h3><p style="text-align: center;">${currentUser.crm || ''}</p><hr/><h4 style="margin-top: 30px;">Paciente: ${patientName}</h4><h4 style="margin-top: 20px;">Solicitação de Exames:</h4><ul>${selectedExams.map(exam => `<li>${exam.name}</li>`).join('')}</ul></div>`;
    const orcamentoHtml = `<div style="font-family: Arial, sans-serif; padding: 20px;"><h3 style="text-align: center;">Orçamento de Exames</h3><p style="text-align: center;">Bim Benefícios</p><h4 style="margin-top: 30px;">Paciente: ${patientName}</h4><table style="width: 100%; margin-top: 20px; border-collapse: collapse;"><thead><tr><th style="text-align: left; border-bottom: 1px solid #ccc; padding: 8px;">Exame</th><th style="text-align: right; border-bottom: 1px solid #ccc; padding: 8px;">Valor</th></tr></thead><tbody>${selectedExams.map(exam => `<tr><td style="padding: 8px;">${exam.name}</td><td style="text-align: right; padding: 8px;">${exam.isManual ? 'N/A' : `R$ ${(parseFloat(exam.value) || 0).toFixed(2).replace('.', ',')}`}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2" style="text-align: right; font-weight: bold; padding: 15px 8px; border-top: 1px solid #ccc;">Valor Total: R$ ${totalValue.toFixed(2).replace('.', ',')}</td></tr></tfoot></table></div>`;
    
    let printArea = document.getElementById('print-area');
    if (printArea) printArea.remove();
    printArea = document.createElement('div');
    printArea.id = 'print-area';
    printArea.innerHTML = `${pedidoHtml}<div style="page-break-before: always;"></div>${orcamentoHtml}`;
    document.body.appendChild(printArea);
    window.print();
    document.body.removeChild(printArea);
}

function printImageExamDocuments() {
    if (selectedImageExams.length === 0) return alert('Nenhum exame de imagem selecionado para imprimir.');

    const patientName = document.getElementById('currentPatientName').textContent;
    const currentUser = getCurrentUserProfile();
    const pedidoHtml = `<div style="font-family: Arial, sans-serif; padding: 20px;">
        <h3 style="text-align: center;">${currentUser.full_name}</h3>
        <p style="text-align: center;">${currentUser.crm || ''}</p><hr/>
        <h4 style="margin-top: 30px;">Paciente: ${patientName}</h4>
        <h4 style="margin-top: 20px;">Solicitação de Exames de Imagem:</h4>
        <ul>${selectedImageExams.map(exam => `<li>${exam.name}</li>`).join('')}</ul>
    </div>`;
    
    let printArea = document.getElementById('print-area');
    if (printArea) printArea.remove();
    printArea = document.createElement('div');
    printArea.id = 'print-area';
    printArea.innerHTML = pedidoHtml;
    document.body.appendChild(printArea);
    window.print();
    document.body.removeChild(printArea);
}

async function printPrescription() {
    const receituarioTexto = document.getElementById('receituario').value;
    if (!receituarioTexto || receituarioTexto.trim() === '') {
        alert('O campo de receituário está vazio.');
        return;
    }
    if (!currentSelectedPatientData) {
        alert('Nenhum paciente selecionado. Os dados do paciente não foram encontrados.');
        return;
    }

    const currentUser = getCurrentUserProfile();
    const { data: professional, error } = await _supabase.from('professionals').select('name, "CRM"').eq('user_id', currentUser.id).single();

    if (error || !professional) {
        alert('Não foi possível carregar os dados do profissional.');
        return;
    }

    const printHtml = `
        <div class="print-content">
            <div class="patient-details">
                <p><strong>Paciente:</strong> ${currentSelectedPatientData.nome || ''} ${currentSelectedPatientData.sobrenome || ''}</p>
                <p><strong>CPF:</strong> ${currentSelectedPatientData.cpf || 'Não informado'}</p>
                <p><strong>Endereço:</strong> ${currentSelectedPatientData.endereco || 'Não informado'}</p>
            </div>
            <div class="prescription-body">
                <pre>${receituarioTexto}</pre>
            </div>
            <div class="professional-details">
                <p>${professional.name}</p>
                <p>${professional.CRM || 'Não informado'}</p>
            </div>
        </div>
    `;

    const bgImage = new Image();
    bgImage.src = 'imagens/RECEITUARIO.png'; 

    bgImage.onload = () => {
        let printArea = document.getElementById('print-area');
        if (printArea) printArea.remove();
        
        printArea = document.createElement('div');
        printArea.id = 'print-area';
        printArea.innerHTML = printHtml;
        
        document.body.appendChild(printArea);

        setTimeout(() => {
            window.print();
            document.body.removeChild(printArea);
        }, 250);
    };

    bgImage.onerror = () => {
        alert('Erro ao carregar o modelo do receituário. A impressão não pode continuar.');
    };
}


/**
 * NOVA FUNÇÃO DE IMPRESSÃO UNIVERSAL
 * @param {object} options - Opções para o documento.
 * @param {string} options.title - O título do documento (ex: "Receituário").
 * @param {string} options.contentHtml - O conteúdo principal em formato HTML.
 */
function printDocument({ title, contentHtml }) {
    if (!currentSelectedPatientData || !currentProfessionalData) {
        alert('Dados do paciente ou do profissional não carregados. Não é possível imprimir.');
        return;
    }

    // Remove a área de impressão antiga, se existir
    let printArea = document.getElementById('print-area');
    if (printArea) printArea.remove();

    // Cria a nova área de impressão
    printArea = document.createElement('div');
    printArea.id = 'print-area';

    // Monta o HTML com base nos dados e no template
    printArea.innerHTML = `
        <div class="print-container">
            <div class="print-title">${title.toUpperCase()}</div>
            
            <div class="print-patient-data">
                <b>Paciente:</b> ${currentSelectedPatientData.nome_completo || ''}<br>
                <b>CPF:</b> ${currentSelectedPatientData.cpf || 'Não informado'}<br>
                <b>Endereço:</b> ${currentSelectedPatientData.endereco || 'Não informado'}
            </div>

            <div class="print-content-area">
                ${contentHtml}
            </div>

            <div class="print-professional-signature">
                <p>_________________________________________</p>
                <b>${currentProfessionalData.name || ''}</b><br>
                <span>${currentProfessionalData.CRM || ''}</span>
            </div>
        </div>
    `;

    document.body.appendChild(printArea);
    window.print();
    document.body.removeChild(printArea);
}


// --- CONFIGURAÇÃO DOS EVENT LISTENERS ---

function setupPacientesEventListeners() {
    // Navegação e seleção
    patientQueueListContainer?.addEventListener('click', e => {
        const item = e.target.closest('.paciente-espera-item');
        if (item) selectPatient(item.dataset.appointmentId);
    });
    document.getElementById('backToQueueBtn')?.addEventListener('click', showInitialScreen);
    document.querySelector('.atendimento-tab-nav')?.addEventListener('click', e => {
        const tabButton = e.target.closest('.btn-tab');
        if (tabButton) {
            const tabId = tabButton.dataset.tab;
            document.querySelectorAll('.btn-tab, .tab-pane').forEach(el => el.classList.remove('active'));
            tabButton.classList.add('active');
            document.getElementById(`tab${tabId}`).classList.add('active');
        }
    });
    
    // Ações principais
    document.getElementById('finalizeConsultationBtn')?.addEventListener('click', finalizeConsultation);
    document.getElementById('saveProtocolBtn')?.addEventListener('click', saveProtocol);
    document.getElementById('saveProtocolBtnImg')?.addEventListener('click', saveImageProtocol);
    document.getElementById('fileUploadInput').onchange = handleFileUpload;
    
    // BOTÕES DE IMPRESSÃO REFATORADOS
    document.getElementById('imprimirReceitaBtn')?.addEventListener('click', () => {
        const content = document.getElementById('receituario').value;
        if (!content.trim()) return alert('O campo Receituário está vazio.');
        printDocument({ title: 'Receituário', contentHtml: `<pre>${content}</pre>` });
    });
    
    document.getElementById('imprimirAtestadoBtn')?.addEventListener('click', () => {
        const content = document.getElementById('atestadoTexto').value;
        if (!content.trim()) return alert('O campo Atestado está vazio.');
        printDocument({ title: 'Atestado Médico', contentHtml: `<pre>${content}</pre>` });
    });
    
    document.getElementById('imprimirAutorizacaoCirurgiaBtn')?.addEventListener('click', () => {
        const content = document.getElementById('autorizacaoCirurgiaTexto').value;
        if (!content.trim()) return alert('O campo de Autorização está vazio.');
        printDocument({ title: 'Autorização de Cirurgia', contentHtml: `<pre>${content}</pre>` });
    });
    
    document.getElementById('imprimirCuidadosPosCirurgiaBtn')?.addEventListener('click', () => {
        const content = document.getElementById('cuidadosPosCirurgiaTexto').value;
        if (!content.trim()) return alert('O campo de Cuidados está vazio.');
        printDocument({ title: 'Cuidados Pós-Cirúrgicos', contentHtml: `<pre>${content}</pre>` });
    });

    document.getElementById('imprimirOrcamentoBtn')?.addEventListener('click', () => {
        const content = document.getElementById('orcamentoTexto').value;
        if (!content.trim()) return alert('O campo Orçamento está vazio.');
        printDocument({ title: 'Orçamento', contentHtml: `<pre>${content}</pre>` });
    });

    document.getElementById('printExamsBtn')?.addEventListener('click', () => {
        if (selectedExams.length === 0) return alert('Nenhum exame laboratorial selecionado.');
        const examListHtml = `<ul>${selectedExams.map(exam => `<li>${exam.name}</li>`).join('')}</ul>`;
        printDocument({ title: 'Pedido de Exames Laboratoriais', contentHtml: examListHtml });
    });
    
    document.getElementById('printExamsBtnImg')?.addEventListener('click', () => {
        if (selectedImageExams.length === 0) return alert('Nenhum exame de imagem selecionado.');
        const examListHtml = `<ul>${selectedImageExams.map(exam => `<li>${exam.name}</li>`).join('')}</ul>`;
        printDocument({ title: 'Pedido de Exames de Imagem', contentHtml: examListHtml });
    });

    // Botões de remover
    document.getElementById('removeSelectedExamBtn')?.addEventListener('click', () => {
        const selectedId = document.getElementById('selectedExamsList').value;
        if (selectedId) removeExam(selectedId);
    });
    document.getElementById('removeSelectedExamBtnImg')?.addEventListener('click', () => {
        const selectedId = document.getElementById('selectedExamsListImg').value;
        if (selectedId) removeImageExam(selectedId);
    });

    setupExamSearch();
    setupManualExamEntry();
}

// --- INICIALIZAÇÃO ---
initializeExamsCache();
setupPacientesEventListeners();

// --- EXPORTAÇÕES ---
export { 
    loadPatientsData, 
    selectPatient, 
    finalizeConsultation, 
    printContent, 
    printExamDocuments, 
    printImageExamDocuments,
    removeExam, 
    unsubscribePatients 
};
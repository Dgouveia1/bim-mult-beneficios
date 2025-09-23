import { _supabase } from './supabase.js';
import { getCurrentUserProfile } from './auth.js';

// --- ESTADO DA CONSULTA ---
let allExams = [];
let selectedExams = [];
let selectedImageExams = [];
let patientsSubscription = null;
let currentUploadedFiles = [];
let currentSelectedPatientData = null;
let currentProfessionalData = null;

// --- ELEMENTOS DO DOM (CACHE) ---
const consultationWorkspaceDiv = document.getElementById('consultationWorkspace');
const noPatientSelectedDiv = document.getElementById('noPatientSelected');
const patientQueueListContainer = document.getElementById('patientQueueList');

// --- FUNÇÃO AUXILIAR PARA CONVERTER IMAGEM PARA BASE64 ---
function imageToBase64(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL);
        };
        img.onerror = reject;
        img.src = url;
    });
}


// --- FUNÇÕES DE INICIALIZAÇÃO E CONTROLE ---
async function fetchProfessionalData() {
    const user = getCurrentUserProfile();
    if (!user) return null;
    try {
        const { data, error } = await _supabase.from('professionals').select('name, "CRM"').eq('user_id', user.id).single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error("Erro ao buscar dados do profissional:", error);
        return null;
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
function unsubscribePatients() {
    if (patientsSubscription) {
        _supabase.removeChannel(patientsSubscription);
        patientsSubscription = null;
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

// --- PRÉ-VISUALIZAÇÃO DE EXAMES (NOVO) ---
function updateLabExamPreview() {
    const container = document.getElementById('labExamPreviewContainer');
    if (!container) return;

    let contentHTML = '';
    if (selectedExams.length > 0) {
        contentHTML = `<ul>${selectedExams.map(exam => `<li>${exam.name.split(' (R$')[0]}</li>`).join('')}</ul>`;
    } else {
        contentHTML = '<p style="text-align:center; color: #888;">Nenhum exame selecionado.</p>';
    }
    
    container.innerHTML = `
        <div class="printable-title">PEDIDO DE EXAMES LABORATORIAIS</div>
        <div class="printable-patient-data" id="labPreviewPatientData"></div>
        <div class="printable-content-input" style="height: auto; max-height: 50%; overflow-y: auto;">${contentHTML}</div>
        <div class="printable-professional-signature" id="labPreviewProfData"></div>
    `;

    // Re-popula os dados do paciente e profissional
    const patientDataEl = document.getElementById('labPreviewPatientData');
    const profDataEl = document.getElementById('labPreviewProfData');
    if (patientDataEl && profDataEl) {
        const patientName = currentSelectedPatientData?.nome ? `${currentSelectedPatientData.nome} ${currentSelectedPatientData.sobrenome || ''}` : document.getElementById('currentPatientName').textContent;
        const patientCPF = currentSelectedPatientData?.cpf || 'Não informado';
        const patientAddress = currentSelectedPatientData?.endereco || 'Não informado';
        const profName = currentProfessionalData?.name || 'Profissional não identificado';
        const profCRM = currentProfessionalData?.CRM || '';
        
        patientDataEl.innerHTML = `<b>Paciente:</b> ${patientName}<br><b>CPF:</b> ${patientCPF}<br><b>Endereço:</b> ${patientAddress}`;
        profDataEl.innerHTML = `<p>_________________________________________</p><b>${profName}</b><br><span>${profCRM}</span>`;
    }
}

function updateImageExamPreview() {
    const container = document.getElementById('imgExamPreviewContainer');
    if (!container) return;

    let contentHTML = '';
    if (selectedImageExams.length > 0) {
        contentHTML = `<ul>${selectedImageExams.map(exam => `<li>${exam.name}</li>`).join('')}</ul>`;
    } else {
        contentHTML = '<p style="text-align:center; color: #888;">Nenhum exame selecionado.</p>';
    }

    container.innerHTML = `
        <div class="printable-title">PEDIDO DE EXAMES DE IMAGEM</div>
        <div class="printable-patient-data" id="imgPreviewPatientData"></div>
        <div class="printable-content-input" style="height: auto; max-height: 50%; overflow-y: auto;">${contentHTML}</div>
        <div class="printable-professional-signature" id="imgPreviewProfData"></div>
    `;

    // Re-popula os dados do paciente e profissional
    const patientDataEl = document.getElementById('imgPreviewPatientData');
    const profDataEl = document.getElementById('imgPreviewProfData');
    if (patientDataEl && profDataEl) {
        const patientName = currentSelectedPatientData?.nome ? `${currentSelectedPatientData.nome} ${currentSelectedPatientData.sobrenome || ''}` : document.getElementById('currentPatientName').textContent;
        const patientCPF = currentSelectedPatientData?.cpf || 'Não informado';
        const patientAddress = currentSelectedPatientData?.endereco || 'Não informado';
        const profName = currentProfessionalData?.name || 'Profissional não identificado';
        const profCRM = currentProfessionalData?.CRM || '';
        
        patientDataEl.innerHTML = `<b>Paciente:</b> ${patientName}<br><b>CPF:</b> ${patientCPF}<br><b>Endereço:</b> ${patientAddress}`;
        profDataEl.innerHTML = `<p>_________________________________________</p><b>${profName}</b><br><span>${profCRM}</span>`;
    }
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
        
        const { data: clientData, error: clientError } = await _supabase.from('clients').select('*').ilike('nome', `%${appt.patient_name.split(' ')[0]}%`).maybeSingle();
        if (clientError) console.warn("Não foi possível buscar todos os dados do paciente.");

        currentSelectedPatientData = clientData;
        currentProfessionalData = await fetchProfessionalData();

        document.getElementById('currentPatientName').textContent = appt.patient_name || 'N/A';
        document.getElementById('currentAppointmentId').value = appointmentId;
        
        if (currentSelectedPatientData) {
            document.getElementById('dadosNome').textContent = `${currentSelectedPatientData.nome} ${currentSelectedPatientData.sobrenome || ''}`;
            document.getElementById('dadosCPF').textContent = currentSelectedPatientData.cpf || 'N/A';
            document.getElementById('dadosTelefone').textContent = currentSelectedPatientData.telefone || 'N/A';
            document.getElementById('dadosPlano').textContent = currentSelectedPatientData.plano || 'N/A';
            document.getElementById('dadosEndereco').textContent = currentSelectedPatientData.endereco || 'N/A';
        }

        populatePrintableFields();
        // Renderiza as pré-visualizações iniciais
        updateLabExamPreview();
        updateImageExamPreview();

        await loadPatientHistory(appt.patient_name);
        await loadAttachments(appointmentId);
        await loadProtocols();
        await loadImageProtocols();

    } catch (error) {
        alert('Erro ao selecionar o paciente: ' + error.message);
    }
}

function populatePrintableFields() {
    const patientName = currentSelectedPatientData?.nome ? `${currentSelectedPatientData.nome} ${currentSelectedPatientData.sobrenome || ''}` : document.getElementById('currentPatientName').textContent;
    const patientCPF = currentSelectedPatientData?.cpf || 'Não informado';
    const patientAddress = currentSelectedPatientData?.endereco || 'Não informado';
    const profName = currentProfessionalData?.name || 'Profissional não identificado';
    const profCRM = currentProfessionalData?.CRM || '';
    
    const patientDataHTML = `<b>Paciente:</b> ${patientName}<br><b>CPF:</b> ${patientCPF}<br><b>Endereço:</b> ${patientAddress}`;
    const profDataHTML = `<p>_________________________________________</p><b>${profName}</b><br><span>${profCRM}</span>`;

    const areas = ['receita', 'atestado', 'posCirurgia', 'orcamento'];
    areas.forEach(area => {
        const patientDataEl = document.getElementById(`${area}PatientData`);
        const profDataEl = document.getElementById(`${area}ProfData`);
        if(patientDataEl) patientDataEl.innerHTML = patientDataHTML;
        if(profDataEl) profDataEl.innerHTML = profDataHTML;
    });
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
                    <p><strong>Pedidos de Exames Lab:</strong> ${consult.pedido_exames && JSON.parse(consult.pedido_exames).length > 0 ? JSON.parse(consult.pedido_exames).map(e => e.name).join(', ') : 'N/A'}</p>
                    <p><strong>Pedidos de Exames Imagem:</strong> ${consult.pedido_exames_imagem && JSON.parse(consult.pedido_exames_imagem).length > 0 ? JSON.parse(consult.pedido_exames_imagem).map(e => e.name).join(', ') : 'N/A'}</p>
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

function setupManualExamEntry() {
    const addManualBtnLab = document.getElementById('addManualExamBtn');
    addManualBtnLab?.addEventListener('click', () => {
        const manualInput = document.getElementById('manualExamInput');
        const examName = manualInput.value.trim();
        if (examName) {
            handleExamSelection(null, examName);
            manualInput.value = '';
        }
    });
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
    updateLabExamPreview();
}
function renderSelectedImageExams() {
    const select = document.getElementById('selectedExamsListImg');
    if (!select) return;
    select.innerHTML = '';
    selectedImageExams.forEach(exam => {
        const option = document.createElement('option');
        option.value = exam.id;
        option.textContent = exam.name;
        select.appendChild(option);
    });
    updateImageExamPreview();
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
        await _supabase.from('exam_protocols').insert({ protocol_name: protocolName, professional_id: professional.id, exams: JSON.stringify(selectedExams) });
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
            exams: JSON.stringify(selectedImageExams)
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
                selectedExams = JSON.parse(selectedProtocol.exams || '[]');
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
                selectedImageExams = JSON.parse(selectedProtocol.exams || '[]');
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
        const { data, error } = await _supabase.from('consultations').select('anexos').eq('appointment_id', appointmentId).maybeSingle();
        if (error) throw error;
        currentUploadedFiles = data?.anexos || [];
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

// --- AÇÕES FINAIS E GERAÇÃO DE PDF ---
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
        cuidados_pos_cirurgia: document.getElementById('cuidadosPosCirurgiaTexto').value,
        orcamento: document.getElementById('orcamentoTexto').value,
        pedido_exames: JSON.stringify(selectedExams),
        pedido_exames_imagem: JSON.stringify(selectedImageExams),
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

async function triggerPrintFromElement(button) {
    if (!button) return;
    const type = button.dataset.type || button.getAttribute('data-type');
    const contentId = button.dataset.contentId || button.getAttribute('data-content-id');
    const contentElement = document.getElementById(contentId);

    if (!type || !contentElement) {
        return alert('Não foi possível identificar o documento para gerar o PDF.');
    }

    let contentText = '';
    let isContentEmpty = true;
    let examList = [];

    if (contentElement.tagName === 'SELECT') {
        const selectedOptions = Array.from(contentElement.options);
        if (selectedOptions.length > 0) {
            if (type === 'Pedido de Exames Laboratoriais') {
                examList = selectedExams;
            }
            contentText = selectedOptions.map(opt => `- ${opt.textContent.split(' (R$')[0]}`).join('\n');
            isContentEmpty = false;
        }
    } else { 
        if (contentElement.value && contentElement.value.trim() !== '') {
            contentText = contentElement.value;
            isContentEmpty = false;
        }
    }

    if (isContentEmpty) {
        return alert(`O campo "${type}" está vazio.`);
    }

    const originalButtonText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgData = await imageToBase64('imagens/padra_impressao.png');

        // --- CORREÇÃO APLICADA AQUI: USA DADOS DO OBJETO EM MEMÓRIA ---
        let patientName = currentSelectedPatientData ? `${currentSelectedPatientData.nome} ${currentSelectedPatientData.sobrenome || ''}`.trim() : '';
        let patientCPF = currentSelectedPatientData?.cpf || '';
        let patientAddress = currentSelectedPatientData?.endereco || '';

        // 2. Se a fonte primária falhou, usa os dados da tela como fallback (plano B)
        if (!patientName) {
            patientName = document.getElementById('currentPatientName')?.textContent || 'N/A';
        }
        // Os detalhes de CPF e Endereço estão na aba "Dados do Paciente"
        if (!patientCPF) {
            patientCPF = document.getElementById('dadosCPF')?.textContent || 'N/A';
        }
        if (!patientAddress) {
            patientAddress = document.getElementById('dadosEndereco')?.textContent || 'N/A';
        }

        const profName = currentProfessionalData?.name || 'Profissional não identificado';
        const profCRM = currentProfessionalData?.CRM || '';
        
        const createPageLayout = (title) => {
            pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(16);
            pdf.setTextColor('#3a506b');
            pdf.text(title.toUpperCase(), 105, 45, { align: 'center' });
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);
            pdf.setTextColor('#333333');
            pdf.text(`Paciente: ${patientName}`, 20, 65);
            pdf.text(`CPF: ${patientCPF}`, 20, 72);
            pdf.text(`Endereço: ${patientAddress}`, 20, 79);
            pdf.text('_________________________________________', 105, 250, { align: 'center' });
            pdf.setFont('helvetica', 'bold');
            pdf.text(profName, 105, 257, { align: 'center' });
            pdf.setFont('helvetica', 'normal');
            pdf.text(profCRM, 105, 264, { align: 'center' });
        };

        if (type === 'Pedido de Exames Laboratoriais' && examList.length > 0) {
            createPageLayout('PEDIDO DE EXAMES LABORATORIAIS');
            const examNamesText = examList.map(exam => `- ${exam.name}`).join('\n');
            const textLines = pdf.splitTextToSize(examNamesText, 170);
            pdf.text(textLines, 20, 95);

            // --- CÓDIGO CORRIGIDO PARA O ORÇAMENTO DETALHADO ---
            pdf.addPage();
            createPageLayout('ORÇAMENTO');
            
            let totalValue = 0;
            let yPosition = 95; // Posição inicial para a lista de exames no PDF
            
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);
            
            examList.forEach(exam => {
                const examValue = parseFloat(exam.value || 0);
                totalValue += examValue;
                const examText = `- ${exam.name}`;
                
                // Adiciona o texto do exame ao PDF
                pdf.text(examText, 20, yPosition);
                yPosition += 7; // Incrementa a posição vertical para a próxima linha
            });

            // Adiciona uma linha separadora antes do total
            pdf.line(20, yPosition, 190, yPosition); 
            yPosition += 10;

            // Escreve o VALOR TOTAL
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text(`VALOR TOTAL: R$ ${totalValue.toFixed(2).replace('.', ',')}`, 105, yPosition, { align: 'center' });

        } else {
            createPageLayout(type);
            const textLines = pdf.splitTextToSize(contentText, 170);
            pdf.text(textLines, 20, 95);
        }

        const fileName = `${type.replace(/\s+/g, '_').toLowerCase()}_${patientName.replace(/\s+/g, '_')}.pdf`;
        pdf.save(fileName);

    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        alert('Ocorreu um erro ao gerar o PDF. Verifique o console para mais detalhes.');
    } finally {
        button.disabled = false;
        button.innerHTML = originalButtonText;
    }
}


function setupPacientesEventListeners() {

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
    
    document.getElementById('finalizeConsultationBtn')?.addEventListener('click', finalizeConsultation);
    document.getElementById('saveProtocolBtn')?.addEventListener('click', saveProtocol);
    document.getElementById('saveProtocolBtnImg')?.addEventListener('click', saveImageProtocol);
    if(document.getElementById('fileUploadInput')) {
        document.getElementById('fileUploadInput').onchange = handleFileUpload;
    }
    
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
    unsubscribePatients,
    removeExam,
    triggerPrintFromElement
};
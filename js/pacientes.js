import { _supabase } from './supabase.js';
import { getCurrentUserProfile } from './auth.js';
import { logAction } from './logger.js';
import { showToast, calculateAge, showPrompt, showConfirm } from './utils.js';

// --- ESTADO DA CONSULTA ---
let allExams = [];
let selectedExams = [];
let selectedImageExams = [];
let patientsSubscription = null;
let currentUploadedFiles = [];
let currentSelectedPatientData = null;
let currentProfessionalData = null; // Esta variável guardará os dados do profissional logado
let currentAppointmentData = null; // Armazena dados completos do agendamento atual
let currentViewMode = null; // 'medico' or 'odonto'

// --- ELEMENTOS DO DOM (CACHE) ---
const consultationWorkspaceDiv = document.getElementById('consultationWorkspace');
const noPatientSelectedDiv = document.getElementById('noPatientSelected');
const patientQueueListContainer = document.getElementById('patientQueueList');
const pauseBtn = document.getElementById('pauseConsultationBtn');

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
        // ALTERAÇÃO: Adicionado 'id' ao select
        const { data, error } = await _supabase.from('professionals').select('id, name, "CRM"').eq('user_id', user.id).single();
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
async function loadPatientsData(viewMode = null) {
    if (viewMode) {
        currentViewMode = viewMode;
    } else if (!currentViewMode) {
        const currentUserProfile = getCurrentUserProfile();
        if (currentUserProfile?.role === 'dentista') {
            currentViewMode = 'odonto';
        } else {
            currentViewMode = 'medico';
        }
    }

    if (!patientQueueListContainer) return;
    patientQueueListContainer.innerHTML = '<p>Carregando...</p>';
    const currentUser = getCurrentUserProfile();
    if (!currentUser || (currentUser.role !== 'medicos' && currentUser.role !== 'dentista' && currentUser.role !== 'superadmin' && currentUser.role !== 'admin' && currentUser.role !== 'auxiliar')) {
        patientQueueListContainer.innerHTML = '<p>Acesso restrito.</p>';
        return;
    }
    const today = new Date().toISOString().split('T')[0];
    try {
        unsubscribePatients();
        let query = _supabase
            .from('appointments')
            .select('*')
            .eq('appointment_date', today)
            .in('status', ['chegou', 'em_atendimento', 'pausado'])
            .order('start_time');

        let filterString = '';

        if (currentUser.role !== 'superadmin' && currentUser.role !== 'admin' && currentUser.role !== 'auxiliar') {
            const { data: professional } = await _supabase.from('professionals').select('id').eq('user_id', currentUser.id).single();
            if (!professional) throw new Error('Perfil profissional não encontrado.');
            query = query.eq('professional_id', professional.id);
            filterString = `professional_id=eq.${professional.id}`;
        } else if (currentUser.role === 'auxiliar') {
            // Auxiliar vê apenas a fila dos profissionais vinculados a ele
            if (currentUser.assisted_professionals && currentUser.assisted_professionals.length > 0) {
                 const { data: professionals } = await _supabase.from('professionals').select('id').in('user_id', currentUser.assisted_professionals);
                 if (professionals && professionals.length > 0) {
                     const profIds = professionals.map(p => p.id);
                     query = query.in('professional_id', profIds);
                     filterString = `professional_id=in.(${profIds.join(',')})`;
                 } else {
                     query = query.eq('professional_id', '00000000-0000-0000-0000-000000000000'); // ID inválido para não retornar nada
                 }
            } else {
                query = query.eq('professional_id', '00000000-0000-0000-0000-000000000000');
            }
        }

        const { data, error } = await query;

        if (error) throw error;
        renderPatientsList(data);

        const channelOpts = { event: '*', schema: 'public', table: 'appointments' };
        if (filterString) channelOpts.filter = filterString;

        patientsSubscription = _supabase.channel('public:appointments_medico').on('postgres_changes', channelOpts, () => loadPatientsData()).subscribe();
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

        // Marca visualmente se está ativo ou pausado
        if (appt.status === 'em_atendimento') item.classList.add('active');
        if (appt.status === 'pausado') item.style.borderLeft = '4px solid #ff9800'; // Indicador laranja para pausado

        item.dataset.appointmentId = appt.id;

        let statusIcon = '';
        if (appt.status === 'pausado') statusIcon = ' <i class="fas fa-pause" style="font-size: 0.8em; color: #ff9800;"></i>';

        item.innerHTML = `<span class="nome">${appt.patient_name}${statusIcon}</span><span class="horario">${appt.start_time.substring(0, 5)}</span>`;
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

    // Reinicia o estado da consulta
    selectedExams = [];
    selectedImageExams = [];
    currentUploadedFiles = [];
    document.querySelectorAll('#consultationWorkspace textarea, #consultationWorkspace input').forEach(el => el.value = '');
    renderSelectedExams();
    renderSelectedImageExams();
    renderAttachments();

    // Atualiza a UI para mostrar a área de trabalho da consulta
    document.querySelectorAll('.paciente-espera-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`.paciente-espera-item[data-appointment-id="${appointmentId}"]`)?.classList.add('active');
    consultationWorkspaceDiv.style.display = 'flex';
    noPatientSelectedDiv.style.display = 'none';

    // Setup tabs by mode
    const tabAtendimentoMedicoBtn = document.querySelector('.btn-tab[data-tab="AtendimentoMedico"]');
    const tabAtendimentoOdontoBtn = document.querySelector('.btn-tab[data-tab="AtendimentoOdonto"]');

    if (tabAtendimentoMedicoBtn && tabAtendimentoOdontoBtn) {
        tabAtendimentoMedicoBtn.style.display = 'inline-block';
        tabAtendimentoOdontoBtn.style.display = 'inline-block';

        // Remove active from all tabs
        document.querySelectorAll('.btn-tab, .tab-pane').forEach(el => el.classList.remove('active'));

        if (currentViewMode === 'odonto') {
            tabAtendimentoMedicoBtn.style.display = 'none';
            tabAtendimentoOdontoBtn.classList.add('active');
            document.getElementById('tabAtendimentoOdonto').classList.add('active');
        } else if (currentViewMode === 'medico') {
            tabAtendimentoOdontoBtn.style.display = 'none';
            tabAtendimentoMedicoBtn.classList.add('active');
            document.getElementById('tabAtendimentoMedico').classList.add('active');
        } else {
            tabAtendimentoMedicoBtn.classList.add('active');
            document.getElementById('tabAtendimentoMedico').classList.add('active');
        }
    }

    try {
        // Busca os detalhes do agendamento primeiro para verificar status
        const { data: appt, error: apptError } = await _supabase.from('appointments').select('*, client_id').eq('id', appointmentId).single();
        if (apptError) throw apptError;

        currentAppointmentData = appt; // Armazena para uso global (pausa/resume)

        // Se não estiver pausado e nem finalizado, marca como em atendimento (início)
        // Se estiver 'chegou', muda para 'em_atendimento' e grava start_time se não houver
        if (appt.status === 'chegou') {
            const startTime = new Date().toISOString();
            const { error: updateError } = await _supabase.from('appointments').update({
                status: 'em_atendimento',
                consultation_start_time: startTime
            }).eq('id', appointmentId);

            if (updateError) throw updateError;

            await logAction('START_CONSULTATION', {
                appointmentId: appointmentId,
                startTime: startTime
            });
            appt.status = 'em_atendimento'; // Atualiza localmente
        }

        // --- CONFIGURAÇÃO DO BOTÃO DE PAUSA ---
        if (pauseBtn) {
            if (appt.status === 'pausado') {
                pauseBtn.innerHTML = '<i class="fas fa-play"></i> Retomar Atendimento';
                pauseBtn.className = 'btn btn-primary'; // Azul para retomar
            } else {
                pauseBtn.innerHTML = '<i class="fas fa-pause"></i> Pausar Atendimento';
                pauseBtn.className = 'btn btn-warning'; // Laranja para pausar
            }
        }

        let patientDetails = null;

        // Se o agendamento tem um ID de cliente, busca os dados completos
        if (appt.client_id) {
            const { data: titular, error: clientError } = await _supabase.from('clients').select('*, dependents(*)').eq('id', appt.client_id).single();
            if (clientError) throw clientError;

            // Verifica se o paciente é o titular
            if (`${titular.nome} ${titular.sobrenome || ''}`.trim() === appt.patient_name) {
                patientDetails = titular;
            } else { // Procura nos dependentes
                const dependent = titular.dependents.find(d => `${d.nome} ${d.sobrenome || ''}`.trim() === appt.patient_name);
                if (dependent) {
                    // Adiciona informações do plano do titular aos dados do dependente
                    patientDetails = { ...dependent, plano: titular.plano, status: titular.status, endereco: titular.endereco };
                }
            }
        }

        // Armazena os dados do paciente e do profissional
        currentSelectedPatientData = patientDetails;
        currentProfessionalData = await fetchProfessionalData(); // Agora contém o 'id'

        // Preenche os cabeçalhos e a aba de dados do paciente
        document.getElementById('currentPatientName').textContent = appt.patient_name || 'N/A';
        document.getElementById('currentAppointmentId').value = appointmentId;

        if (currentSelectedPatientData) {
            document.getElementById('dadosNome').textContent = `${currentSelectedPatientData.nome} ${currentSelectedPatientData.sobrenome || ''}`;
            document.getElementById('dadosCPF').textContent = currentSelectedPatientData.cpf || 'N/A';
            document.getElementById('dadosTelefone').textContent = currentSelectedPatientData.telefone || 'N/A';
            document.getElementById('dadosPlano').textContent = currentSelectedPatientData.plano || 'N/A';
            document.getElementById('dadosEndereco').textContent = currentSelectedPatientData.endereco || 'N/A';
            document.getElementById('currentPatientPlan').textContent = currentSelectedPatientData.plano || 'N/A';

            // --- CÁLCULO E EXIBIÇÃO DA IDADE ---
            const age = calculateAge(currentSelectedPatientData.data_nascimento);
            document.getElementById('currentPatientAge').textContent = age;
        } else {
            document.getElementById('currentPatientAge').textContent = '-';
        }

        // Preenche os campos de impressão e atualiza as pré-visualizações
        populatePrintableFields();
        updateLabExamPreview();
        updateImageExamPreview();

        // Carrega o histórico de consultas e anexos
        await loadPatientHistory(appt.patient_name);
        await loadPatientExams(appt.patient_name, currentSelectedPatientData?.cpf);
        await loadAttachments(appointmentId);
        await loadProtocols();
        await loadImageProtocols();
        await loadOdontogramaData(appt.patient_name);

    } catch (error) {
        showToast('Erro ao selecionar o paciente: ' + error.message);
        console.error(error);
    }
}

// --- FUNÇÃO PARA PAUSAR/RETOMAR ---
async function togglePause() {
    if (!currentAppointmentData) return;

    pauseBtn.disabled = true;
    const isPausing = currentAppointmentData.status === 'em_atendimento';

    try {
        const now = new Date().toISOString();
        let pauseHistory = currentAppointmentData.pause_history || [];

        // Garante que é um array (caso venha null do banco)
        if (!Array.isArray(pauseHistory)) pauseHistory = [];

        let newStatus;

        if (isPausing) {
            // INICIAR PAUSA
            newStatus = 'pausado';
            // Adiciona novo registro de pausa aberta
            pauseHistory.push({ start: now, end: null });

            pauseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Pausando...';
        } else {
            // RETOMAR ATENDIMENTO
            newStatus = 'em_atendimento';
            // Fecha a última pausa aberta
            const lastPauseIndex = pauseHistory.findLastIndex(p => p.end === null);
            if (lastPauseIndex !== -1) {
                pauseHistory[lastPauseIndex].end = now;
            } else {
                console.warn('Tentativa de retomar sem pausa aberta encontrada. Criando registro de consistência.');
            }

            pauseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Retomando...';
        }

        // Atualiza no Supabase
        const { data, error } = await _supabase
            .from('appointments')
            .update({
                status: newStatus,
                pause_history: pauseHistory
            })
            .eq('id', currentAppointmentData.id)
            .select()
            .single();

        if (error) throw error;

        // Atualiza estado local
        currentAppointmentData = data;

        // Atualiza UI
        if (newStatus === 'pausado') {
            pauseBtn.innerHTML = '<i class="fas fa-play"></i> Retomar Atendimento';
            pauseBtn.className = 'btn btn-primary';
            showToast('Atendimento pausado.');
        } else {
            pauseBtn.innerHTML = '<i class="fas fa-pause"></i> Pausar Atendimento';
            pauseBtn.className = 'btn btn-warning';
            showToast('Atendimento retomado.');
        }

        // Atualiza a fila lateral para refletir a mudança de status/cor
        loadPatientsData();

    } catch (error) {
        console.error('Erro ao alternar pausa:', error);
        showToast('Erro ao processar pausa: ' + error.message, 'error');
        // Restaura botão em caso de erro
        if (currentAppointmentData.status === 'pausado') {
            pauseBtn.innerHTML = '<i class="fas fa-play"></i> Retomar Atendimento';
        } else {
            pauseBtn.innerHTML = '<i class="fas fa-pause"></i> Pausar Atendimento';
        }
    } finally {
        pauseBtn.disabled = false;
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
        if (patientDataEl) patientDataEl.innerHTML = patientDataHTML;
        if (profDataEl) profDataEl.innerHTML = profDataHTML;
    });
}
function showInitialScreen() {
    consultationWorkspaceDiv.style.display = 'none';
    noPatientSelectedDiv.style.display = 'block';
    document.querySelectorAll('.paciente-espera-item').forEach(item => item.classList.remove('active'));
}

async function loadPatientExams(nome, cpf) {
    const examesContainer = document.getElementById('pacienteHistoricoExamesContainer');
    if (!examesContainer) return;

    examesContainer.innerHTML = '<p>Carregando exames...</p>';
    try {
        let query = _supabase.from('pedidos_exames').select('*').order('created_at', { ascending: false });
        // Simular a busca parecida com o loadPatientHistory ou busca direta
        if (cpf && cpf !== 'N/A') {
            const cleanCpf = cpf.replace(/\D/g, ''); // só numeros
            query = query.or(`paciente_cpf.ilike.%${cleanCpf}%,paciente_nome.ilike.%${nome.split(' ')[0]}%`);
        } else {
            query = query.ilike('paciente_nome', `%${nome.split(' ')[0]}%`);
        }

        const { data: exames, error } = await query;
        if (error) throw error;

        examesContainer.innerHTML = '';
        if (!exames || exames.length === 0) {
            examesContainer.innerHTML = '<p>Nenhum pedido de exame registrado anterior.</p>';
            return;
        }

        exames.forEach(exame => {
            const date = new Date(exame.created_at).toLocaleDateString('pt-BR');
            let resultHtml = 'Nenhum resultado anexado';

            let anexos = [];
            try { anexos = typeof exame.anexos_resultados === 'string' ? JSON.parse(exame.anexos_resultados) : exame.anexos_resultados; } catch (e) { }

            if (anexos && anexos.length > 0) {
                resultHtml = '<ul style="list-style: none; padding-left: 0;">';
                anexos.forEach(anexo => {
                    const { data } = _supabase.storage.from('resultados-exames').getPublicUrl(anexo.path);
                    resultHtml += `<li><a href="${data.publicUrl}" target="_blank" style="font-size: 13px;"><i class="fas fa-file-download"></i> ${anexo.name}</a></li>`;
                });
                resultHtml += '</ul>';
            }

            const item = document.createElement('div');
            item.className = 'historico-item card';
            item.innerHTML = `
                <p><strong>Data do Pedido:</strong> ${date}</p>
                <p><strong>Médico Solicitante:</strong> ${exame.medico_nome}</p>
                <p><strong>Status:</strong> <span style="color: ${exame.status === 'Concluído' ? 'green' : 'orange'}">${exame.status}</span></p>
                <hr>
                <p><strong>Resultados:</strong></p>
                ${resultHtml}
            `;
            examesContainer.appendChild(item);
        });
    } catch (error) {
        console.error('Erro ao buscar historico de exames:', error);
        examesContainer.innerHTML = '<p style="color:red;">Erro ao carregar histórico de exames.</p>';
    }
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

        let allowedProfIds = [];
        const currentUser = getCurrentUserProfile();
        if (currentUser && currentUser.role === 'auxiliar' && currentUser.assisted_professionals && currentUser.assisted_professionals.length > 0) {
             const { data: profs } = await _supabase.from('professionals').select('id').in('user_id', currentUser.assisted_professionals);
             if (profs) allowedProfIds = profs.map(p => p.id);
        }

        consultations.forEach(consult => {
            const appointment = appointments.find(a => a.id === consult.appointment_id);
            const professionalName = appointment?.professionals?.name || 'N/A';
            const consultationDate = new Date(appointment.appointment_date + 'T00:00:00').toLocaleDateString('pt-BR');

            let attachmentsHtml = '';
            if (consult.anexos && consult.anexos.length > 0) {
                attachmentsHtml += '<p><strong>Anexos:</strong></p><ul>';
                consult.anexos.forEach(file => {
                    const { data } = _supabase.storage.from('resultados-exames').getPublicUrl(file.path);
                    attachmentsHtml += `<li><a href="${data.publicUrl}" target="_blank">${file.name}</a></li>`;
                });
                attachmentsHtml += '</ul>';
            }

            // --- INÍCIO DA LÓGICA DE SEGURANÇA ---
            const creatorProfId = consult.professional_id;
            const viewerProfId = currentProfessionalData?.id; // ID do profissional logado
            const isSuperAdmin = currentUser && currentUser.role === 'superadmin';
            const isAuxiliar = currentUser && currentUser.role === 'auxiliar';
            const isOwner = isSuperAdmin || (creatorProfId === viewerProfId) || (isAuxiliar && allowedProfIds.includes(creatorProfId));

            const item = document.createElement('div');
            item.className = 'historico-item card';

            let sensitiveDetailsHtml = '';

            if (isOwner) {
                // 1. O usuário é o dono, mostra tudo
                sensitiveDetailsHtml = `
                    <p><strong>Queixa Principal:</strong> ${consult.queixa_principal || 'N/A'}</p>
                    <p class="details-link" style="color: var(--primary-color); cursor: pointer;">Ver Detalhes</p>
                    <div class="full-details" style="display: none; margin-top: 10px; border-top: 1px dashed #eee; padding-top: 10px;">
                        <p><strong>Exame Físico:</strong> ${consult.exame_fisico || 'N/A'}</p>
                        <p><strong>Conduta:</strong> ${consult.conduta || 'N/A'}</p>
                        <p><strong>Receituário:</strong> ${consult.receituario || 'N/A'}</p>
                        <p><strong>Pedidos de Exames Lab:</strong> ${consult.pedido_exames && consult.pedido_exames !== '[]' ? JSON.parse(consult.pedido_exames).map(e => e.name).join(', ') : 'N/A'}</p>
                        <p><strong>Pedidos de Exames Imagem:</strong> ${consult.pedido_exames_imagem && consult.pedido_exames_imagem !== '[]' ? JSON.parse(consult.pedido_exames_imagem).map(e => e.name).join(', ') : 'N/A'}</p>
                        ${attachmentsHtml}
                    </div>
                `;
            } else {
                // 2. O usuário NÃO é o dono, mostra mensagem de restrição
                sensitiveDetailsHtml = `
                    <p><strong>Queixa Principal:</strong> <span style="color: var(--gray-medium); font-style: italic;">[Informação Protegida]</span></p>
                    <p style="color: var(--cancelled-color); font-style: italic; background-color: #ffebee; padding: 10px; border-radius: 5px; margin-top: 10px;">
                        <i class="fas fa-lock"></i> O acesso aos detalhes completos (exame físico, conduta, receitas, etc.) é restrito ao profissional que realizou a consulta.
                    </p>
                `;
            }

            // Renderiza o item com a informação (completa ou restrita)
            item.innerHTML = `
                <p><strong>Data:</strong> ${consultationDate}</p>
                <p><strong>Profissional:</strong> ${professionalName}</p>
                ${sensitiveDetailsHtml}
            `;

            // Adiciona o listener de clique SOMENTE se o link "Ver Detalhes" existir
            const detailsLink = item.querySelector('.details-link');
            if (detailsLink) {
                detailsLink.addEventListener('click', (e) => {
                    const details = e.target.nextElementSibling;
                    details.style.display = details.style.display === 'none' ? 'block' : 'none';
                    e.target.textContent = details.style.display === 'none' ? 'Ver Detalhes' : 'Esconder Detalhes';
                });
            }
            // --- FIM DA LÓGICA DE SEGURANÇA ---

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
    if (selectedExams.length === 0) return showToast('Selecione exames para salvar.');
    const protocolName = await showPrompt('Digite um nome para o protocolo:');
    if (!protocolName) return;
    const currentUser = getCurrentUserProfile();
    const { data: professional } = await _supabase.from('professionals').select('id').eq('user_id', currentUser.id).single();
    if (!professional) return showToast('Erro: Perfil profissional não encontrado.');
    try {
        await _supabase.from('exam_protocols').insert({ protocol_name: protocolName, professional_id: professional.id, exams: JSON.stringify(selectedExams) });
        showToast('Protocolo salvo com sucesso!');
        await loadProtocols();
    } catch (e) {
        showToast('Erro ao salvar protocolo: ' + e.message);
    }
}
async function saveImageProtocol() {
    if (selectedImageExams.length === 0) return showToast('Selecione exames de imagem para salvar no protocolo.');
    const protocolName = await showPrompt('Digite um nome para o protocolo de imagem:');
    if (!protocolName) return;
    const currentUser = getCurrentUserProfile();
    const { data: professional } = await _supabase.from('professionals').select('id').eq('user_id', currentUser.id).single();
    if (!professional) return showToast('Erro: Perfil profissional não encontrado.');
    try {
        const { error } = await _supabase.from('image_exam_protocols').insert({
            created_at: new Date().toISOString(),
            protocol_name: protocolName,
            professional_id: professional.id,
            exams: JSON.stringify(selectedImageExams)
        });
        if (error) throw error;
        showToast('Protocolo de imagem salvo com sucesso!');
        await loadImageProtocols();
    } catch (e) {
        showToast('Erro ao salvar protocolo de imagem: ' + e.message);
        console.error(e);
    }
}

async function renameProtocol() {
    const protocolId = document.getElementById('protocolSelect').value;
    if (!protocolId) return showToast('Selecione um protocolo para renomear.');
    const select = document.getElementById('protocolSelect');
    const selectedText = select.options[select.selectedIndex].text;
    const newName = await showPrompt('Digite o novo nome para o protocolo:', selectedText);
    if (!newName || newName.trim() === '' || newName === selectedText) return;
    try {
        const { error } = await _supabase.from('exam_protocols').update({ protocol_name: newName }).eq('id', protocolId);
        if (error) throw error;
        showToast('Protocolo renomeado com sucesso!');
        await loadProtocols();
        setTimeout(() => { document.getElementById('protocolSelect').value = protocolId; }, 100);
    } catch (e) {
        showToast('Erro ao renomear protocolo: ' + e.message);
        console.error(e);
    }
}

async function deleteProtocol() {
    const protocolId = document.getElementById('protocolSelect').value;
    if (!protocolId) return showToast('Selecione um protocolo para excluir.');
    if (!await showConfirm('Tem certeza que deseja excluir este protocolo?')) return;
    try {
        const { error } = await _supabase.from('exam_protocols').delete().eq('id', protocolId);
        if (error) throw error;
        showToast('Protocolo excluído com sucesso!');
        document.getElementById('protocolSelect').value = '';
        selectedExams = [];
        renderSelectedExams();
        await loadProtocols();
    } catch (e) {
        showToast('Erro ao excluir protocolo: ' + e.message);
        console.error(e);
    }
}

async function renameImageProtocol() {
    const protocolId = document.getElementById('protocolSelectImg').value;
    if (!protocolId) return showToast('Selecione um protocolo de imagem para renomear.');
    const select = document.getElementById('protocolSelectImg');
    const selectedText = select.options[select.selectedIndex].text;
    const newName = await showPrompt('Digite o novo nome para o protocolo:', selectedText);
    if (!newName || newName.trim() === '' || newName === selectedText) return;
    try {
        const { error } = await _supabase.from('image_exam_protocols').update({ protocol_name: newName }).eq('id', protocolId);
        if (error) throw error;
        showToast('Protocolo renomeado com sucesso!');
        await loadImageProtocols();
        setTimeout(() => { document.getElementById('protocolSelectImg').value = protocolId; }, 100);
    } catch (e) {
        showToast('Erro ao renomear protocolo: ' + e.message);
        console.error(e);
    }
}

async function deleteImageProtocol() {
    const protocolId = document.getElementById('protocolSelectImg').value;
    if (!protocolId) return showToast('Selecione um protocolo de imagem para excluir.');
    if (!await showConfirm('Tem certeza que deseja excluir este protocolo?')) return;
    try {
        const { error } = await _supabase.from('image_exam_protocols').delete().eq('id', protocolId);
        if (error) throw error;
        showToast('Protocolo de imagem excluído com sucesso!');
        document.getElementById('protocolSelectImg').value = '';
        selectedImageExams = [];
        renderSelectedImageExams();
        await loadImageProtocols();
    } catch (e) {
        showToast('Erro ao excluir protocolo: ' + e.message);
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
        // Clear all options EXCEPT the first one (Selecione um protocolo)
        while (select.options.length > 1) {
            select.remove(1);
        }
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
        // Clear all options EXCEPT the first one (Selecione um protocolo)
        while (select.options.length > 1) {
            select.remove(1);
        }
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
    if (!list) return;
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
    const { data: professional } = await _supabase.from('professionals').select('id, name').eq('user_id', currentUser.id).single();
    if (!professional) return showToast('Erro: Perfil profissional não encontrado.');

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finalizando...';
    try {
        // Se houver uma pausa aberta, fecha ela agora para contar o tempo corretamente
        const now = new Date().toISOString();
        if (currentAppointmentData && currentAppointmentData.status === 'pausado') {
            const pauseHistory = currentAppointmentData.pause_history || [];
            const lastPauseIndex = pauseHistory.findLastIndex(p => p.end === null);
            if (lastPauseIndex !== -1) {
                pauseHistory[lastPauseIndex].end = now;
                // Atualiza o histórico de pausas antes de finalizar
                await _supabase.from('appointments').update({ pause_history: pauseHistory }).eq('id', appointmentId);
            }
        }

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

        // Salva os dados da consulta
        await _supabase.from('consultations').upsert(consultationData, { onConflict: 'appointment_id' });

        // Registra os pedidos de exames na nova tabela
        if (selectedExams.length > 0 || selectedImageExams.length > 0) {
            const pacienteNome = document.getElementById('currentPatientName').textContent;
            const pacienteCpf = document.getElementById('dadosCPF')?.textContent || 'Não informado';

            const { data: novoPedido, error: errorPedido } = await _supabase.from('pedidos_exames').insert({
                paciente_nome: pacienteNome,
                paciente_cpf: pacienteCpf,
                medico_nome: professional.name || currentUser.full_name || 'Médico',
                profissional_id: professional.id,
                atendimento_id: appointmentId,
                exames_lab_solicitados: JSON.stringify(selectedExams),
                exames_img_solicitados: JSON.stringify(selectedImageExams),
                status: 'Pendente'
            }).select().single();

            if (errorPedido) throw errorPedido;

            const valorTotalExames = selectedExams.reduce((total, exam) => total + parseFloat(exam.value || 0), 0);

            if (valorTotalExames > 0) {
                const patientId = currentAppointmentData && currentAppointmentData.client_id ? currentAppointmentData.client_id : null;

                const transacaoExame = {
                    paciente_id: patientId,
                    paciente_nome: pacienteNome,
                    atendimento_id: appointmentId,
                    pedido_exame_id: novoPedido.id,
                    tipo_cobranca: 'EXAME',
                    valor_original: valorTotalExames,
                    desconto_aplicado: 0,
                    valor_final: valorTotalExames,
                    status_pagamento: 'PENDENTE',
                    created_by: currentUser.id
                };

                const { error: txError } = await _supabase.from('transacoes_financeiras').insert(transacaoExame);
                if (txError) console.error("Erro ao gerar transação pro exame:", txError);
            }
        }

        await _supabase.from('appointments').update({
            status: 'finalizado',
            consultation_end_time: now
        }).eq('id', appointmentId);

        await logAction('FINISH_CONSULTATION', {
            appointmentId: appointmentId,
            endTime: now
        });

        showToast('Consulta finalizada e salva com sucesso!');
        showInitialScreen();
        loadPatientsData();
    } catch (error) {
        showToast('Erro ao salvar a consulta: ' + error.message);
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
        return showToast('Não foi possível identificar o documento para gerar o PDF.');
    }

    let contentText = '';
    let isContentEmpty = true;
    let examList = [];

    if (contentElement.tagName === 'SELECT') {
        const selectedOptions = Array.from(contentElement.options);
        if (selectedOptions.length > 0) {
            if (type === 'Pedido de Exames Laboratoriais') {
                examList = selectedExams;
            } else if (type === 'Pedido de Exames de Imagem') {
                examList = selectedImageExams; // Usar a lista correta
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
        return showToast(`O campo "${type}" está vazio.`);
    }

    const originalButtonText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgData = await imageToBase64('imagens/padra_impressao.png');

        let patientName = currentSelectedPatientData ? `${currentSelectedPatientData.nome} ${currentSelectedPatientData.sobrenome || ''}`.trim() : '';
        let patientCPF = currentSelectedPatientData?.cpf || '';
        let patientAddress = currentSelectedPatientData?.endereco || '';

        if (!patientName) {
            patientName = document.getElementById('currentPatientName')?.textContent || 'N/A';
        }
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
            // --- PÁGINA 1: PEDIDO DE EXAMES ---
            createPageLayout('PEDIDO DE EXAMES LABORATORIAIS');
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);

            const itemsPerColumn = 28;
            if (examList.length > itemsPerColumn) {
                // Duas colunas
                const midPoint = Math.ceil(examList.length / 2);
                const firstColumn = examList.slice(0, midPoint).map(exam => `- ${exam.name}`).join('\n');
                const secondColumn = examList.slice(midPoint).map(exam => `- ${exam.name}`).join('\n');

                pdf.text(pdf.splitTextToSize(firstColumn, 85), 20, 95);
                pdf.text(pdf.splitTextToSize(secondColumn, 85), 110, 95);

            } else {
                // Uma coluna
                const examNamesText = examList.map(exam => `- ${exam.name}`).join('\n');
                const textLines = pdf.splitTextToSize(examNamesText, 170);
                pdf.text(textLines, 20, 95);
            }

            // --- PÁGINA 2+: ORÇAMENTO ---
            pdf.addPage();
            createPageLayout('ORÇAMENTO');

            let totalValue = 0;
            let yPosition = 95;
            const pageHeight = pdf.internal.pageSize.height;
            const bottomMargin = 60; // Espaço para o rodapé

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);

            examList.forEach((exam, index) => {
                // Adiciona nova página se o conteúdo for longo
                if (yPosition > pageHeight - bottomMargin) {
                    pdf.addPage();
                    createPageLayout('ORÇAMENTO (continuação)');
                    yPosition = 95; // Reseta a posição Y na nova página
                }

                const examValue = parseFloat(exam.value || 0);
                totalValue += examValue;
                const examText = `- ${exam.name}`; // ALTERADO: Não exibe mais o valor individual

                pdf.text(examText, 20, yPosition);
                yPosition += 7; // Incrementa a posição vertical para a próxima linha
            });

            // Adiciona o valor total no final
            if (yPosition > pageHeight - bottomMargin) {
                pdf.addPage();
                createPageLayout('ORÇAMENTO (continuação)');
                yPosition = 95;
            }
            pdf.line(20, yPosition, 190, yPosition);
            yPosition += 10;

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.text(`VALOR TOTAL: R$ ${totalValue.toFixed(2).replace('.', ',')}`, 105, yPosition, { align: 'center' });


        } else if (type === 'Pedido de Exames de Imagem' && examList.length > 0) {
            // Lógica para Exames de Imagem (sem orçamento)
            createPageLayout('PEDIDO DE EXAMES DE IMAGEM');
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);
            const itemsPerColumn = 28;
            if (examList.length > itemsPerColumn) {
                const midPoint = Math.ceil(examList.length / 2);
                const firstColumn = examList.slice(0, midPoint).map(exam => `- ${exam.name}`).join('\n');
                const secondColumn = examList.slice(midPoint).map(exam => `- ${exam.name}`).join('\n');
                pdf.text(pdf.splitTextToSize(firstColumn, 85), 20, 95);
                pdf.text(pdf.splitTextToSize(secondColumn, 85), 110, 95);
            } else {
                const examNamesText = examList.map(exam => `- ${exam.name}`).join('\n');
                const textLines = pdf.splitTextToSize(examNamesText, 170);
                pdf.text(textLines, 20, 95);
            }

        } else {
            // Lógica para outros documentos (Receita, Atestado, etc.)
            createPageLayout(type);
            const textLines = pdf.splitTextToSize(contentText, 170);
            pdf.text(textLines, 20, 95);
        }

        const fileName = `${type.replace(/\s+/g, '_').toLowerCase()}_${patientName.replace(/\s+/g, '_')}.pdf`;
        pdf.save(fileName);

    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        showToast('Ocorreu um erro ao gerar o PDF. Verifique o console para mais detalhes.');
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

    // Listener removido daqui pois está sendo tratado globalmente no main.js
    document.getElementById('pauseConsultationBtn')?.addEventListener('click', togglePause); // Listener do botão de pausa
    document.getElementById('saveProtocolBtn')?.addEventListener('click', saveProtocol);
    document.getElementById('renameProtocolBtn')?.addEventListener('click', renameProtocol);
    document.getElementById('deleteProtocolBtn')?.addEventListener('click', deleteProtocol);
    document.getElementById('saveProtocolBtnImg')?.addEventListener('click', saveImageProtocol);
    document.getElementById('renameProtocolBtnImg')?.addEventListener('click', renameImageProtocol);
    document.getElementById('deleteProtocolBtnImg')?.addEventListener('click', deleteImageProtocol);
    if (document.getElementById('fileUploadInput')) {
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

    // Adiciona ouvintes para os botões de impressão
    document.querySelectorAll('.print-btn').forEach(button => {
        button.addEventListener('click', () => triggerPrintFromElement(button));
    });

    setupExamSearch();
    setupManualExamEntry();
    initOdontograma();
}

// --- INICIALIZAÇÃO ---
initializeExamsCache();
setupPacientesEventListeners();

// --- LÓGICA DO ODONTOGRAMA ---
function createToothSvg(num, x, y, size = 30) {
    const centerSize = size / 3;
    const m = (size - centerSize) / 2;

    let g = `<g class="dente-group" transform="translate(${x}, ${y})" data-dente="${num}">`;
    g += `<text class="dente-text" x="${size / 2}" y="${size + 15}" text-anchor="middle">${num}</text>`;
    g += `<polygon class="dente-face estado-higido" data-dente="${num}" data-face="Topo" points="0,0 ${size},0 ${size - m},${m} ${m},${m}"></polygon>`;
    g += `<polygon class="dente-face estado-higido" data-dente="${num}" data-face="Base" points="0,${size} ${m},${size - m} ${size - m},${size - m} ${size},${size}"></polygon>`;
    g += `<polygon class="dente-face estado-higido" data-dente="${num}" data-face="Esquerda" points="0,0 ${m},${m} ${m},${size - m} 0,${size}"></polygon>`;
    g += `<polygon class="dente-face estado-higido" data-dente="${num}" data-face="Direita" points="${size},0 ${size},${size} ${size - m},${size - m} ${size - m},${m}"></polygon>`;
    g += `<polygon class="dente-face estado-higido" data-dente="${num}" data-face="Centro" points="${m},${m} ${size - m},${m} ${size - m},${size - m} ${m},${size - m}"></polygon>`;
    g += `</g>`;
    return g;
}

function initOdontograma() {
    const container = document.getElementById('odontogramaContainer');
    if (!container) return;

    let svgHTML = '<svg viewBox="0 0 800 300" style="width:100%; height:100%; min-width:600px;">';

    let startX = 20;
    let yTop = 20;
    const teethR = [18, 17, 16, 15, 14, 13, 12, 11];
    const teethL = [21, 22, 23, 24, 25, 26, 27, 28];

    teethR.forEach((num, index) => {
        svgHTML += createToothSvg(num, startX + (index * 45), yTop);
    });

    let startXRight = startX + (8 * 45) + 30;
    teethL.forEach((num, index) => {
        svgHTML += createToothSvg(num, startXRight + (index * 45), yTop);
    });

    let yBottom = yTop + 130;
    const teethR_inf = [48, 47, 46, 45, 44, 43, 42, 41];
    const teethL_inf = [31, 32, 33, 34, 35, 36, 37, 38];

    teethR_inf.forEach((num, index) => {
        svgHTML += createToothSvg(num, startX + (index * 45), yBottom);
    });

    teethL_inf.forEach((num, index) => {
        svgHTML += createToothSvg(num, startXRight + (index * 45), yBottom);
    });

    let yDecTop = yTop + 65;
    let startXDec = startX + (3 * 45) + 20;
    const teethR_dec = [55, 54, 53, 52, 51];
    const teethL_dec = [61, 62, 63, 64, 65];

    teethR_dec.forEach((num, index) => {
        svgHTML += createToothSvg(num, startXDec + (index * 35), yDecTop, 25);
    });

    let startXRightDec = startXRight;
    teethL_dec.forEach((num, index) => {
        svgHTML += createToothSvg(num, startXRightDec + (index * 35), yDecTop, 25);
    });

    svgHTML += '</svg>';
    container.innerHTML = svgHTML;

    document.querySelectorAll('.dente-face').forEach(face => {
        face.addEventListener('click', handleFaceClick);
    });

    document.getElementById('btnSalvarOdonto')?.addEventListener('click', saveOdontogramaData);
    document.getElementById('btnExcluirOdonto')?.addEventListener('click', deleteOdontogramaData);
}

function handleFaceClick(event) {
    document.querySelectorAll('.dente-face').forEach(f => f.classList.remove('selected'));
    const faceElement = event.target;
    faceElement.classList.add('selected');

    const denteNum = faceElement.getAttribute('data-dente');
    const faceNome = faceElement.getAttribute('data-face');

    const promptEl = document.getElementById('odontogramaPrompt');
    if (promptEl) promptEl.style.display = 'none';

    const formEl = document.getElementById('odontogramaForm');
    if (formEl) formEl.style.display = 'block';

    document.getElementById('odontoFaceSelecionada').value = `Dente: ${denteNum} - Face: ${faceNome}`;
    document.getElementById('odontoDenteNum').value = denteNum;
    document.getElementById('odontoFaceNome').value = faceNome;

    const currentStateClass = Array.from(faceElement.classList).find(c => c.startsWith('estado-'));
    let estado = '';

    const btnExcluir = document.getElementById('btnExcluirOdonto');
    if (currentStateClass && currentStateClass !== 'estado-higido') {
        estado = currentStateClass.replace('estado-', '');
        if (btnExcluir) btnExcluir.style.display = 'inline-block';
    } else {
        if (btnExcluir) btnExcluir.style.display = 'none';
    }

    const select = document.getElementById('odontoEstadoClinico');
    if (select) {
        let found = false;
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === estado) {
                select.selectedIndex = i;
                found = true;
                break;
            }
        }
        if (!found) select.selectedIndex = 0;
    }
    document.getElementById('odontoObservacoes').value = faceElement.getAttribute('data-obs') || '';
}

async function saveOdontogramaData() {
    const denteNum = document.getElementById('odontoDenteNum').value;
    const faceNome = document.getElementById('odontoFaceNome').value;
    const estado = document.getElementById('odontoEstadoClinico').value;
    const observacoes = document.getElementById('odontoObservacoes').value;

    if (!estado) return showToast('Selecione um estado clínico.');
    if (!currentAppointmentData) return showToast('Nenhum atendimento ativo.');

    const patientName = document.getElementById('currentPatientName').textContent;
    const btn = document.getElementById('btnSalvarOdonto');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        const { data: existing, error: searchErr } = await _supabase
            .from('odontograma_registros')
            .select('id')
            .eq('paciente_nome', patientName)
            .eq('dente_numero', denteNum)
            .eq('face', faceNome)
            .maybeSingle();

        if (searchErr) throw searchErr;

        if (existing) {
            await _supabase.from('odontograma_registros').update({
                estado_clinico: estado,
                observacoes: observacoes,
                profissional_id: currentProfessionalData?.id,
                atendimento_id: currentAppointmentData.id,
                created_at: new Date().toISOString()
            }).eq('id', existing.id);
        } else {
            await _supabase.from('odontograma_registros').insert({
                paciente_nome: patientName,
                dente_numero: denteNum,
                face: faceNome,
                estado_clinico: estado,
                observacoes: observacoes,
                profissional_id: currentProfessionalData?.id,
                atendimento_id: currentAppointmentData.id
            });
        }

        const faceElement = document.querySelector(`.dente-face[data-dente="${denteNum}"][data-face="${faceNome}"]`);
        if (faceElement) {
            // Remove previous classes
            faceElement.className.baseVal = faceElement.className.baseVal.replace(/estado-[a-zA-Z]+/g, '').trim() + ` dente-face estado-${estado}`;
            faceElement.setAttribute('data-obs', observacoes);
        }

        showToast('Registro do odontograma salvo!');
        document.getElementById('btnExcluirOdonto').style.display = 'inline-block';

    } catch (error) {
        showToast('Erro ao salvar no odontograma: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar Registro';
    }
}

async function deleteOdontogramaData() {
    const denteNum = document.getElementById('odontoDenteNum').value;
    const faceNome = document.getElementById('odontoFaceNome').value;
    const patientName = document.getElementById('currentPatientName').textContent;
    const btn = document.getElementById('btnExcluirOdonto');
    btn.disabled = true;

    try {
        await _supabase.from('odontograma_registros')
            .delete()
            .eq('paciente_nome', patientName)
            .eq('dente_numero', denteNum)
            .eq('face', faceNome);

        const faceElement = document.querySelector(`.dente-face[data-dente="${denteNum}"][data-face="${faceNome}"]`);
        if (faceElement) {
            faceElement.className.baseVal = faceElement.className.baseVal.replace(/estado-[a-zA-Z]+/g, '').trim() + ' dente-face estado-higido';
            faceElement.removeAttribute('data-obs');
        }

        document.getElementById('odontoEstadoClinico').value = '';
        document.getElementById('odontoObservacoes').value = '';
        btn.style.display = 'none';

        showToast('Registro removido do odontograma.');
    } catch (error) {
        showToast('Erro ao remover: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function loadOdontogramaData(patientName) {
    if (!patientName) return;

    document.querySelectorAll('.dente-face').forEach(f => {
        if (f.className.baseVal) {
            f.className.baseVal = f.className.baseVal.replace(/estado-[a-zA-Z]+/g, '').trim() + ' dente-face estado-higido';
        }
        f.removeAttribute('data-obs');
    });

    const promptEl = document.getElementById('odontogramaPrompt');
    if (promptEl) promptEl.style.display = 'block';

    const formEl = document.getElementById('odontogramaForm');
    if (formEl) formEl.style.display = 'none';

    try {
        const { data, error } = await _supabase
            .from('odontograma_registros')
            .select('*')
            .eq('paciente_nome', patientName);

        if (error) throw error;

        if (data && data.length > 0) {
            data.forEach(reg => {
                const face = document.querySelector(`.dente-face[data-dente="${reg.dente_numero}"][data-face="${reg.face}"]`);
                if (face) {
                    face.className.baseVal = face.className.baseVal.replace(/estado-[a-zA-Z]+/g, '').trim() + ` dente-face estado-${reg.estado_clinico}`;
                    face.setAttribute('data-obs', reg.observacoes || '');
                }
            });
        }
    } catch (error) {
        console.error('Erro ao carregar odontograma:', error);
    }
}

// --- EXPORTAÇÕES ---
export {
    loadPatientsData,
    selectPatient,
    finalizeConsultation,
    unsubscribePatients,
    removeExam,
    triggerPrintFromElement
};
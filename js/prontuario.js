import { _supabase } from './supabase.js';
import { getCurrentUserProfile } from './auth.js'; // Importa a função de autenticação

const historyContainer = document.getElementById('prontuarioHistoryContainer');
const patientInfoContainer = document.getElementById('prontuarioPatientInfo');

let currentViewOnlyProfessionalId = null; // Guarda o ID do profissional (da tabela 'professionals') que está logado

// Função auxiliar para processar listas de exames com segurança
// Evita o erro de tentar fazer JSON.parse em algo que já é objeto (comum em campos JSONB do Supabase)
function safeFormatExams(data) {
    if (!data) return 'N/A';
    
    let list = [];
    
    // Se já for um objeto/array (comportamento padrão do Supabase para colunas JSONB)
    if (typeof data === 'object') {
        list = data;
    } 
    // Se for uma string (comportamento para colunas TEXT ou legado)
    else if (typeof data === 'string') {
        if (data === '[]') return 'N/A';
        try {
            list = JSON.parse(data);
        } catch (e) {
            console.warn('Erro ao processar JSON de exames:', e);
            return 'Erro nos dados';
        }
    }

    if (!Array.isArray(list) || list.length === 0) return 'N/A';
    
    // Mapeia e junta os nomes
    return list.map(e => e.name).join(', ');
}

// Nova função para buscar o ID do profissional logado
async function fetchCurrentProfessionalId() {
    try {
        const user = getCurrentUserProfile();
        if (!user) {
             console.log("[PRONTUÁRIO] Usuário não logado.");
             return;
        }

        // Apenas 'medicos' podem ter um ID de profissional
        if (user.role === 'medicos') {
            const { data: professional, error } = await _supabase
                .from('professionals')
                .select('id')
                .eq('user_id', user.id)
                .single();
            
            if (error) throw error;
            
            if (professional) {
                currentViewOnlyProfessionalId = professional.id;
                console.log(`[PRONTUÁRIO] Visualizador identificado. ID Profissional: ${currentViewOnlyProfessionalId}`);
            }
        } else {
            console.log(`[PRONTUÁRIO] Usuário logado é ${user.role}, não é um profissional de saúde. Acesso será restrito.`);
        }
    } catch (error) {
        console.error("[PRONTUÁRIO] Erro ao buscar ID do profissional logado:", error);
    }
}


// Esta função recebe um objeto de paciente e carrega seu histórico
async function loadHistoryForPatient(patientData) {
    try {
        console.log('[PRONTUÁRIO] Carregando histórico para:', patientData);

        // Mostra as informações do paciente selecionado
        document.getElementById('prontuarioPatientName').textContent = patientData.nome;
        document.getElementById('prontuarioPatientCPF').textContent = patientData.cpf || 'N/A';
        document.getElementById('prontuarioPatientPlan').textContent = patientData.plano || 'N/A';
        patientInfoContainer.style.display = 'block';

        historyContainer.innerHTML = '<p>Carregando histórico...</p>';
        
        console.log(`[PRONTUÁRIO] Buscando agendamentos para o NOME: ${patientData.nome}`);
        
        // Busca agendamentos pelo nome exato do paciente
        const { data: patientAppointments, error: apptError } = await _supabase.from('appointments')
            .select('id, appointment_date, start_time, professional_id, professionals(name)')
            .eq('patient_name', patientData.nome)
            .order('appointment_date', { ascending: false })
            .order('start_time', { ascending: false });

        if (apptError) throw apptError;

        if (patientAppointments.length === 0) {
            historyContainer.innerHTML = '<p>Nenhuma consulta anterior registrada para este paciente.</p>';
            return;
        }

        const appointmentIds = patientAppointments.map(appt => appt.id);
        const { data: history, error: consultError } = await _supabase.from('consultations')
            .select('*').in('appointment_id', appointmentIds).order('created_at', { ascending: false });

        if (consultError) throw consultError;
        
        historyContainer.innerHTML = '';
        if (history.length === 0) {
            historyContainer.innerHTML = '<p>Este paciente possui agendamentos, mas nenhuma consulta foi finalizada e salva.</p>';
            return;
        }

        console.log(`[PRONTUÁRIO] Renderizando ${history.length} registros de histórico.`);

        // Renderiza o histórico
        history.forEach(consultation => {
            try {
                const correspondingAppointment = patientAppointments.find(appt => appt.id === consultation.appointment_id);
                // Fallback seguro caso o agendamento correspondente não seja encontrado na lista local
                const professionalName = correspondingAppointment?.professionals?.name || 'N/A';
                const consultationDate = correspondingAppointment?.appointment_date ? new Date(correspondingAppointment.appointment_date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data desc. (ID: ' + consultation.appointment_id + ')';

                let attachmentsHtml = '';
                if (consultation.anexos && Array.isArray(consultation.anexos) && consultation.anexos.length > 0) {
                    attachmentsHtml += '<p><strong>Anexos:</strong></p><ul style="list-style: none; padding-left: 5px;">';
                    consultation.anexos.forEach(file => {
                        const { data } = _supabase.storage.from('resultados-exames').getPublicUrl(file.path);
                        attachmentsHtml += `<li><a href="${data.publicUrl}" target="_blank" style="font-size: 13px;"><i class="fas fa-file-alt"></i> ${file.name}</a></li>`;
                    });
                    attachmentsHtml += '</ul>';
                }

                // --- INÍCIO DA LÓGICA DE SEGURANÇA ---
                const creatorProfId = consultation.professional_id;
                const viewerProfId = currentViewOnlyProfessionalId; // ID do profissional logado
                const isOwner = (creatorProfId === viewerProfId);
                
                const item = document.createElement('div');
                item.className = 'historico-item card';

                let sensitiveDetailsHtml = '';

                if (isOwner) {
                    // CORREÇÃO AQUI: Uso da função safeFormatExams para evitar crash no JSON.parse
                    const examesLabTexto = safeFormatExams(consultation.pedido_exames);
                    const examesImgTexto = safeFormatExams(consultation.pedido_exames_imagem);

                    // 1. O usuário é o dono, mostra tudo
                    sensitiveDetailsHtml = `
                        <p><strong>Queixa Principal:</strong> ${consultation.queixa_principal || 'N/A'}</p>
                        <p><strong>Conduta:</strong> ${consultation.conduta || 'N/A'}</p>
                        <p class="details-link" style="color: var(--primary-color); cursor: pointer;">Ver Detalhes</p>
                        <div class="full-details" style="display: none; margin-top: 10px; border-top: 1px dashed #eee; padding-top: 10px;">
                            <p><strong>Exame Físico:</strong> ${consultation.exame_fisico || 'N/A'}</p>
                            <p><strong>Receituário:</strong> ${consultation.receituario || 'N/A'}</p>
                            <p><strong>Pedidos de Exames Lab:</strong> ${examesLabTexto}</p>
                            <p><strong>Pedidos de Exames Imagem:</strong> ${examesImgTexto}</p>
                            ${attachmentsHtml}
                        </div>
                    `;
                } else {
                    // 2. O usuário NÃO é o dono, mostra mensagem de restrição
                    sensitiveDetailsHtml = `
                        <p><strong>Queixa Principal:</strong> <span style="color: var(--gray-medium); font-style: italic;">[Informação Protegida]</span></p>
                        <p><strong>Conduta:</strong> <span style="color: var(--gray-medium); font-style: italic;">[Informação Protegida]</span></p>
                        <p style="color: var(--cancelled-color); font-style: italic; background-color: #ffebee; padding: 10px; border-radius: 5px; margin-top: 10px;">
                            <i class="fas fa-lock"></i> O acesso aos detalhes completos (exame físico, receitas, etc.) é restrito ao profissional que realizou a consulta.
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
                        const fullDetails = e.target.nextElementSibling;
                        if (fullDetails) {
                            fullDetails.style.display = fullDetails.style.display === 'none' ? 'block' : 'none';
                            e.target.textContent = fullDetails.style.display === 'none' ? 'Ver Detalhes' : 'Esconder Detalhes';
                        }
                    });
                }
                
                historyContainer.appendChild(item);

            } catch (innerError) {
                console.error(`[PRONTUÁRIO] Erro ao renderizar item do histórico (ID Consult: ${consultation.id}):`, innerError);
                // Opcional: Adicionar um placeholder de erro visual
                const errorItem = document.createElement('div');
                errorItem.className = 'historico-item card';
                errorItem.style.borderLeftColor = 'red';
                errorItem.innerHTML = `<p style="color:red">Erro ao exibir este registro. Verifique o console.</p>`;
                historyContainer.appendChild(errorItem);
            }
        });

    } catch (error) {
        console.error('[PRONTUÁRIO] Erro geral ao carregar histórico:', error);
        historyContainer.innerHTML = `<p style="color:red;">Erro ao carregar o histórico: ${error.message}</p>`;
    }
}

async function searchAndLoadPatientHistory(patientNameQuery) {
    console.log(`[PRONTUÁRIO] Buscando por: "${patientNameQuery}"`);

    if (!patientNameQuery || patientNameQuery.length < 3) {
        historyContainer.innerHTML = '<p>Digite ao menos 3 caracteres para buscar.</p>';
        patientInfoContainer.style.display = 'none';
        return;
    }

    historyContainer.innerHTML = '<p>Buscando paciente...</p>';
    patientInfoContainer.style.display = 'none';

    const lowerSearchTerm = patientNameQuery.toLowerCase();
    const searchWords = lowerSearchTerm.split(' ').filter(w => w.length > 0);
            
    try {
        // Constrói os filtros
        const nameAndFilter = searchWords.map(word => `or(nome.ilike.%${word}%,sobrenome.ilike.%${word}%)`).join(',');
        const orFilters = `and(${nameAndFilter}),cpf.ilike.%${lowerSearchTerm}%`;

        // Busca titulares e dependentes em paralelo
        const [titularesRes, dependentesRes] = await Promise.all([
            _supabase.from('clients').select('id, nome, sobrenome, cpf, plano').or(orFilters),
            // Busca dependentes e traz o plano do titular
            _supabase.from('dependents').select('id, nome, sobrenome, cpf, clients!inner(plano, nome, sobrenome)').or(orFilters)
        ]);

        if (titularesRes.error) throw titularesRes.error;
        if (dependentesRes.error) throw dependentesRes.error;

        // Formata e combina os resultados
        const matchingPatients = [
            ...titularesRes.data.map(t => ({
                nome: `${t.nome} ${t.sobrenome || ''}`.trim(),
                cpf: t.cpf,
                plano: t.plano,
                tipo: 'Titular'
            })),
            ...dependentesRes.data.map(d => ({
                nome: `${d.nome} ${d.sobrenome || ''}`.trim(),
                cpf: d.cpf,
                plano: d.clients.plano, // Pega o plano do titular
                tipo: `Dependente de ${d.clients.nome} ${d.clients.sobrenome || ''}`.trim()
            }))
        ];
        
        // Remove duplicados (caso um titular e dependente tenham nomes parecidos)
        const uniquePatients = Array.from(new Map(matchingPatients.map(p => [`${p.nome}-${p.cpf}`, p])).values());


        if (uniquePatients.length === 0) {
            historyContainer.innerHTML = '<p>Nenhum paciente encontrado com este nome.</p>';
            return;
        }

        if (uniquePatients.length === 1) {
            // Se só achou 1, carrega o histórico dele
            loadHistoryForPatient(uniquePatients[0]);
            return;
        }

        // Se achou múltiplos, mostra a lista para seleção
        historyContainer.innerHTML = '<h4>Múltiplos pacientes encontrados. Selecione um:</h4>';
        uniquePatients.forEach(patient => {
            const patientDiv = document.createElement('div');
            patientDiv.className = 'paciente-selecao-item';
            patientDiv.textContent = `${patient.nome} (CPF: ${patient.cpf || 'N/A'}) - [${patient.tipo}]`;
            // Passa o objeto 'patient' completo para a função
            patientDiv.onclick = () => loadHistoryForPatient(patient);
            historyContainer.appendChild(patientDiv);
        });

    } catch (error) {
         console.error('[PRONTUÁRIO] Erro ao buscar pacientes:', error);
         historyContainer.innerHTML = `<p style="color:red;">Erro ao buscar pacientes: ${error.message}</p>`;
    }
}

async function setupProntuarioPage() {
    // Busca o ID do profissional logado ANTES de configurar os listeners
    await fetchCurrentProfessionalId();
    
    const searchInput = document.getElementById('prontuarioSearchInput');
    
    // Limpa o campo e o histórico ao carregar a página
    searchInput.value = '';
    historyContainer.innerHTML = '<p>Busque por um paciente para ver seu histórico de consultas.</p>';
    patientInfoContainer.style.display = 'none';
    
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            searchAndLoadPatientHistory(e.target.value);
        }, 300); // Aguarda 300ms após o usuário parar de digitar
    });
}

export { setupProntuarioPage };
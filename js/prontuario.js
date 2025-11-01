import { _supabase } from './supabase.js';
// CORREÇÃO (Ponto 4): Remove a dependência do 'allPeople'
// import { allPeople } from './clientes.js';

const historyContainer = document.getElementById('prontuarioHistoryContainer');
const patientInfoContainer = document.getElementById('prontuarioPatientInfo');

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

        // Renderiza o histórico
        history.forEach(consultation => {
            const correspondingAppointment = patientAppointments.find(appt => appt.id === consultation.appointment_id);
            const professionalName = correspondingAppointment?.professionals?.name || 'N/A';
            const consultationDate = correspondingAppointment?.appointment_date ? new Date(correspondingAppointment.appointment_date + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A';

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
                    <p><strong>Receituário:</strong> ${consultation.receituario || 'N/A'}</p>
                    <p><strong>Pedidos de Exames Lab:</strong> ${consultation.pedido_exames && consultation.pedido_exames !== '[]' ? JSON.parse(consultation.pedido_exames).map(e => e.name).join(', ') : 'N/A'}</p>
                    <p><strong>Pedidos de Exames Imagem:</strong> ${consultation.pedido_exames_imagem && consultation.pedido_exames_imagem !== '[]' ? JSON.parse(consultation.pedido_exames_imagem).map(e => e.name).join(', ') : 'N/A'}</p>
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
        console.error('[PRONTUÁRIO] Erro ao carregar histórico:', error);
        historyContainer.innerHTML = `<p style="color:red;">Erro ao carregar o histórico: ${error.message}</p>`;
    }
}

// CORREÇÃO (Ponto 4): Função de busca reescrita para consultar o Supabase
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

function setupProntuarioPage() {
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

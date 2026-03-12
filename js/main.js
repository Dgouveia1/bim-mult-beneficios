import { _supabase } from './supabase.js';
import { handleLogin, handleLogout, setupPermissions, setCurrentUserProfile, getCurrentUserProfile } from './auth.js';
import { showDashboard, showLoginScreen } from './ui.js';
import { loadClientsData, handleNewClientSubmit, openModal, addDependenteField, openDetailsModal, handleUpdateClient, filterAndRenderClients, exportToExcel, handleGenerateContract, handleMigratePlanToFamiliar, handleCancelPlan, handleReactivatePlan } from './clientes.js';
import { fetchAddressByCEP, showToast, showConfirm } from './utils.js';
import { loadScheduleView, openNewAppointmentModal, closeAppointmentModal, saveAppointment, openAppointmentDetails, updateAppointment, deleteAppointment, changeDay, unsubscribeSchedule } from './agenda.js';
import { loadReceptionQueue, markArrival, openPaymentModal, savePayment, unsubscribeReception } from './recepcao.js';
import { loadPatientsData, selectPatient, finalizeConsultation, removeExam, unsubscribePatients, triggerPrintFromElement } from './pacientes.js';
import { loadLaboratoryData, openExamModal, saveExam } from './laboratorio.js';
import { loadUsersData, openUserModal, saveUser } from './usuarios.js';
import { loadProfessionalsData, openProfessionalModal, saveProfessional, openAvailabilityModal, saveProfessionalEvent, loadMyEvents, deleteProfessionalEvent } from './profissionais.js';
import { handleGenerateCSV, loadMunicipios } from './disparos.js';
import { setupProntuarioPage } from './prontuario.js';
import { setupCarteirinhaPage } from './carteirinha.js';
import { setupVendasPage } from './vendas.js';
import { loadConfirmationsData, updateConfirmationStatus } from './confirmacoes.js';
import { loadLogsData, setupLogsPage } from './logs.js';
import { loadDashboardView } from './dashboard.js';
import { setupFinanceiroPage, openFinancialModal, loadFinancialHistory } from './financeiro.js';
import { setupWhatsAppAdminPage } from './whatsapp_admin.js';
import { setupCronogramaPage } from './cronograma.js';
// IMPORTAÇÃO DA LÓGICA DE PLANOS
import { setupPlansPage, openPlanModal, savePlan, deletePlan } from './planos.js';

const newClientModalEl = document.getElementById('newClientModal');

/**
 * Remove todas as inscrições de tempo real (realtime subscriptions) ativas
 */
function cleanupRealtimeSubscriptions() {
    unsubscribeReception();
    unsubscribeSchedule();
    unsubscribePatients();
}

/**
 * Roteador de dados: Chama a função de carregamento de dados para a página ativa.
 * @param {string} pageName - Nome da página.
 */
async function loadPageData(pageName) {
    if (pageName === 'home') await loadHomePageData();
    else if (pageName === 'clientes') await loadClientsData();
    else if (pageName === 'agenda') await loadScheduleView();
    else if (pageName === 'recepcao') await loadReceptionQueue();
    else if (pageName === 'pacientes_medico' || pageName === 'pacientes_odonto') await loadPatientsData(pageName.split('_')[1]);
    else if (pageName === 'laboratorio') await loadLaboratoryData();
    else if (pageName === 'usuarios') await loadUsersData();
    else if (pageName === 'profissionais') await loadProfessionalsData();
    else if (pageName === 'disparos') await loadMunicipios();
    else if (pageName === 'confirmacoes') await loadConfirmationsData();
    else if (pageName === 'logs') setupLogsPage();
    else if (pageName === 'vendas') setupVendasPage();
    else if (pageName === 'prontuario') setupProntuarioPage();
    else if (pageName === 'exames') {
        const module = await import('./exames.js');
        module.setupExamesPage();
    }
    else if (pageName === 'caixa') {
        const module = await import('./caixa.js');
        module.setupCaixaPage();
    }
    else if (pageName === 'carteirinha') setupCarteirinhaPage();
    else if (pageName === 'financeiro') setupFinanceiroPage();
    else if (pageName === 'dashboard') loadDashboardView();
    else if (pageName === 'whatsapp_admin') setupWhatsAppAdminPage();
    else if (pageName === 'cronograma') setupCronogramaPage();
    // NOVA ROTA PARA PLANOS
    else if (pageName === 'plans') setupPlansPage();
}

// --- FUNÇÕES DE NAVEGAÇÃO E EVENTOS ---
function navigateToPage(pageName) {
    cleanupRealtimeSubscriptions();

    document.querySelectorAll('.page-content').forEach(page => page.classList.remove('active'));

    const pageId = pageName.startsWith('pacientes_') ? 'pacientes' : pageName;
    const targetPage = document.getElementById(`${pageId}Page`);
    if (targetPage) {
        targetPage.classList.add('active');
    }

    document.querySelectorAll('.menu-item, .submenu-item').forEach(item => item.classList.remove('active'));
    const activeMenuItem = document.querySelector(`[data-page="${pageName}"]`);
    if (activeMenuItem) {
        activeMenuItem.classList.add('active');
        const parentMenu = activeMenuItem.closest('.submenu')?.previousElementSibling;
        if (parentMenu) parentMenu.classList.add('active');
    }

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mainContentOverlay');
    const dashboard = document.getElementById('dashboard');
    if (sidebar) sidebar.classList.remove('visible');
    if (overlay) overlay.classList.remove('visible');
    if (dashboard) dashboard.classList.remove('sidebar-is-open');

    loadPageData(pageName);
}

// --- FUNÇÃO DA HOME PAGE (RESTAURADA) ---
async function loadHomePageData() {
    const userProfile = getCurrentUserProfile();
    if (!userProfile) return;

    const greetingElement = document.getElementById('homeGreeting');
    if (greetingElement) {
        greetingElement.textContent = `Olá, ${userProfile.full_name || 'Usuário'}!`;
    }

    const dateElement = document.getElementById('homeDate');
    if (dateElement) {
        const today = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateElement.textContent = today.toLocaleDateString('pt-BR', options);
    }

    // Lógica da Previsão do Tempo (Mock)
    const weatherElement = document.getElementById('weatherInfo');
    if (weatherElement) {
        weatherElement.textContent = 'Hoje o dia está com sol e algumas nuvens. A temperatura varia entre 22°C e 33°C.';
    }

    // Lógica da Frase do Dia
    const quoteElement = document.getElementById('motivationalQuote');
    if (quoteElement) {
        const quotes = [
            "A motivação é o que te faz começar. O hábito é o que te faz continuar.",
            "Não tenha medo de desistir do bom para perseguir o ótimo.",
            "A disciplina é a ponte entre metas e realizações.",
            "Grandes coisas não são feitas por impulso, mas pela união de pequenas coisas.",
            "A única maneira de fazer um excelente trabalho é amar o que você faz.",
            "Obstáculos são aquelas coisas assustadoras que você vê quando tira os olhos do seu objetivo.",
            "A melhor maneira de prever o futuro é criá-lo.",
            "Se você não pode fazer grandes coisas, faça pequenas coisas de uma maneira grandiosa.",
            "Acredite que você pode, e você já está no meio do caminho.", "O segredo para avançar é começar.",
            "A excelência não é um ato, mas um hábito.", "Cada novo dia é uma nova oportunidade para ser melhor que ontem.", "Planejamento, organização e foco são fatores essenciais para o sucesso.", "Não diminua a meta. Aumente o esforço.", "A criatividade é a inteligência se divertindo.", "O único lugar onde o sucesso vem antes do trabalho é no dicionário.", "Desafios são oportunidades de crescimento disfarçadas.", "Faça hoje o que seu 'eu' do futuro agradecerá.", "Produtividade nunca é um acidente. É sempre o resultado de comprometimento com a excelência.", "Sua atitude determina sua altitude.", "Tudo o que um sonho precisa para ser realizado é de alguém que acredite que ele possa ser realizado.", "A qualidade do seu trabalho é o seu melhor cartão de visitas.", "O insucesso é apenas uma oportunidade para recomeçar com mais inteligência.", "Foco no resultado, não na dificuldade.", "Talento é dom, é graça. Sucesso é trabalho, é persistência.", "Você nunca sabe que resultados virão da sua ação. Mas se você não fizer nada, não existirão resultados.", "Juntos somos mais fortes e vamos mais longe.", "A mudança é a lei da vida. E aqueles que olham apenas para o passado ou para o presente certamente perderão o futuro.", "Valorize o progresso, não apenas a perfeição.", "Tudo o que você sempre quis está do outro lado do medo.",
        ];
        const randomIndex = Math.floor(Math.random() * quotes.length);
        quoteElement.textContent = `"${quotes[randomIndex]}"`;
    }
}

function setupEventListeners() {
    const dashboard = document.getElementById('dashboard');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mainContentOverlay');

    if (sidebarToggle && sidebar && overlay && dashboard) {
        const toggleSidebar = () => {
            sidebar.classList.toggle('visible');
            overlay.classList.toggle('visible');
            dashboard.classList.toggle('sidebar-is-open');
        };

        sidebarToggle.addEventListener('click', toggleSidebar);
        overlay.addEventListener('click', toggleSidebar);
    }

    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

    document.getElementById('sidebar')?.addEventListener('click', (e) => {
        const menuItem = e.target.closest('.menu-item, .submenu-item');
        if (menuItem?.dataset.page) {
            e.preventDefault();
            navigateToPage(menuItem.dataset.page);
        } else if (menuItem?.nextElementSibling?.classList.contains('submenu')) {
            menuItem.nextElementSibling.classList.toggle('active');
        }
    });

    document.getElementById('addClientBtn')?.addEventListener('click', () => openModal(newClientModalEl));
    document.getElementById('newAppointmentBtn')?.addEventListener('click', openNewAppointmentModal);
    document.getElementById('addExamBtn')?.addEventListener('click', () => openExamModal());
    document.getElementById('addUserBtn')?.addEventListener('click', () => openUserModal());

    // LISTENER DO BOTÃO NOVO PLANO
    document.getElementById('addPlanBtn')?.addEventListener('click', () => openPlanModal());

    document.getElementById('manageMyAvailabilityBtn')?.addEventListener('click', () => {
        const user = getCurrentUserProfile();

        if (!user) return;

        if (user.role === 'medicos' || user.role === 'dentista') {
            openAvailabilityModal();
        }
        else if (['admin', 'superadmin', 'recepcao'].includes(user.role)) {
            showToast('Para gerenciar a agenda, selecione um profissional na lista.', 'info');
            navigateToPage('profissionais');
        } else {
            showToast('Acesso negado.', 'error');
        }
    });

    document.getElementById('newClientForm')?.addEventListener('submit', handleNewClientSubmit);
    document.getElementById('detailsClientForm')?.addEventListener('submit', handleUpdateClient);
    document.getElementById('appointmentForm')?.addEventListener('submit', saveAppointment);
    document.getElementById('appointmentDetailsForm')?.addEventListener('submit', updateAppointment);
    document.getElementById('deleteAppointmentBtn')?.addEventListener('click', deleteAppointment);
    document.getElementById('paymentForm')?.addEventListener('submit', savePayment);
    document.getElementById('examForm')?.addEventListener('submit', saveExam);
    document.getElementById('userForm')?.addEventListener('submit', saveUser);
    document.getElementById('professionalForm')?.addEventListener('submit', saveProfessional);
    document.getElementById('professionalEventForm')?.addEventListener('submit', saveProfessionalEvent);

    // LISTENER DO SUBMIT DE PLANO
    document.getElementById('planForm')?.addEventListener('submit', savePlan);

    document.getElementById('exitImpersonationBtn')?.addEventListener('click', async () => {
        localStorage.removeItem('impersonatedUserId');
        const { data: { session } } = await _supabase.auth.getSession();
        if (session) {
            document.getElementById('impersonationBanner').style.display = 'none';
            await initializeDashboard(session.user);
        } else {
            handleLogout();
        }
    });

    document.getElementById('addDependenteBtn')?.addEventListener('click', () => {
        const container = document.getElementById('dependentesContainer');
        addDependenteField(container, 'dependenteCount');
    });
    document.getElementById('addDependenteDetailsBtn')?.addEventListener('click', () => {
        const container = document.getElementById('detailsDependentesContainer');
        addDependenteField(container, 'dependenteDetailsCount');
    });

    document.body.addEventListener('submit', function (event) {
        if (event.target.id === 'exportForm') {
            event.preventDefault();
            handleGenerateCSV(event);
        }
    });

    const clientsSearchInput = document.getElementById('clientsSearchInput');
    if (clientsSearchInput) {
        clientsSearchInput.addEventListener('input', (e) => {
            clearTimeout(clientsSearchInput.searchTimeout);
            clientsSearchInput.searchTimeout = setTimeout(() => {
                loadClientsData(e.target.value);
            }, 500);
        });
    }

    document.body.addEventListener('change', async function (event) {
        if (event.target.classList.contains('confirmation-checkbox')) {
            const checkbox = event.target;
            const appointmentId = checkbox.dataset.appointmentId;
            const isConfirmed = checkbox.checked;
            checkbox.disabled = true;
            await updateConfirmationStatus(appointmentId, isConfirmed);
            checkbox.disabled = false;
        }
    });

    document.getElementById('filterLogsBtn')?.addEventListener('click', () => {
        const startDate = document.getElementById('logStartDate').value;
        const endDate = document.getElementById('logEndDate').value;
        loadLogsData(startDate, endDate);
    });

    const eventDateInput = document.getElementById('eventDate');
    if (eventDateInput) {
        eventDateInput.addEventListener('change', (e) => {
            const professionalId = document.getElementById('eventProfessionalId').value;
            if (professionalId) {
                loadMyEvents(professionalId, e.target.value);
            }
        });
    }

    const myEventsListContainer = document.getElementById('myEventsListContainer');
    if (myEventsListContainer) {
        myEventsListContainer.addEventListener('click', (e) => {
            const deleteButton = e.target.closest('.event-item-delete');
            if (deleteButton) {
                const eventId = deleteButton.dataset.eventId;
                deleteProfessionalEvent(eventId);
            }
        });
    }

    document.body.addEventListener('click', async function (event) {
        const target = event.target;
        if (target.closest('.close-btn') || target.closest('[data-close-modal]')) {
            const modal = target.closest('.modal');
            if (modal) modal.style.display = 'none';
        }

        const editUserButton = target.closest('.edit-user-btn');
        if (editUserButton) openUserModal(editUserButton.dataset.id);

        const editExamButton = target.closest('.edit-exam-btn');
        if (editExamButton) openExamModal(editExamButton.dataset.id);

        // LISTENERS DE AÇÃO NOS PLANOS
        const editPlanButton = target.closest('.edit-plan-btn');
        if (editPlanButton) openPlanModal(editPlanButton.dataset.id);

        const deletePlanButton = target.closest('.delete-plan-btn');
        if (deletePlanButton) deletePlan(deletePlanButton.dataset.id);

        const viewContractButton = target.closest('.view-contract-btn');
        if (viewContractButton) {
            // Reutiliza o modal de edição, mas pode ser ajustado para apenas leitura
            openPlanModal(viewContractButton.dataset.id);
        }

        const checkinButton = target.closest('.checkin-btn');
        if (checkinButton) markArrival(checkinButton.dataset.id);

        const paymentButton = target.closest('.payment-btn');
        if (paymentButton) openPaymentModal(paymentButton.dataset.id, paymentButton.dataset.name);

        const appointmentCard = target.closest('.appointment-card[data-appointment-id]');
        if (appointmentCard) openAppointmentDetails(appointmentCard.dataset.appointmentId);

        const detailsClientButton = target.closest('.view-details-btn');
        if (detailsClientButton) openDetailsModal(detailsClientButton.dataset.titularId);

        const btnMigrarFamiliar = target.closest('#btnMigrarPlanoFamiliar');
        if (btnMigrarFamiliar) handleMigratePlanToFamiliar();

        const btnCancelarPlanoModal = target.closest('#btnCancelarPlano');
        if (btnCancelarPlanoModal) handleCancelPlan();

        const btnReativarPlanoModal = target.closest('#btnReativarPlano');
        if (btnReativarPlanoModal) handleReactivatePlan();

        const contractButton = target.closest('.generate-contract-btn');
        if (contractButton) handleGenerateContract(contractButton.dataset.titularId);

        const carneBtn = target.closest('.emit-carne-btn');
        if (carneBtn) {
            const titularId = carneBtn.dataset.titularId;
            const cpf = carneBtn.dataset.cpf;
            const plano = carneBtn.dataset.plano;
            const nome = carneBtn.dataset.name;
            const clientMock = {
                id: titularId,
                nome: nome.split(' ')[0],
                sobrenome: nome.split(' ').slice(1).join(' '),
                cpf: cpf,
                plano: plano
            };
            openFinancialModal(clientMock);
        }

        const patientQueueItem = target.closest('.paciente-espera-item');
        if (patientQueueItem) selectPatient(patientQueueItem.dataset.appointmentId);

        const finalizeButton = target.closest('#finalizeConsultationBtn');
        if (finalizeButton) finalizeConsultation();

        const printGenericButton = target.closest('.print-btn');
        if (printGenericButton) {
            triggerPrintFromElement(printGenericButton);
        }

        const editProfessionalButton = target.closest('.edit-professional-btn');
        if (editProfessionalButton) openProfessionalModal(editProfessionalButton.dataset.id);

        const manageEventsButton = target.closest('.manage-events-btn');
        if (manageEventsButton) {
            openAvailabilityModal(manageEventsButton.dataset.id);
        }

        const removeDependenteButton = target.closest('.remove-dependente-btn');
        if (removeDependenteButton) {
            const dependentGroup = removeDependenteButton.closest('.dependente-form-group');
            const dependentId = dependentGroup.dataset.dependenteId;

            if (dependentId) {
                const confirmed = await showConfirm('Tem certeza que deseja remover este dependente? A remoção será permanente ao salvar.');
                if (confirmed) {
                    dependentGroup.style.display = 'none';
                    const deleteInput = document.createElement('input');
                    deleteInput.type = 'hidden';
                    deleteInput.name = `dependente_delete_${dependentId}`;
                    deleteInput.value = 'true';
                    dependentGroup.appendChild(deleteInput);
                }
            } else {
                dependentGroup.remove();
            }
        }

        const impersonateBtn = target.closest('.impersonate-btn');
        if (impersonateBtn) {
            const confirmed = await showConfirm('Deseja acessar o sistema como este usuário? Todas as ações ficaram registradas.');
            if (confirmed) {
                localStorage.setItem('impersonatedUserId', impersonateBtn.dataset.id);
                const { data: { session } } = await _supabase.auth.getSession();
                if (session) {
                    await initializeDashboard(session.user);
                }
            }
        }
    });

    document.getElementById('prevDayBtn')?.addEventListener('click', () => changeDay(-1));
    document.getElementById('nextDayBtn')?.addEventListener('click', () => changeDay(1));

    document.getElementById('exportClientsBtn')?.addEventListener('click', exportToExcel);
}

async function initializeDashboard(user) {
    document.querySelectorAll('table').forEach(table => {
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
        table.querySelectorAll('tbody tr').forEach(row => {
            row.querySelectorAll('td').forEach((td, index) => {
                if (headers[index]) {
                    td.setAttribute('data-label', headers[index]);
                }
            });
        });
    });

    const { data: profile, error } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
    if (error || !profile) {
        showToast('Erro crítico: Perfil do usuário não encontrado.', 'error');
        return handleLogout();
    }

    let finalProfile = profile;
    const impersonatedUserId = localStorage.getItem('impersonatedUserId');
    if (profile.role === 'superadmin' && impersonatedUserId) {
        const { data: impersonatedProfile, error: impError } = await _supabase.from('profiles').select('*').eq('id', impersonatedUserId).single();
        if (impersonatedProfile && !impError) {
            finalProfile = {
                ...impersonatedProfile,
                isImpersonated: true,
                originalUserId: profile.id
            };
            const banner = document.getElementById('impersonationBanner');
            const bText = document.getElementById('impersonationText');
            if (banner && bText) {
                bText.textContent = `Você está acessando como: ${impersonatedProfile.full_name} (${impersonatedProfile.role})`;
                banner.style.display = 'flex';
            }
        } else {
            localStorage.removeItem('impersonatedUserId');
        }
    }

    setCurrentUserProfile(finalProfile);
    setupPermissions(finalProfile.role);
    showDashboard();

    await loadPageData('home');
}

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        await initializeDashboard(session.user);
    } else {
        showLoginScreen();
    }
});

export { initializeDashboard };
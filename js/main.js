import { _supabase } from './supabase.js';
import { handleLogin, handleLogout, setupPermissions, setCurrentUserProfile, getCurrentUserProfile } from './auth.js';
import { showDashboard, showLoginScreen } from './ui.js';
import { loadClientsData, handleNewClientSubmit, openModal, addDependenteField, openDetailsModal, handleUpdateClient, filterAndRenderClients, exportToExcel } from './clientes.js';
// ATUALIZADO: Importa showConfirm
import { fetchAddressByCEP, showToast, showConfirm } from './utils.js';
import { loadScheduleView, openNewAppointmentModal, closeAppointmentModal, saveAppointment, openAppointmentDetails, updateAppointment, deleteAppointment, changeDay, unsubscribeSchedule } from './agenda.js'; 
import { loadReceptionQueue, markArrival, openPaymentModal, savePayment, unsubscribeReception } from './recepcao.js';
import { loadPatientsData, selectPatient, finalizeConsultation, removeExam, unsubscribePatients  } from './pacientes.js';
import { loadLaboratoryData, openExamModal, saveExam } from './laboratorio.js';
import { loadUsersData, openUserModal, saveUser } from './usuarios.js';
// Importa as novas funções de disponibilidade
import { 
    loadProfessionalsData, 
    openProfessionalModal, 
    saveProfessional,
    openMyAvailabilityModal,
    saveProfessionalEvent,
    loadMyEvents,
    deleteProfessionalEvent
} from './profissionais.js';
import { handleGenerateCSV, loadMunicipios } from './disparos.js';
import { setupProntuarioPage } from './prontuario.js'; 
import { setupCarteirinhaPage } from './carteirinha.js';
import { setupVendasPage } from './vendas.js';
import { loadConfirmationsData, updateConfirmationStatus } from './confirmacoes.js';
import { loadLogsData, setupLogsPage } from './logs.js';


const newClientModalEl = document.getElementById('newClientModal');

// Função para limpar as inscrições de tempo real da página atual
function cleanupRealtimeSubscriptions() {
    unsubscribeReception();
    unsubscribeSchedule();
    unsubscribePatients();
}

function navigateToPage(pageName) {
    cleanupRealtimeSubscriptions();

    // Esconde todas as páginas
    document.querySelectorAll('.page-content').forEach(page => page.classList.remove('active'));
    
    // Mostra a página alvo
    const targetPage = document.getElementById(`${pageName}Page`);
    if (targetPage) {
        targetPage.classList.add('active');
    }

    // Atualiza o menu
    document.querySelectorAll('.menu-item, .submenu-item').forEach(item => item.classList.remove('active'));
    const activeMenuItem = document.querySelector(`[data-page="${pageName}"]`);
    if (activeMenuItem) {
        activeMenuItem.classList.add('active');
        const parentMenu = activeMenuItem.closest('.submenu')?.previousElementSibling;
        if (parentMenu) parentMenu.classList.add('active');
    }

    // Fecha a sidebar (em telas menores)
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mainContentOverlay');
    const dashboard = document.getElementById('dashboard');
    sidebar.classList.remove('visible');
    overlay.classList.remove('visible');
    dashboard.classList.remove('sidebar-is-open');

    // Carrega os dados da página que acabou de ser aberta
    loadPageData(pageName);
}

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

    const weatherElement = document.getElementById('weatherInfo');
    if (weatherElement) {
        weatherElement.textContent = 'Hoje o dia está com sol e algumas nuvens. A temperatura varia entre 22°C e 33°C.';
    }

    const quoteElement = document.getElementById('motivationalQuote');
    if (quoteElement) {
        const quotes = [
            "Suba o primeiro degrau com fé. Não é necessário que você veja toda a escada. Apenas dê o primeiro passo.",
            "O sucesso é a soma de pequenos esforços repetidos dia á dia.",
            "A persistência realiza o impossível.",
            "Não espere por uma crise para descobrir o que é importante em sua vida.",
            "Comece onde você está. Use o que você tem. Faça o que você pode."
        ];
        const randomIndex = Math.floor(Math.random() * quotes.length);
        quoteElement.textContent = `"${quotes[randomIndex]}"`;
    }
}

async function loadPageData(pageName) {
    if (pageName === 'home') await loadHomePageData();
    else if (pageName === 'clientes') await loadClientsData();
    else if (pageName === 'agenda') await loadScheduleView();
    else if (pageName === 'recepcao') await loadReceptionQueue();
    else if (pageName === 'pacientes') await loadPatientsData();
    else if (pageName === 'laboratorio') await loadLaboratoryData();
    else if (pageName === 'usuarios') await loadUsersData();
    else if (pageName === 'profissionais') await loadProfessionalsData();
    else if (pageName === 'disparos') await loadMunicipios();
    else if (pageName === 'confirmacoes') await loadConfirmationsData();
    else if (pageName === 'logs') setupLogsPage(); // << ALTERADO: Apenas prepara a página de logs
    // CORREÇÃO (Ponto 3): Chama a função de setup da página de vendas
    else if (pageName === 'vendas') setupVendasPage();
    else if (pageName === 'prontuario') {
        // CORREÇÃO (Ponto 4): Não carrega mais 'loadClientsData' aqui
        setupProntuarioPage();
    } else if (pageName === 'carteirinha') {
        setupCarteirinhaPage();
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

    // --- CORREÇÃO 1: Botão de Disponibilidade (agora no Dashboard) ---
    // O comentário foi atualizado para refletir a mudança. O ID único agora funciona.
    document.getElementById('manageMyAvailabilityBtn')?.addEventListener('click', () => {
        const user = getCurrentUserProfile();
        if (user && user.role === 'medicos') {
            openMyAvailabilityModal();
        } else {
            // ATUALIZADO: Substitui alert() por showToast()
            showToast('Esta função é restrita a profissionais (médicos).', 'error');
        }
    });

    // --- Formulários ---
    document.getElementById('newClientForm')?.addEventListener('submit', handleNewClientSubmit);
    document.getElementById('detailsClientForm')?.addEventListener('submit', handleUpdateClient);
    document.getElementById('appointmentForm')?.addEventListener('submit', saveAppointment);
    document.getElementById('appointmentDetailsForm')?.addEventListener('submit', updateAppointment);

    // --- CORREÇÃO ADICIONADA ---
    // Adiciona o "ouvinte" de clique para o botão de excluir
    document.getElementById('deleteAppointmentBtn')?.addEventListener('click', deleteAppointment);
    // --- FIM DA CORREÇÃO ---

    document.getElementById('paymentForm')?.addEventListener('submit', savePayment);
    document.getElementById('examForm')?.addEventListener('submit', saveExam);
    document.getElementById('userForm')?.addEventListener('submit', saveUser);
    document.getElementById('professionalForm')?.addEventListener('submit', saveProfessional);
    
    // --- NOVO: Formulário de Eventos do Profissional ---
    document.getElementById('professionalEventForm')?.addEventListener('submit', saveProfessionalEvent);

    // --- Botões de Adicionar Dependente ---
    document.getElementById('addDependenteBtn')?.addEventListener('click', () => {
            const container = document.getElementById('dependentesContainer');
            addDependenteField(container, 'dependenteCount');
        });
    document.getElementById('addDependenteDetailsBtn')?.addEventListener('click', () => {
            const container = document.getElementById('detailsDependentesContainer');
            addDependenteField(container, 'dependenteDetailsCount');
        });
    
    document.body.addEventListener('submit', function(event) {
        if (event.target.id === 'exportForm') {
            event.preventDefault();
            handleGenerateCSV(event);
        }
    });

    const clientsSearchInput = document.getElementById('clientsSearchInput');
    if (clientsSearchInput) {
        // CORREÇÃO (Ponto 2): Mudar de 'input' para 'search' ou 'change' pode ser melhor, 
        // mas vamos manter 'input' e confiar no debounce.
        // A lógica de busca real foi movida para loadClientsData
        clientsSearchInput.addEventListener('input', (e) => {
            clearTimeout(clientsSearchInput.searchTimeout);
            clientsSearchInput.searchTimeout = setTimeout(() => {
                const searchTerm = e.target.value;
                loadClientsData(searchTerm); // A função loadClientsData agora lida com o termo
            }, 500); 
        });
    }

    document.body.addEventListener('change', async function(event) {
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

    // --- NOVO: Listeners do Modal de Disponibilidade ---
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

    // --- Listener Global de Cliques (delegation) ---
    // ATUALIZADO: O listener agora é 'async' para suportar 'await showConfirm'
    document.body.addEventListener('click', async function(event) {
        const target = event.target;
        // Fechar modais
        if (target.closest('.close-btn') || target.closest('[data-close-modal]')) {
            const modal = target.closest('.modal');
            if(modal) modal.style.display = 'none';
        }
        // Botões de Ação em Tabelas
        const editUserButton = target.closest('.edit-user-btn');
        if (editUserButton) openUserModal(editUserButton.dataset.id);

        const editExamButton = target.closest('.edit-exam-btn');
        if (editExamButton) openExamModal(editExamButton.dataset.id);
        
        const checkinButton = target.closest('.checkin-btn');
        if (checkinButton) markArrival(checkinButton.dataset.id);
        
        const paymentButton = target.closest('.payment-btn');
        if (paymentButton) openPaymentModal(paymentButton.dataset.id, paymentButton.dataset.name);
        
        const appointmentCard = target.closest('.appointment-card[data-appointment-id]');
        if (appointmentCard) openAppointmentDetails(appointmentCard.dataset.appointmentId);
        
        const detailsClientButton = target.closest('#clientsTableBody .btn[data-titular-id]');
        if (detailsClientButton) openDetailsModal(detailsClientButton.dataset.titularId);
        
        const patientQueueItem = target.closest('.paciente-espera-item');
        if (patientQueueItem) selectPatient(patientQueueItem.dataset.appointmentId);

        const finalizeButton = target.closest('#finalizeConsultationBtn');
        if (finalizeButton) finalizeConsultation();
        
        const printGenericButton = target.closest('.print-btn');
        if (printGenericButton) {
            import('./pacientes.js').then(mod => mod.triggerPrintFromElement(printGenericButton)).catch(err => console.error(err));
        }

        // ... (outros botões de clique) ...
        
        const editProfessionalButton = target.closest('.edit-professional-btn');
        if (editProfessionalButton) openProfessionalModal(editProfessionalButton.dataset.id);
        
        const removeDependenteButton = target.closest('.remove-dependente-btn');
        if (removeDependenteButton) {
            const dependentGroup = removeDependenteButton.closest('.dependente-form-group');
            const dependentId = dependentGroup.dataset.dependenteId;
    
            if (dependentId) {
                // ATUALIZADO: Substitui confirm() por showConfirm()
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
                // Se for um dependente novo (sem ID), apenas remove
                dependentGroup.remove();
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
        // ATUALIZADO: Substitui alert() por showToast()
        showToast('Erro crítico: Perfil do usuário não encontrado.', 'error');
        return handleLogout();
    }
    
    setCurrentUserProfile(profile);
    setupPermissions(profile.role);
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
import { _supabase } from './supabase.js';
import { handleLogin, handleLogout, setupPermissions, setCurrentUserProfile, getCurrentUserProfile } from './auth.js';
import { showDashboard, showLoginScreen } from './ui.js';
import { loadClientsData, handleNewClientSubmit, openModal, addDependenteField, openDetailsModal, handleUpdateClient, filterAndRenderClients, exportToExcel } from './clientes.js';
import { fetchAddressByCEP } from './utils.js';
import { loadScheduleView, openNewAppointmentModal, closeAppointmentModal, saveAppointment, openAppointmentDetails, updateAppointment, deleteAppointment, changeDay, unsubscribeSchedule } from './agenda.js'; 
import { loadReceptionQueue, markArrival, openPaymentModal, savePayment, unsubscribeReception } from './recepcao.js';
import { loadPatientsData, selectPatient, finalizeConsultation, removeExam, unsubscribePatients  } from './pacientes.js';
import { loadLaboratoryData, openExamModal, saveExam } from './laboratorio.js';
import { loadUsersData, openUserModal, saveUser } from './usuarios.js';
import { loadProfessionalsData, openProfessionalModal, saveProfessional } from './profissionais.js';
import { handleGenerateCSV, loadMunicipios } from './disparos.js';
import { setupProntuarioPage } from './prontuario.js'; 
import { setupCarteirinhaPage } from './carteirinha.js';
import { loadConfirmationsData, updateConfirmationStatus } from './confirmacoes.js';
import { loadLogsData, setupLogsPage } from './logs.js'; // Importa a função de setup da página de logs


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
            "O sucesso é a soma de pequenos esforços repetidos dia após dia.",
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
    else if (pageName === 'prontuario') {
        await loadClientsData();
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
    document.getElementById('newClientForm')?.addEventListener('submit', handleNewClientSubmit);
    document.getElementById('detailsClientForm')?.addEventListener('submit', handleUpdateClient);
    document.getElementById('appointmentForm')?.addEventListener('submit', saveAppointment);
    document.getElementById('appointmentDetailsForm')?.addEventListener('submit', updateAppointment);
    document.getElementById('deleteAppointmentBtn')?.addEventListener('click', deleteAppointment);
    document.getElementById('paymentForm')?.addEventListener('submit', savePayment);
    document.getElementById('examForm')?.addEventListener('submit', saveExam);
    document.getElementById('userForm')?.addEventListener('submit', saveUser);
    document.getElementById('professionalForm')?.addEventListener('submit', saveProfessional);
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
        clientsSearchInput.addEventListener('input', (e) => {
            clearTimeout(clientsSearchInput.searchTimeout);
            clientsSearchInput.searchTimeout = setTimeout(() => {
                const searchTerm = e.target.value;
                loadClientsData(searchTerm);
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

    document.body.addEventListener('click', function(event) {
        const target = event.target;
        if (target.closest('.close-btn') || target.closest('[data-close-modal]')) {
            const modal = target.closest('.modal');
            if(modal) modal.style.display = 'none';
        }
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
        const detailsClientButton = target.closest('[data-titular-id]');
        if (detailsClientButton) openDetailsModal(detailsClientButton.dataset.titularId);
        const patientQueueItem = target.closest('.paciente-espera-item');
        if (patientQueueItem) selectPatient(patientQueueItem.dataset.appointmentId);
        const finalizeButton = target.closest('#finalizeConsultationBtn');
        if (finalizeButton) finalizeConsultation();
        const printExamsButton = target.closest('#printExamsBtn');
        const printGenericButton = target.closest('.print-btn');
        if (printExamsButton) printExamDocuments();
        if (printGenericButton) {
            import('./pacientes.js').then(mod => mod.triggerPrintFromElement(printGenericButton)).catch(err => console.error(err));
        }
        const removeExamButton = target.closest('.remove-item-btn');
        if (removeExamButton) removeExam(parseInt(removeExamButton.dataset.examId));
        const tabButton = target.closest('.atendimento-botoes .btn');
        if (tabButton) {
            document.querySelectorAll('.atendimento-botoes .btn, .aba-conteudo').forEach(el => el.classList.remove('active'));
            tabButton.classList.add('active');
            document.getElementById(`aba${tabButton.dataset.aba.charAt(0).toUpperCase() + tabButton.dataset.aba.slice(1)}`).classList.add('active');
        }
        const editProfessionalButton = target.closest('.edit-professional-btn');
        if (editProfessionalButton) openProfessionalModal(editProfessionalButton.dataset.id);
        const removeDependenteButton = target.closest('.remove-dependente-btn');
        if (removeDependenteButton) {
            const dependentGroup = removeDependenteButton.closest('.dependente-form-group');
            const dependentId = dependentGroup.dataset.dependenteId;
    
            if (dependentId) {
                if (confirm('Tem certeza que deseja remover este dependente? A remoção será permanente ao salvar.')) {
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
        alert('Erro crítico: Perfil do usuário não encontrado.');
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

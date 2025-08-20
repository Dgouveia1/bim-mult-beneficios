import { _supabase } from './supabase.js';
import { handleLogin, handleLogout, setupPermissions, setCurrentUserProfile  } from './auth.js';
import { showDashboard, showLoginScreen } from './ui.js';
import { loadClientsData, handleNewClientSubmit, openModal, addDependenteField, openDetailsModal, handleUpdateClient, filterAndRenderClients, exportToExcel } from './clientes.js';
import { fetchAddressByCEP } from './utils.js';
import { loadScheduleView, openNewAppointmentModal, closeAppointmentModal, saveAppointment, openAppointmentDetails, updateAppointment, deleteAppointment, changeDay } from './agenda.js'; 
import { loadReceptionQueue, markArrival, openPaymentModal, savePayment } from './recepcao.js';
import { loadPatientsData, selectPatient, finalizeConsultation, printContent, printExamDocuments, removeExam } from './pacientes.js';
import { loadLaboratoryData, openExamModal, saveExam } from './laboratorio.js';
import { loadUsersData, openUserModal, saveUser } from './usuarios.js';
import { loadProfessionalsData, openProfessionalModal, saveProfessional } from './profissionais.js';

const newClientModalEl = document.getElementById('newClientModal');

function navigateToPage(pageName) {
    document.querySelectorAll('.page-content').forEach(page => page.classList.remove('active'));
    const targetPage = document.getElementById(`${pageName}Page`);
    if (targetPage) {
        targetPage.classList.add('active');
    } else {
        document.getElementById('homePage').classList.add('active');
    }
    document.querySelectorAll('.menu-item, .submenu-item').forEach(item => item.classList.remove('active'));
    const activeMenuItem = document.querySelector(`[data-page="${pageName}"]`);
    if (activeMenuItem) {
        activeMenuItem.classList.add('active');
        const parentMenu = activeMenuItem.closest('.submenu')?.previousElementSibling;
        if (parentMenu) parentMenu.classList.add('active');
    }
    loadPageData(pageName);
}

function loadPageData(pageName) {
    if (pageName === 'clientes') loadClientsData();
    else if (pageName === 'agenda') loadScheduleView();
    else if (pageName === 'recepcao') loadReceptionQueue();
    else if (pageName === 'pacientes') loadPatientsData();
    else if (pageName === 'laboratorio') loadLaboratoryData();
    else if (pageName === 'usuarios') loadUsersData();
    else if (pageName === 'profissionais') loadProfessionalsData();
}

function setupEventListeners() {
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
        // Listener para o botão "Adicionar Dependente" no modal de NOVO cliente
    document.getElementById('addDependenteBtn')?.addEventListener('click', () => {
            const container = document.getElementById('dependentesContainer');
            addDependenteField(container, 'dependenteCount');
        });
    
        // Listener para o botão "Adicionar Dependente" no modal de DETALHES (edição)
     document.getElementById('addDependenteDetailsBtn')?.addEventListener('click', () => {
            const container = document.getElementById('detailsDependentesContainer');
            addDependenteField(container, 'dependenteDetailsCount');
        });

    // Listener para a barra de pesquisa de clientes
    const clientsSearchInput = document.getElementById('clientsSearchInput');
    if (clientsSearchInput) {
        clientsSearchInput.addEventListener('input', () => {
            // Adiciona um pequeno delay para evitar buscas a cada tecla
            clearTimeout(clientsSearchInput.searchTimeout);
            clientsSearchInput.searchTimeout = setTimeout(() => {
                filterAndRenderClients();
            }, 300); // 300ms de delay
        });
    }

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
        else if (printGenericButton) printContent(printGenericButton.dataset.target);
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
                // Se o dependente já existe no banco, pede confirmação
                if (confirm('Tem certeza que deseja remover este dependente? A remoção será permanente ao salvar.')) {
                    // Esconde o grupo do formulário e o marca para exclusão
                    dependentGroup.style.display = 'none';
                    const deleteInput = document.createElement('input');
                    deleteInput.type = 'hidden';
                    deleteInput.name = `dependente_delete_${dependentId}`;
                    deleteInput.value = 'true';
                    dependentGroup.appendChild(deleteInput);
                }
            } else {
                // Se for um dependente novo (que ainda não foi salvo), apenas remove do formulário
                dependentGroup.remove();
            }
        }
    });


    document.getElementById('prevDayBtn')?.addEventListener('click', () => changeDay(-1));
    document.getElementById('nextDayBtn')?.addEventListener('click', () => changeDay(1));
    document.getElementById('exportClientsBtn')?.addEventListener('click', exportToExcel);
}

async function initializeDashboard(user) {
    const { data: profile, error } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
    if (error || !profile) {
        alert('Erro crítico: Perfil do usuário não encontrado.');
        return handleLogout();
    }
    setCurrentUserProfile(profile);
    setupPermissions(profile.role);
    showDashboard();
    await loadClientsData();
    navigateToPage('home');
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
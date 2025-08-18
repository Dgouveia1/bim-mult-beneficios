import { _supabase } from './supabase.js';
import { handleLogin, handleLogout, setupPermissions } from './auth.js';
import { showDashboard, showLoginScreen } from './ui.js'; // ALTERADO: Importa de ui.js
import { loadClientsData, handleNewClientSubmit, openModal, addDependenteField, openDetailsModal, handleUpdateClient, filterAndRenderClients, exportToExcel } from './clientes.js';
import { fetchAddressByCEP, maskCPF, maskPhone } from './utils.js';
import { loadScheduleView, openNewAppointmentModal, closeAppointmentModal, saveAppointment, openAppointmentDetails, updateAppointment, deleteAppointment, changeDay } from './agenda.js'; 
import { loadReceptionQueue, markArrival, openPaymentModal, savePayment } from './recepcao.js';
import { loadPatientsData, selectPatient, finalizeConsultation, printContent, printExamDocuments, removeExam } from './pacientes.js';
import { loadLaboratoryData, openExamModal, saveExam } from './laboratorio.js';
import { loadUsersData, openUserModal, saveUser } from './usuarios.js';
import { loadProfessionalsData, openProfessionalModal, saveProfessional } from './profissionais.js';

// --- ELEMENTOS DO DOM ---
const newClientModalEl = document.getElementById('newClientModal');

// --- NAVEGAÇÃO ---
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

// --- CONFIGURAÇÃO DE EVENTOS ---
function setupEventListeners() {
    // ... (o código desta função permanece o mesmo)
}

// --- INICIALIZAÇÃO ---
async function initializeDashboard(user) {
    const { data: profile, error } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
    if (error || !profile) {
        alert('Erro crítico: Perfil do usuário não encontrado.');
        return handleLogout();
    }
    setupPermissions(profile.role);
    showDashboard(); // Agora usa a função importada de ui.js
    loadClientsData();
    navigateToPage('home');
}

// REMOVIDO: As funções showDashboard e showLoginScreen foram movidas para ui.js

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 [MAIN] DOM carregado - Iniciando aplicação...');
    setupEventListeners();
    console.log('🔐 [MAIN] Verificando autenticação...');
    const { data: { session } } = await _supabase.auth.getSession();

    if (session) {
        console.log('✅ [MAIN] Usuário autenticado - Inicializando dashboard...');
        await initializeDashboard(session.user);
    } else {
        console.log('❌ [MAIN] Usuário não autenticado - Mostrando tela de login...');
        showLoginScreen(); // Agora usa a função importada de ui.js
    }
});

export { initializeDashboard }; // Apenas initializeDashboard precisa ser exportada
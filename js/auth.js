import { _supabase } from './supabase.js';
import { initializeDashboard } from './main.js';
import { showLoginScreen } from './ui.js';
import { logAction } from './logger.js';
import { showToast } from './utils.js';

let currentUserProfile = null;

function setCurrentUserProfile(profile) {
    currentUserProfile = profile;
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    try {
        const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const { data: profile, error: profileError } = await _supabase.from('profiles').select('*').eq('id', data.user.id).single();
        if (profileError) throw profileError;

        currentUserProfile = profile;
        await logAction('LOGIN', { email: email });
        await initializeDashboard(data.user);
    } catch (error) {
        showToast('Credenciais inválidas.');
    }
}

async function handleLogout() {
    await logAction('LOGOUT', {});
    await _supabase.auth.signOut();
    localStorage.removeItem('impersonatedUserId');
    currentUserProfile = null;
    showLoginScreen();
}

function getCurrentUserProfile() {
    return currentUserProfile;
}

function setupPermissions(role) {
    // Mapeia roles para as classes CSS que elas podem ver
    const rolePermissions = {
        superadmin: ['admin-only', 'medicos-only'],
        admin: ['admin-only', 'medicos-only'],
        // CORREÇÃO: Recepção agora vê elementos 'admin-only' limitados (necessário para ver o menu 'Marketing & Admin' onde 'Profissionais' está)
        // Isso é necessário porque o menu pai está envolto em <div class="admin-only"> no HTML.
        // Se quisermos ser mais restritos, deveríamos mudar o HTML, mas via JS, permitimos que vejam o container pai
        // e filtramos os filhos abaixo.
        recepcao: ['admin-only'],
        auxiliar: ['admin-only'], // Auxiliar tem as mesmas permissões de elemento que recepção
        medicos: ['medicos-only'],
        dentista: ['medicos-only'],
        financeiro: ['admin-only']
    };

    // 1. Esconde todos os elementos com classes de permissão
    document.querySelectorAll('.admin-only, .medicos-only').forEach(el => {
        el.style.display = 'none';
    });

    // 2. Mostra elementos que o role atual tem permissão para ver
    const allowedClasses = rolePermissions[role] || [];
    allowedClasses.forEach(className => {
        document.querySelectorAll(`.${className}`).forEach(el => {
            if (el.tagName === 'BUTTON' || el.style.display === 'flex') {
                el.style.display = 'flex';
            } else {
                el.style.display = 'block';
            }
        });
    });

    // 3. Lógica específica de MENU (sidebar)
    const allMenuItems = {
        'menu-cartao': true, 'submenu-cartao': true, 'menu-clinica': true,
        'submenu-clinica': true, 'menu-admin': true, 'submenu-admin': true,
    };

    const rolesPermissions = {
        superadmin: { 'menu-cartao': true, 'submenu-cartao': true, 'menu-clinica': true, 'submenu-clinica': true, 'menu-admin': true, 'submenu-admin': true },
        admin: { 'menu-cartao': true, 'submenu-cartao': true, 'menu-clinica': true, 'submenu-clinica': true, 'menu-admin': true, 'submenu-admin': true },
        recepcao: { 'menu-cartao': true, 'submenu-cartao': true, 'menu-clinica': true, 'submenu-clinica': true, 'menu-admin': true, 'submenu-admin': true }, // Vê o menu pai
        auxiliar: { 'menu-cartao': true, 'submenu-cartao': true, 'menu-clinica': true, 'submenu-clinica': true, 'menu-admin': true, 'submenu-admin': true }, // Auxiliar: mesmo menu que recepção
        medicos: { 'menu-cartao': false, 'submenu-cartao': false, 'menu-clinica': true, 'submenu-clinica': true, 'menu-admin': false, 'submenu-admin': false },
        dentista: { 'menu-cartao': false, 'submenu-cartao': false, 'menu-clinica': true, 'submenu-clinica': true, 'menu-admin': false, 'submenu-admin': false },
        financeiro: { 'menu-cartao': false, 'submenu-cartao': false, 'menu-clinica': false, 'submenu-clinica': false, 'menu-admin': true, 'submenu-admin': true }
    };

    const userPerms = rolesPermissions[role] || {};

    for (const menuId in allMenuItems) {
        const el = document.getElementById(menuId);
        if (el) {
            el.style.display = userPerms[menuId] ? 'block' : 'none';
        }
    }

    // 4. Lógica Fina para Itens DENTRO dos Submenus

    // a) Menu Cartão: Controle WhatsApp (Todos Admin/Recepção veem)
    const whatsappLink = document.querySelector('[data-page="whatsapp_admin"]');
    if (whatsappLink) {
        if (role === 'admin' || role === 'superadmin' || role === 'recepcao' || role === 'auxiliar') {
            whatsappLink.style.display = 'block';
        } else {
            whatsappLink.style.display = 'none';
        }
    }

    // b) Menu Admin: Cronograma (Só Admin/Superadmin veem)
    const adminSubmenu = document.getElementById('submenu-admin');
    if (adminSubmenu) {
        // Seleciona itens específicos para esconder/mostrar
        const cronogramaLink = adminSubmenu.querySelector('[data-page="cronograma"]');
        const logsLink = adminSubmenu.querySelector('[data-page="logs"]');
        const dashboardLink = adminSubmenu.querySelector('[data-page="dashboard"]');
        const usersLink = adminSubmenu.querySelector('[data-page="usuarios"]');
        const financeiroLink = adminSubmenu.querySelector('[data-page="financeiro"]');
        const labLink = adminSubmenu.querySelector('[data-page="laboratorio"]');
        const profLink = adminSubmenu.querySelector('[data-page="profissionais"]');

        if (role === 'recepcao' || role === 'auxiliar') {
            // Recepção e Auxiliar veem APENAS Profissionais (para agenda)
            // Esconde funções sensíveis de admin
            if (cronogramaLink) cronogramaLink.style.display = 'none';
            if (logsLink) logsLink.style.display = 'none';
            if (dashboardLink) dashboardLink.style.display = 'none';
            if (usersLink) usersLink.style.display = 'none';
            if (financeiroLink) financeiroLink.style.display = 'none';

            // Garante que Profissionais esteja visível para Recepção e Auxiliar
            if (profLink) profLink.style.display = 'block';

        } else if (role === 'admin' || role === 'superadmin') {
            // Admins veem tudo
            if (cronogramaLink) cronogramaLink.style.display = 'block';
            if (logsLink) logsLink.style.display = 'block';
            if (profLink) profLink.style.display = 'block';
        }
    }

    // c) Menu Clínica: Atendimento (Médico vs Odonto)
    const clinicaSubmenu = document.getElementById('submenu-clinica');
    if (clinicaSubmenu) {
        const atendimentoMedicoLink = clinicaSubmenu.querySelector('[data-page="pacientes_medico"]');
        const atendimentoOdontoLink = clinicaSubmenu.querySelector('[data-page="pacientes_odonto"]');

        if (atendimentoMedicoLink && atendimentoOdontoLink) {
            if (role === 'medicos') {
                atendimentoMedicoLink.style.display = 'block';
                atendimentoOdontoLink.style.display = 'none';
            } else if (role === 'dentista') {
                atendimentoMedicoLink.style.display = 'none';
                atendimentoOdontoLink.style.display = 'block';
            } else {
                atendimentoMedicoLink.style.display = 'block';
                atendimentoOdontoLink.style.display = 'block';
            }
        }
    }
}

export { handleLogin, handleLogout, setupPermissions, getCurrentUserProfile, setCurrentUserProfile };
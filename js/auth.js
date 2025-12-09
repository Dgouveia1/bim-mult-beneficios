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
        recepcao: [], 
        medicos: ['medicos-only'], 
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
        medicos: { 'menu-cartao': false, 'submenu-cartao': false, 'menu-clinica': true, 'submenu-clinica': true, 'menu-admin': false, 'submenu-admin': false },
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
        if (role === 'admin' || role === 'superadmin' || role === 'recepcao') {
            whatsappLink.style.display = 'block';
        } else {
            whatsappLink.style.display = 'none';
        }
    }

    // b) Menu Admin: Cronograma (Só Admin/Superadmin veem)
    if (role === 'recepcao') {
        const adminSubmenu = document.getElementById('submenu-admin');
        if (adminSubmenu) {
            // A recepção pode ver o menu "Marketing & Admin" (definido acima), mas NÃO o conteúdo dele
            // exceto se tivéssemos movido o WhatsApp pra lá. Como o WhatsApp foi para "Cartão",
            // podemos esconder TUDO do submenu-admin para a recepção se ela não precisar de nada lá.
            // Mas, seguindo a lógica estrita: Cronograma é Admin Only.
            
            // Esconde itens específicos do submenu Admin para recepção
            const cronogramaLink = adminSubmenu.querySelector('[data-page="cronograma"]');
            if(cronogramaLink) cronogramaLink.style.display = 'none';
            
            // (Opcional) Se não houver nada visível no submenu, esconder o menu pai também?
            // Por enquanto, deixamos o pai visível caso haja itens futuros compartilhados.
        }
    } else if (role === 'admin' || role === 'superadmin') {
        // Garante visibilidade para admins
        const cronogramaLink = document.querySelector('[data-page="cronograma"]');
        if(cronogramaLink) cronogramaLink.style.display = 'block';
    }
}

export { handleLogin, handleLogout, setupPermissions, getCurrentUserProfile, setCurrentUserProfile };
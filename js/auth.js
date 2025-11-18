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
        superadmin: ['admin-only', 'medicos-only'], // Superadmin vê tudo
        admin: ['admin-only', 'medicos-only'], // Admin vê tudo (ajuste conforme necessário)
        recepcao: [], // Recepção não vê classes especiais
        medicos: ['medicos-only'], // Médicos veem apenas 'medicos-only'
        financeiro: ['admin-only'] // Financeiro vê 'admin-only' (ajuste se necessário)
    };

    // 1. Esconde todos os elementos com classes de permissão
    document.querySelectorAll('.admin-only, .medicos-only').forEach(el => {
        el.style.display = 'none';
    });

    // 2. Mostra elementos que o role atual tem permissão para ver
    const allowedClasses = rolePermissions[role] || [];
    allowedClasses.forEach(className => {
        document.querySelectorAll(`.${className}`).forEach(el => {
            // Usa 'flex' ou 'block' dependendo do elemento para manter o layout
            // Botões (como o de disponibilidade) são 'flex' no CSS base
            if (el.tagName === 'BUTTON' || el.style.display === 'flex') {
                el.style.display = 'flex';
            } else {
                el.style.display = 'block'; // Padrão para links de menu e divs
            }
        });
    });

    // 3. Lógica específica de MENU (sidebar) - mantida como estava
    const allMenuItems = {
        'menu-cartao': true, 'submenu-cartao': true, 'menu-clinica': true,
        'submenu-clinica': true, 'menu-admin': true, 'submenu-admin': true,
    };
    const rolesPermissions = {
        superadmin: { 'menu-cartao': true, 'submenu-cartao': true, 'menu-clinica': true, 'submenu-clinica': true, 'menu-admin': true, 'submenu-admin': true },
        admin: { 'menu-cartao': true, 'submenu-cartao': true, 'menu-clinica': true, 'submenu-clinica': true, 'menu-admin': true, 'submenu-admin': true },
        recepcao: { 'menu-cartao': true, 'submenu-cartao': true, 'menu-clinica': true, 'submenu-clinica': true, 'menu-admin': false, 'submenu-admin': false },
        medicos: { 'menu-cartao': false, 'submenu-cartao': false, 'menu-clinica': true, 'submenu-clinica': true, 'menu-admin': false, 'submenu-admin': false },
        financeiro: { 'menu-cartao': false, 'submenu-cartao': false, 'menu-clinica': false, 'submenu-clinica': false, 'menu-admin': true, 'submenu-admin': true }
    };
    const userPerms = rolesPermissions[role] || {};
    for (const menuId in allMenuItems) {
        if (document.getElementById(menuId)) {
            document.getElementById(menuId).style.display = 'none';
        }
    }
    for (const menuId in userPerms) {
        if (userPerms[menuId] && document.getElementById(menuId)) {
            document.getElementById(menuId).style.display = 'block';
        }
    }
}

export { handleLogin, handleLogout, setupPermissions, getCurrentUserProfile, setCurrentUserProfile };
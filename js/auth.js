import { _supabase } from './supabase.js';
import { initializeDashboard } from './main.js';
import { showLoginScreen } from './ui.js'; // Importa do novo arquivo ui.js

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
        await initializeDashboard(data.user);
    } catch (error) {
        alert('Credenciais inválidas.');
    }
}

async function handleLogout() {
    await _supabase.auth.signOut();
    currentUserProfile = null;
    showLoginScreen(); // Agora usa a função importada de ui.js
}

function getCurrentUserProfile() {
    return currentUserProfile;
}

function setupPermissions(role) {
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
// Arquivo: js/ui.js

const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');

/**
 * Mostra a tela do dashboard e esconde a de login.
 */
function showDashboard() {
    if (loginScreen) loginScreen.style.display = 'none';
    if (dashboard) dashboard.style.display = 'flex';
}

/**
 * Mostra a tela de login, esconde o dashboard e limpa o localStorage.
 */
function showLoginScreen() {
    if (loginScreen) loginScreen.style.display = 'flex';
    if (dashboard) dashboard.style.display = 'none';
    localStorage.clear();
}

export { showDashboard, showLoginScreen };
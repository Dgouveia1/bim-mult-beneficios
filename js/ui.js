// Arquivo: js/ui.js

// Pega os elementos principais da UI uma única vez
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
 * Mostra a tela de login e esconde a do dashboard.
 */
function showLoginScreen() {
    if (loginScreen) loginScreen.style.display = 'flex';
    if (dashboard) dashboard.style.display = 'none';
    localStorage.clear();
}

// Exporta as funções para que outros módulos possam usá-las
export { showDashboard, showLoginScreen };
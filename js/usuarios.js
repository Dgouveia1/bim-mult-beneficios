import { _supabase } from './supabase.js';
import { getCurrentUserProfile } from './auth.js';

const userModal = document.getElementById('userModal');
const userForm = document.getElementById('userForm');
const userModalTitle = document.getElementById('userModalTitle');
const userIdInput = document.getElementById('userId');
const userPasswordInput = document.getElementById('userPassword');

// Carrega os usuários na tabela
async function loadUsersData() {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';

    try {
        const { data: profiles, error } = await _supabase.from('profiles').select('*').order('full_name');
        if (error) throw error;

        tableBody.innerHTML = '';
        profiles.forEach(profile => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${profile.full_name || 'N/A'}</td>
                <td>${profile.email || 'N/A'}</td>
                <td>${profile.role || 'N/A'}</td>
                <td class="actions">
                    <button class="btn btn-secondary btn-small edit-user-btn" data-id="${profile.id}">Editar</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="4" style="color:red;">Erro ao carregar usuários.</td></tr>';
    }
}

// Abre o modal para criar ou editar um usuário
async function openUserModal(id = null) {
    userForm.reset();
    userIdInput.value = '';
    
    populateRoleOptions();

    if (id) {
        // Modo Edição
        userModalTitle.textContent = 'Editar Usuário';
        userPasswordInput.required = false;
        userPasswordInput.placeholder = "Deixe em branco para não alterar";

        const { data: profile, error } = await _supabase.from('profiles').select('*').eq('id', id).single();
        if (error) return alert('Erro ao carregar dados do usuário.');

        userIdInput.value = profile.id;
        document.getElementById('userName').value = profile.full_name;
        document.getElementById('userEmail').value = profile.email;
        document.getElementById('userEmail').readOnly = true;
        document.getElementById('userRole').value = profile.role;

    } else {
        // Modo Criação
        userModalTitle.textContent = 'Adicionar Novo Usuário';
        userPasswordInput.required = true;
        userPasswordInput.placeholder = "Mínimo 6 caracteres";
        document.getElementById('userEmail').readOnly = false;
    }
    userModal.style.display = 'flex';
}

// Preenche o <select> de roles com base na permissão do usuário logado
function populateRoleOptions() {
    const userProfile = getCurrentUserProfile();
    const roleSelect = document.getElementById('userRole');
    roleSelect.innerHTML = '';

    const allRoles = {
        admin: 'Administrador',
        recepcao: 'Usuário Recepção',
        medicos: 'Usuário Clínica',
        financeiro: 'Usuário Financeiro'
    };

    let allowedRoles = [];
    if (userProfile?.role === 'superadmin') {
        allowedRoles = ['admin', 'recepcao', 'medicos', 'financeiro'];
    } else if (userProfile?.role === 'admin') {
        allowedRoles = ['recepcao', 'medicos', 'financeiro'];
    }

    if (allowedRoles.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'Sem permissão para criar usuários';
        roleSelect.appendChild(option);
        roleSelect.disabled = true;
    } else {
        roleSelect.disabled = false;
        allowedRoles.forEach(roleKey => {
            const option = document.createElement('option');
            option.value = roleKey;
            option.textContent = allRoles[roleKey];
            roleSelect.appendChild(option);
        });
    }
}

// Salva o usuário (cria um novo ou atualiza um existente) - VERSÃO SIMPLIFICADA E CORRIGIDA
async function saveUser(event) {
    event.preventDefault();
    const submitButton = userForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    const id = userIdInput.value;
    
    const userData = {
        full_name: document.getElementById('userName').value,
        email: document.getElementById('userEmail').value,
        password: document.getElementById('userPassword').value,
        role: document.getElementById('userRole').value,
    };

    try {
        if (id) {
            // Lógica de ATUALIZAÇÃO (não muda)
            const { error } = await _supabase
                .from('profiles')
                .update({ full_name: userData.full_name, role: userData.role })
                .eq('id', id);
            if (error) throw error;
            alert('Usuário atualizado com sucesso!');

        } else {
            // Lógica de CRIAÇÃO - SIMPLIFICADA
            // Agora, enviamos os dados extras dentro da chamada signUp
            const { error } = await _supabase.auth.signUp({
                email: userData.email,
                password: userData.password,
                options: {
                    data: {
                        full_name: userData.full_name,
                        role: userData.role
                    }
                }
            });
                
            if (error) throw error;
            
            alert('Usuário criado com sucesso!');
        }

        userModal.style.display = 'none';
        await loadUsersData(); // Recarrega a lista

    } catch (error) {
        alert('Erro ao salvar usuário: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Salvar';
    }
}

export { loadUsersData, openUserModal, saveUser };
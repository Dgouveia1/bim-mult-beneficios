import { _supabase } from './supabase.js';
import { getCurrentUserProfile } from './auth.js';
import { logAction } from './logger.js';
import { showToast } from './utils.js';

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

        const currentUser = getCurrentUserProfile();
        const canImpersonate = currentUser && (!currentUser.isImpersonated && (currentUser.role === 'superadmin' || currentUser.role === 'admin'));

        tableBody.innerHTML = '';
        profiles.forEach(profile => {
            const isSelf = currentUser && profile.id === currentUser.id;
            const impersonateBtnHtml = canImpersonate && !isSelf ? `<button class="btn btn-warning btn-small impersonate-btn" data-id="${profile.id}" title="Acessar como" style="margin-left: 5px;"><i class="fas fa-user-secret"></i></button>` : '';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${profile.full_name || 'N/A'}</td>
                <td>${profile.email || 'N/A'}</td>
                <td>${profile.role || 'N/A'}</td>
                <td class="actions">
                    <button class="btn btn-secondary btn-small edit-user-btn" data-id="${profile.id}">Editar</button>
                    ${impersonateBtnHtml}
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
        if (error) return showToast('Erro ao carregar dados do usuário.');

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
    const roleSelect = document.getElementById('userRole');
    roleSelect.innerHTML = '';

    const allRoles = {
        admin: 'Administrador',
        recepcao: 'Usuário Recepção',
        medicos: 'Usuário Clínica',
        dentista: 'Dentista',
        financeiro: 'Usuário Financeiro'
    };

    // Habilita o select e preenche com todas as roles disponíveis
    roleSelect.disabled = false;
    for (const roleKey in allRoles) {
        const option = document.createElement('option');
        option.value = roleKey;
        option.textContent = allRoles[roleKey];
        roleSelect.appendChild(option);
    }
}

// Salva o usuário (cria um novo ou atualiza um existente)
async function saveUser(event) {
    event.preventDefault();
    const submitButton = userForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    const id = userIdInput.value;

    const formData = new FormData(userForm);
    const userData = {
        full_name: formData.get('full_name'),
        email: formData.get('email'),
        password: formData.get('password'),
        role: formData.get('role')
    };

    try {
        if (id) {
            // Lógica de atualização
            const { error } = await _supabase
                .from('profiles')
                .update({ full_name: userData.full_name, role: userData.role })
                .eq('id', id);
            if (error) throw error;

            await logAction('UPDATE_USER', { userId: id, fullName: userData.full_name, role: userData.role });
            showToast('Usuário atualizado com sucesso!');

        } else {
            // Lógica de criação
            if (!userData.password || userData.password.length < 6) {
                throw new Error('A senha é obrigatória e deve ter no mínimo 6 caracteres.');
            }

            await logAction('CREATE_USER', { email: userData.email, fullName: userData.full_name, role: userData.role });

            const { error } = await _supabase.rpc('create_new_user', {
                p_email: userData.email,
                p_password: userData.password,
                p_full_name: userData.full_name,
                p_role: userData.role
            });

            if (error) throw error;

            showToast('Usuário criado com sucesso!');
        }

        userModal.style.display = 'none';
        await loadUsersData();

    } catch (error) {
        showToast('Erro ao salvar usuário: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Salvar';
    }
}

export { loadUsersData, openUserModal, saveUser };

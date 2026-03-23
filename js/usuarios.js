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

        // Dispara manualmente o evento de mudança para o role carregado
        const roleSelectEl = document.getElementById('userRole');
        await handleRoleChange.call(roleSelectEl);

        // Restaura a seleção de profissionais auxiliados (se for auxiliar)
        if (profile.role === 'auxiliar' && profile.assisted_professionals && Array.isArray(profile.assisted_professionals)) {
            const auxSelect = document.getElementById('auxiliarProfissionaisSelect');
            if (auxSelect) {
                Array.from(auxSelect.options).forEach(opt => {
                    opt.selected = profile.assisted_professionals.includes(opt.value);
                });
            }
        }

    } else {
        // Modo Criação
        userModalTitle.textContent = 'Adicionar Novo Usuário';
        userPasswordInput.required = true;
        userPasswordInput.placeholder = "Mínimo 6 caracteres";
        document.getElementById('userEmail').readOnly = false;
    }
    userModal.style.display = 'flex';
}

// Handler para mostrar/esconder e popular o campo de profissionais auxiliados
async function handleRoleChange() {
    const auxiliarFieldContainer = document.getElementById('auxiliarProfissionaisContainer');
    if (!auxiliarFieldContainer) return;

    if (this.value === 'auxiliar') {
        auxiliarFieldContainer.style.display = 'block';
        // Popula a lista de profissionais se ainda não foi feito
        const select = document.getElementById('auxiliarProfissionaisSelect');
        if (select && select.options.length === 0) {
            const { data: professionals, error } = await _supabase
                .from('professionals')
                .select('id, name, user_id')
                .order('name');
            if (!error && professionals) {
                professionals.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.user_id; // Usamos user_id (UUID do auth/profile) que está em profiles.id
                    opt.textContent = p.name;
                    select.appendChild(opt);
                });
            }
        }
    } else {
        auxiliarFieldContainer.style.display = 'none';
    }
}

// Preenche o <select> de roles com base na permissão do usuário logado
function populateRoleOptions() {
    const roleSelect = document.getElementById('userRole');
    roleSelect.innerHTML = '';

    const allRoles = {
        admin: 'Administrador',
        recepcao: 'Usuário Recepção',
        auxiliar: 'Auxiliar',
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

    // Listener para mostrar/esconder o campo de profissionais auxiliados
    roleSelect.removeEventListener('change', handleRoleChange);
    roleSelect.addEventListener('change', handleRoleChange);
    handleRoleChange.call(roleSelect); // Chama imediatamente para o estado atual
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
            const updateData = { full_name: userData.full_name, role: userData.role };

            // Se for auxiliar, salva os profissionais selecionados
            if (userData.role === 'auxiliar') {
                const auxSelect = document.getElementById('auxiliarProfissionaisSelect');
                if (auxSelect) {
                    updateData.assisted_professionals = Array.from(auxSelect.selectedOptions).map(o => o.value);
                }
            } else {
                // Limpa a lista se mudou de auxiliar para outro role
                updateData.assisted_professionals = [];
            }

            const { error } = await _supabase
                .from('profiles')
                .update(updateData)
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

            // Se for auxiliar, salva os profissionais imediatamente após criar
            if (userData.role === 'auxiliar') {
                const auxSelect = document.getElementById('auxiliarProfissionaisSelect');
                if (auxSelect && auxSelect.selectedOptions.length > 0) {
                    const assistedIds = Array.from(auxSelect.selectedOptions).map(o => o.value);
                    // Busca o novo usuário pelo email para pegar o ID
                    const { data: newProfile } = await _supabase
                        .from('profiles')
                        .select('id')
                        .eq('email', userData.email)
                        .single();
                    if (newProfile) {
                        await _supabase.from('profiles').update({ assisted_professionals: assistedIds }).eq('id', newProfile.id);
                    }
                }
            }

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

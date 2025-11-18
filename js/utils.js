// =================================================================================
// FUNÇÕES UTILITÁRIAS (MÁSCARAS, VALIDAÇÕES, API)
// =================================================================================

// --- MÁSCARAS DE INPUT ---

export function maskCPF(value) {
    return value
        .replace(/\D/g, '')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function maskPhone(value) {
    value = value.replace(/\D/g, '');
    value = value.replace(/^(\d{2})(\d)/g, '($1) $2');
    value = value.replace(/(\d)(\d{4})$/, '$1-$2');
    return value.slice(0, 15); // Limita o tamanho
}

// --- FUNÇÕES DE VALIDAÇÃO ---

export function validateCPF(cpf) {
    if (!cpf) return true; // Se o CPF não for preenchido, não valida (campo opcional)
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf === '' || cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let add = 0;
    for (let i = 0; i < 9; i++) add += parseInt(cpf.charAt(i)) * (10 - i);
    let rev = 11 - (add % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(cpf.charAt(9))) return false;
    add = 0;
    for (let i = 0; i < 10; i++) add += parseInt(cpf.charAt(i)) * (11 - i);
    rev = 11 - (add % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(cpf.charAt(10))) return false;
    return true;
}

export function validateEmail(email) {
    if (!email) return true; // Se o email não for preenchido, não valida
    const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

export function validatePhone(phone) {
    if (!phone) return true; // Se o telefone não for preenchido, não valida
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.length >= 10 && digitsOnly.length <= 11;
}


// --- API DE ENDEREÇO (VIACEP) ---

export async function fetchAddressByCEP(cep, formPrefix) {
    const cepOnlyNumbers = cep.replace(/\D/g, '');
    if (cepOnlyNumbers.length !== 8) return;

    const form = document.getElementById(`${formPrefix}ClientForm`);
    if(!form) return;

    const enderecoInput = form.querySelector(`[name="endereco"]`);
    const municipioInput = form.querySelector(`[name="municipio"]`);
    
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cepOnlyNumbers}/json/`);
        const data = await response.json();

        if (data.erro) {
            console.warn("CEP não encontrado.");
            return;
        }

        if (enderecoInput) enderecoInput.value = data.logouro || '';
        if (municipioInput) municipioInput.value = data.localidade || '';

    } catch (error) {
        console.error("Erro ao buscar CEP:", error);
    }
}

/**
 * Exibe uma notificação toast personalizada.
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} [type='info'] - O tipo de notificação ('success', 'error', 'info').
 */
export function showToast(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    
    let iconClass = 'fa-info-circle'; // Padrão
    if (type === 'success') {
        iconClass = 'fa-check-circle';
    } else if (type === 'error') {
        iconClass = 'fa-times-circle';
    }

    toast.innerHTML = `<i class="fas ${iconClass}"></i> <span>${message}</span>`;
    
    container.appendChild(toast);

    // Remove o toast após 4 segundos
    setTimeout(() => {
        // Inicia o fade-out
        toast.style.opacity = '0';
        // MUDADO: Em vez de deslizar para a direita, desliza para cima para sair
        toast.style.transform = 'translateY(-100px)'; 
        
        // Remove completamente do DOM após a animação
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 500); // Tempo igual à transição no CSS
    }, 4000);
}


/**
 * Exibe uma notificação de confirmação personalizada no topo da tela.
 * Retorna uma promessa que resolve como 'true' (Sim) ou 'false' (Não).
 * @param {string} message - A pergunta de confirmação.
 * @returns {Promise<boolean>}
 */
export function showConfirm(message) {
    return new Promise((resolve) => {
        const container = document.getElementById('notificationContainer');
        if (!container) {
            resolve(false); // Retorna falso se o container não existir
            return;
        }

        // Cria o elemento de confirmação
        const confirmDialog = document.createElement('div');
        confirmDialog.className = 'confirm-notification';
        
        confirmDialog.innerHTML = `
            <div class="confirm-message">
                <i class="fas fa-question-circle"></i>
                <span>${message}</span>
            </div>
            <div class="confirm-buttons">
                <button class="btn btn-secondary btn-small" id="confirmBtnNao">Não</button>
                <button class="btn btn-success btn-small" id="confirmBtnSim">Sim</button>
            </div>
        `;
        
        container.appendChild(confirmDialog);

        const btnSim = document.getElementById('confirmBtnSim');
        const btnNao = document.getElementById('confirmBtnNao');

        const closeDialog = (result) => {
            confirmDialog.style.opacity = '0';
            confirmDialog.style.transform = 'translateY(-100px)';
            setTimeout(() => {
                if (confirmDialog.parentElement) {
                    confirmDialog.parentElement.removeChild(confirmDialog);
                }
                resolve(result); // Resolve a promessa com o resultado
            }, 300); // Espera a animação de saída
        };

        // Adiciona ouvintes de clique
        btnSim.addEventListener('click', () => closeDialog(true));
        btnNao.addEventListener('click', () => closeDialog(false));
    });
}
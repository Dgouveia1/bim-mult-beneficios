// =================================================================================
// FUNÇÕES UTILITÁRIAS (MÁSCARAS, VALIDAÇÕES, API)
// =================================================================================


export function calculateAge(birthDateString) {
    if (!birthDateString) return 'N/A';
    
    // Suporta formato YYYY-MM-DD (Supabase) ou DD/MM/YYYY (Input)
    let birthDate;
    if (birthDateString.includes('/')) {
        const parts = birthDateString.split('/');
        birthDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    } else {
        birthDate = new Date(birthDateString);
    }

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    
    // Ajusta se ainda não fez aniversário este ano
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    if (isNaN(age)) return 'N/A';
    return `${age} anos`;
}

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

/**
 * Exibe um prompt de entrada personalizado no topo da tela.
 * Retorna uma promessa que resolve com o valor inserido ou null se cancelado.
 * @param {string} message - A mensagem/pergunta do prompt.
 * @param {string} [defaultValue=''] - O valor padrão do input.
 * @returns {Promise<string|null>}
 */
export function showPrompt(message, defaultValue = '') {
    return new Promise((resolve) => {
        const container = document.getElementById('notificationContainer');
        if (!container) {
            resolve(null);
            return;
        }

        const promptDialog = document.createElement('div');
        promptDialog.className = 'confirm-notification';
        
        promptDialog.innerHTML = `
            <div class="confirm-message" style="display: flex; flex-direction: column; align-items: flex-start; gap: 10px; width: 100%;">
                <div style="display: flex; gap: 10px; align-items: center;">
                    <i class="fas fa-edit"></i>
                    <span>${message}</span>
                </div>
                <input type="text" id="promptInputVal" class="form-control" value="${defaultValue}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" autocomplete="off" />
            </div>
            <div class="confirm-buttons" style="margin-top: 15px;">
                <button class="btn btn-secondary btn-small" id="promptBtnCancelar">Cancelar</button>
                <button class="btn btn-success btn-small" id="promptBtnOk">OK</button>
            </div>
        `;
        
        container.appendChild(promptDialog);

        const inputEl = document.getElementById('promptInputVal');
        const btnOk = document.getElementById('promptBtnOk');
        const btnCancelar = document.getElementById('promptBtnCancelar');

        // Focus and select text
        inputEl.focus();
        if (defaultValue) {
            inputEl.setSelectionRange(0, inputEl.value.length);
        }

        const closeDialog = (result) => {
            promptDialog.style.opacity = '0';
            promptDialog.style.transform = 'translateY(-100px)';
            setTimeout(() => {
                if (promptDialog.parentElement) {
                    promptDialog.parentElement.removeChild(promptDialog);
                }
                resolve(result);
            }, 300);
        };

        btnOk.addEventListener('click', () => closeDialog(inputEl.value));
        btnCancelar.addEventListener('click', () => closeDialog(null));
        inputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                closeDialog(inputEl.value);
            }
        });
    });
}

// Formatação de Moeda (BRL)
export function formatCurrency(value) {
    // Garante que o valor é um número; se for nulo/undefined, assume 0
    const numberValue = Number(value) || 0;
    
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(numberValue);
}

// Formatação de Data (DD/MM/AAAA)
export function formatDate(dateString) {
    if (!dateString) return '-';
    // Lida com instâncias de Date ou strings ISO
    const date = new Date(dateString);
    // Verifica se a data é válida
    if (isNaN(date.getTime())) return dateString; 
    
    return date.toLocaleDateString('pt-BR');
}

// Formatação de Data e Hora (DD/MM/AAAA HH:mm)
export function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Utilitário de Delay (útil para simular carregamento ou esperar animações)
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Validação simples de CPF (apenas formatação visual para display)
export function formatCPF(cpf) {
    if (!cpf) return '';
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

// Validação simples de Telefone
export function formatPhone(phone) {
    if (!phone) return '';
    // Remove tudo que não é dígito
    const v = phone.replace(/\D/g, "");
    
    // Formato (11) 99999-9999
    if (v.length === 11) {
        return v.replace(/^(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    }
    // Formato (11) 9999-9999
    if (v.length === 10) {
        return v.replace(/^(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    }
    return phone;
}
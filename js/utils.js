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
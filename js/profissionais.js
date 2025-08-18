import { _supabase } from './supabase.js';

const professionalModal = document.getElementById('professionalModal');
const professionalForm = document.getElementById('professionalForm');
const professionalIdInput = document.getElementById('professionalId');

// Carrega os profissionais e renderiza na tabela
async function loadProfessionalsData() {
    const tableBody = document.getElementById('professionalsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';

    try {
        const { data: professionals, error } = await _supabase
            .from('professionals')
            .select('*')
            .order('name');
        if (error) throw error;

        tableBody.innerHTML = '';
        if (professionals.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Nenhum profissional cadastrado.</td></tr>';
            return;
        }

        professionals.forEach(prof => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${prof.name}</td>
                <td>${prof.specialty || ''}</td>
                <td>${prof.CRM || ''}</td>
                <td class="actions">
                    <button class="btn btn-secondary btn-small edit-professional-btn" data-id="${prof.id}">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="4" style="color:red;">Erro ao carregar os profissionais.</td></tr>';
        console.error(error);
    }
}

// Abre o modal para editar um profissional
async function openProfessionalModal(id) {
    professionalForm.reset();
    
    try {
        const { data: prof, error } = await _supabase.from('professionals').select('*').eq('id', id).single();
        if (error) throw error;

        professionalIdInput.value = prof.id;
        document.getElementById('professionalName').value = prof.name;
        document.getElementById('professionalSpecialty').value = prof.specialty;
        document.getElementById('professionalCRM').value = prof.CRM;
        
        professionalModal.style.display = 'flex';

    } catch (error) {
        alert('Não foi possível carregar os dados do profissional.');
    }
}

// Salva as alterações do profissional
async function saveProfessional(event) {
    event.preventDefault();
    const submitButton = professionalForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    const professionalData = {
        name: document.getElementById('professionalName').value,
        specialty: document.getElementById('professionalSpecialty').value,
        CRM: document.getElementById('professionalCRM').value,
    };

    const id = professionalIdInput.value;

    try {
        const { error } = await _supabase.from('professionals').update(professionalData).eq('id', id);
        if (error) throw error;

        professionalModal.style.display = 'none';
        await loadProfessionalsData(); // Recarrega a tabela

    } catch (error) {
        alert('Erro ao salvar as alterações: ' + error.message);
    } finally {
        submitButton.disabled = false;
    }
}

export { loadProfessionalsData, openProfessionalModal, saveProfessional };
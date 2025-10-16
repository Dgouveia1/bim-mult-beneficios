import { _supabase } from './supabase.js';
import { logAction } from './logger.js';

const examModal = document.getElementById('examModal');
const examForm = document.getElementById('examForm');
const examModalTitle = document.getElementById('examModalTitle');
const examIdInput = document.getElementById('examId');

// Carrega os exames do Supabase e renderiza na tabela
async function loadLaboratoryData() {
    const tableBody = document.getElementById('examsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';

    try {
        const { data: exams, error } = await _supabase
            .from('exams')
            .select('*')
            .order('name');
        if (error) throw error;

        tableBody.innerHTML = '';
        if (exams.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Nenhum exame cadastrado.</td></tr>';
            return;
        }

        exams.forEach(exam => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${exam.name}</td>
                <td>${exam.description || ''}</td>
                <td>${exam.value ? `R$ ${exam.value.toFixed(2).replace('.', ',')}` : 'N/A'}</td>
                <td class="actions">
                    <button class="btn btn-secondary btn-small edit-exam-btn" data-id="${exam.id}">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="4" style="color:red;">Erro ao carregar os exames.</td></tr>';
        console.error(error);
    }
}

// Abre o modal para criar um novo exame ou editar um existente
async function openExamModal(id = null) {
    examForm.reset();
    examIdInput.value = '';

    if (id) {
        // Modo de Edição
        examModalTitle.textContent = 'Editar Exame';
        const { data: exam, error } = await _supabase.from('exams').select('*').eq('id', id).single();
        if (error) {
            alert('Não foi possível carregar os dados do exame.');
            return;
        }
        examIdInput.value = exam.id;
        document.getElementById('examName').value = exam.name;
        document.getElementById('examDescription').value = exam.description;
        document.getElementById('examValue').value = exam.value;

    } else {
        // Modo de Criação
        examModalTitle.textContent = 'Adicionar Novo Exame';
    }
    examModal.style.display = 'flex';
}

// Salva o exame (cria um novo ou atualiza um existente)
async function saveExam(event) {
    event.preventDefault();
    const submitButton = examForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    const examData = {
        name: document.getElementById('examName').value,
        description: document.getElementById('examDescription').value,
        value: document.getElementById('examValue').value,
    };

    const id = examIdInput.value;

    try {
        if (id) {
            // Atualiza um exame existente
            const { error } = await _supabase.from('exams').update(examData).eq('id', id);
            if (error) throw error;
            await logAction('UPDATE_EXAM', { examId: id, examName: examData.name });

        } else {
            // Cria um novo exame e retorna os dados para o log
            const { data: newExam, error } = await _supabase.from('exams').insert(examData).select().single();
            if (error) throw error;
            await logAction('CREATE_EXAM', { examId: newExam.id, examName: newExam.name });
        }
        
        examModal.style.display = 'none';
        await loadLaboratoryData(); // Recarrega a tabela

    } catch (error) {
        alert('Erro ao salvar o exame: ' + error.message);
    } finally {
        submitButton.disabled = false;
    }
}

export { loadLaboratoryData, openExamModal, saveExam };

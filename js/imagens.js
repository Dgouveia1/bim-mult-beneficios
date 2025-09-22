import { _supabase } from './supabase.js';

// (Futuramente, esta tela poderá ter um modal de edição/criação como a de laboratório)

// Carrega os exames de IMAGEM do Supabase
async function loadImageExamsData() {
    const tableBody = document.getElementById('imageExamsTableBody'); // Assumindo que haverá uma tabela no futuro
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';

    try {
        // ATENÇÃO: Estou assumindo que você criará uma tabela `image_exams` no Supabase
        // similar à tabela `exams`
        const { data: exams, error } = await _supabase
            .from('image_exams')
            .select('*')
            .order('name');
        if (error) throw error;

        tableBody.innerHTML = '';
        if (exams.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Nenhum exame de imagem cadastrado.</td></tr>';
            return;
        }

        exams.forEach(exam => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${exam.name}</td>
                <td>${exam.description || ''}</td>
                <td>${exam.value ? `R$ ${exam.value.toFixed(2).replace('.', ',')}` : 'N/A'}</td>
                <td class="actions">
                    <button class="btn btn-secondary btn-small edit-image-exam-btn" data-id="${exam.id}">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (error) {
        tableBody.innerHTML = '<tr><td colspan="4" style="color:red;">Erro ao carregar os exames de imagem.</td></tr>';
        console.error(error);
    }
}


export { loadImageExamsData };
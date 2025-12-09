import { _supabase } from './supabase.js';
import { getCurrentUserProfile } from './auth.js';
import { showToast } from './utils.js';

// Elementos do DOM
let textareaElement = null;
let lastUpdateInfoElement = null;

async function loadCronogramaData() {
    textareaElement = document.getElementById('cronogramaTexto');
    lastUpdateInfoElement = document.getElementById('cronogramaLastUpdate');

    if (!textareaElement) return;

    textareaElement.value = 'Carregando...';
    textareaElement.disabled = true;

    try {
        // Busca o registro mais recente
        const { data, error } = await _supabase
            .from('mensagem_para_disparo')
            .select('texto, created_at, profiles(full_name)') // Faz join para pegar nome do criador
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        if (data) {
            textareaElement.value = data.texto;
            
            // Formata a data e mostra quem criou
            const date = new Date(data.created_at).toLocaleString('pt-BR');
            const author = data.profiles?.full_name || 'Usuário desconhecido';
            lastUpdateInfoElement.textContent = `Última atualização por ${author} em ${date}`;
        } else {
            textareaElement.value = '';
            lastUpdateInfoElement.textContent = 'Nenhum cronograma definido ainda.';
        }

    } catch (error) {
        console.error('Erro ao carregar cronograma:', error);
        showToast('Erro ao carregar o cronograma.', 'error');
        textareaElement.value = '';
    } finally {
        textareaElement.disabled = false;
    }
}

async function saveCronograma(event) {
    event.preventDefault();
    const saveBtn = document.getElementById('saveCronogramaBtn');
    const newText = document.getElementById('cronogramaTexto').value;
    const user = getCurrentUserProfile();

    if (!newText.trim()) {
        showToast('O texto não pode estar vazio.');
        return;
    }

    if (!user) {
        showToast('Erro de autenticação. Recarregue a página.', 'error');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        // Insere um NOVO registro (histórico) em vez de atualizar
        const { error } = await _supabase
            .from('mensagem_para_disparo')
            .insert({
                texto: newText,
                criado_por: user.id
            });

        if (error) throw error;

        showToast('Cronograma salvo com sucesso!');
        // Recarrega para atualizar a info de "quem salvou"
        await loadCronogramaData();

    } catch (error) {
        console.error('Erro ao salvar cronograma:', error);
        showToast('Erro ao salvar: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Alterações';
    }
}

function setupCronogramaPage() {
    const form = document.getElementById('cronogramaForm');
    if (form) {
        // Remove listener antigo se houver (para evitar duplicidade em navegação SPA)
        form.removeEventListener('submit', saveCronograma);
        form.addEventListener('submit', saveCronograma);
    }
    loadCronogramaData();
}

export { setupCronogramaPage };
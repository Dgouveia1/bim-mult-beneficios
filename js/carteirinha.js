import { _supabase } from './supabase.js';
import { showToast } from './utils.js';

let searchTimeout = null;

/**
 * Converte uma URL de imagem para o formato Base64.
 * Essencial para embutir a imagem no PDF sem problemas de carregamento.
 * @param {string} url - A URL da imagem a ser convertida.
 * @returns {Promise<string>} Uma promessa que resolve com a string Base64 da imagem.
 */
function imageToBase64(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL);
        };
        img.onerror = reject;
        img.src = url;
    });
}


// Função principal que configura os ouvintes de eventos da página
function setupCarteirinhaPage() {
    const searchInput = document.getElementById('carteirinhaSearchInput');
    const printBtn = document.getElementById('printCarteirinhasBtn');

    if (!searchInput || !printBtn) {
        console.error('Erro: Elementos essenciais da página de carteirinha não foram encontrados.');
        return;
    }

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            const searchTerm = searchInput.value.trim();
            if (searchTerm.length > 2) {
                await searchMembers(searchTerm);
            } else {
                clearSearchResults();
            }
        }, 500);
    });
    
    printBtn.style.display = 'none';
}

// Limpa a lista de resultados da busca
function clearSearchResults() {
    const resultsList = document.getElementById('searchResults');
    if(resultsList) resultsList.innerHTML = '';
}

// Busca por titulares e dependentes no banco de dados
async function searchMembers(searchTerm) {
    const resultsList = document.getElementById('searchResults');
    if(!resultsList) return;
    resultsList.innerHTML = '<li class="search-result-item">Buscando...</li>';

    try {
        const lowerSearchTerm = searchTerm.toLowerCase();
        const searchWords = lowerSearchTerm.split(' ').filter(w => w.length > 0);

        let clientQuery = _supabase.from('clients').select('id, nome, sobrenome, cpf, created_at');
        const clientNameFilter = searchWords.map(word => `or(nome.ilike.%${word}%,sobrenome.ilike.%${word}%)`).join(',');
        const clientOrFilters = `and(${clientNameFilter}),cpf.ilike.%${lowerSearchTerm}%`;
        clientQuery = clientQuery.or(clientOrFilters);

        let dependentQuery = _supabase.from('dependents').select('id, nome, sobrenome, cpf, created_at, titular_id');
        const dependentNameFilter = searchWords.map(word => `or(nome.ilike.%${word}%,sobrenome.ilike.%${word}%)`).join(',');
        const dependentOrFilters = `and(${dependentNameFilter}),cpf.ilike.%${lowerSearchTerm}%`;
        dependentQuery = dependentQuery.or(dependentOrFilters);

        const [titularResults, dependenteResults] = await Promise.all([
            clientQuery,
            dependentQuery
        ]);

        if (titularResults.error) throw titularResults.error;
        if (dependenteResults.error) throw dependenteResults.error;

        const combinedResults = [
            ...titularResults.data.map(t => ({ ...t, type: 'titular' })),
            ...dependenteResults.data.map(d => ({ ...d, type: 'dependente' }))
        ];

        renderSearchResults(combinedResults);

    } catch (error) {
        console.error('Erro ao buscar membros:', error);
        resultsList.innerHTML = '<li class="search-result-item">Ocorreu um erro na busca.</li>';
    }
}

// Exibe os resultados da busca na tela
function renderSearchResults(results) {
    const resultsList = document.getElementById('searchResults');
    if(!resultsList) return;
    clearSearchResults();

    if (results.length === 0) {
        resultsList.innerHTML = '<li class="search-result-item">Nenhum resultado encontrado.</li>';
        return;
    }

    results.forEach(member => {
        const li = document.createElement('li');
        li.className = 'search-result-item';
        li.innerHTML = `
            <span class="result-name">${member.nome} ${member.sobrenome || ''}</span>
            <span class="result-cpf">${member.cpf || 'CPF não informado'}</span>
            <span class="result-type ${member.type}">${member.type}</span>
        `;
        li.addEventListener('click', () => generateCards(member));
        resultsList.appendChild(li);
    });
}

// Gera as carteirinhas com base no membro selecionado
async function generateCards(selectedMember) {
    clearSearchResults();
    const searchInput = document.getElementById('carteirinhaSearchInput');
    if(searchInput) searchInput.value = '';
    
    const container = document.getElementById('generatedCardsContainer');
    if(!container) return;
    container.innerHTML = '<p>Carregando carteirinhas...</p>';

    let membersToGenerate = [];

    if (selectedMember.type === 'titular') {
        const { data: dependentes, error } = await _supabase
            .from('dependents')
            .select('id, nome, sobrenome, cpf, created_at')
            .eq('titular_id', selectedMember.id);
        
        if (error) {
            console.error('Erro ao buscar dependentes:', error);
            container.innerHTML = '<p>Erro ao carregar dependentes.</p>';
            return;
        }
        membersToGenerate = [selectedMember, ...dependentes];

    } else {
        const { data: titular, error } = await _supabase
            .from('clients')
            .select('id, nome, sobrenome, cpf, created_at')
            .eq('id', selectedMember.titular_id)
            .single();

        if (error) {
            console.error('Erro ao buscar titular do dependente:', error);
            container.innerHTML = '<p>Erro ao carregar dados do titular.</p>';
            return;
        }
        const { data: todosDependentes, error: depsError } = await _supabase
            .from('dependents')
            .select('id, nome, sobrenome, cpf, created_at')
            .eq('titular_id', selectedMember.titular_id);

        if (depsError) {
             console.error('Erro ao buscar todos os dependentes:', depsError);
             container.innerHTML = '<p>Erro ao carregar grupo familiar.</p>';
             return;
        }

        membersToGenerate = [titular, ...todosDependentes];
    }
    
    container.innerHTML = ''; 

    if(membersToGenerate.length === 0) {
        container.innerHTML = '<p>Nenhum membro para gerar carteirinha.</p>';
        return;
    }

    membersToGenerate.forEach(member => {
        const cardWrapper = document.createElement('div');
        cardWrapper.className = 'card-wrapper';

        const validade = new Date(member.created_at);
        validade.setDate(validade.getDate() + 365);
        const validadeFormatada = validade.toLocaleDateString('pt-BR');

        cardWrapper.innerHTML = `
            <div class="card-info">
                <p class="card-nome">${member.nome} ${member.sobrenome || ''}</p>
                <div class="card-details">
                    <span class="card-cpf">CPF: ${member.cpf || 'N/A'}</span>
                    <span class="card-validade">Validade: ${validadeFormatada}</span>
                </div>
            </div>
            <button class="save-card-btn" title="Salvar como PDF">
                <i class="fas fa-file-pdf"></i>
            </button>
        `;
        
        cardWrapper.querySelector('.save-card-btn').addEventListener('click', async () => {
            const button = cardWrapper.querySelector('.save-card-btn');
            const originalButtonContent = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                // 1. Carrega a imagem de fundo e converte para Base64
                const imgData = await imageToBase64('imagens/CARTEIRINHA.png');
                
                // 2. Define as dimensões do PDF (padrão de cartão de crédito em mm)
                const cardWidthMM = 85.6;
                const cardHeightMM = 53.98;
                
                // 3. Cria o objeto PDF
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF({
                    orientation: 'landscape',
                    unit: 'mm',
                    format: [cardWidthMM, cardHeightMM]
                });

                // 4. Adiciona a imagem de fundo
                pdf.addImage(imgData, 'PNG', 0, 0, cardWidthMM, cardHeightMM);

                // 5. Adiciona os textos sobre a imagem
                pdf.setFont("helvetica", "bold");
                pdf.setTextColor(0, 0, 0); // Cor preta

                // Nome do membro (coordenadas em mm a partir do canto superior esquerdo)
                pdf.setFontSize(8);
                const memberName = `${member.nome} ${member.sobrenome || ''}`;
                pdf.text(memberName, 8, 32);

                // CPF e Validade
                pdf.setFontSize(7);
                pdf.text(`CPF: ${member.cpf || 'N/A'}`, 8, 48);
                pdf.text(`Validade: ${validadeFormatada}`, cardWidthMM - 8, 48, { align: 'right' });

                // 6. Salva o arquivo
                pdf.save(`carteirinha-${member.nome.toLowerCase().replace(/\s+/g, '-')}.pdf`);

            } catch (error) {
                console.error('Erro ao gerar PDF da carteirinha:', error);
                showToast('Ocorreu um erro ao gerar o PDF. Verifique o console para mais detalhes.');
            } finally {
                button.disabled = false;
                button.innerHTML = originalButtonContent;
            }
        });

        container.appendChild(cardWrapper);
    });
}

export { setupCarteirinhaPage };
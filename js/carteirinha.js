import { _supabase } from './supabase.js';

// Função para desenhar um cartão individual (seja titular ou dependente)
function drawCard(person, personType) {
    const cardWrapper = document.createElement('div');
    cardWrapper.className = 'card-wrapper';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const background = new Image();
    // Certifique-se que o caminho para a imagem está correto
    background.src = 'imagens/CARTEIRINHA.png'; 

    background.onload = () => {
        canvas.width = background.width;
        canvas.height = background.height;
        ctx.drawImage(background, 0, 0);

        // Configurações do texto (ajuste as coordenadas X, Y se necessário)
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(person.nome.toUpperCase(), 45, 235); 

        ctx.font = '20px Arial';
        ctx.fillText(`CPF: ${person.cpf || 'N/A'}`, 45, 265);
        
        canvas.dataset.personName = person.nome.replace(/\s+/g, '_');
        canvas.dataset.personType = personType;

        const title = document.createElement('p');
        title.className = 'card-title';
        title.textContent = `${person.nome} (${personType})`;
        
        cardWrapper.appendChild(title);
        cardWrapper.appendChild(canvas);
        document.getElementById('cardsContainer').appendChild(cardWrapper);
    };

    background.onerror = () => {
        console.error("Erro ao carregar a imagem de fundo da carteirinha.");
        const cardsContainer = document.getElementById('cardsContainer');
        cardsContainer.innerHTML = '<p style="color: red;">Erro: Não foi possível carregar o modelo da carteirinha. Verifique se o arquivo `imagens/CARTEIRINHA.png` existe.</p>';
    }
}

// Função principal que é chamada quando um cliente é selecionado
function generateCards(client) {
    const cardsContainer = document.getElementById('cardsContainer');
    const downloadBtn = document.getElementById('downloadCardsBtn');
    
    cardsContainer.innerHTML = ''; // Limpa cartões anteriores

    if (!client) {
        downloadBtn.style.display = 'none';
        return;
    }

    // Gerar cartão para o titular
    drawCard(client, 'titular');

    // Gerar cartões para os dependentes
    if (client.dependentes && typeof client.dependentes === 'string' && client.dependentes.startsWith('[')) {
        try {
            const dependents = JSON.parse(client.dependentes);
            if (Array.isArray(dependents)) {
                dependents.forEach(dep => {
                    if (dep.nome_dependente && dep.cpf_dependente) {
                        drawCard({ nome: dep.nome_dependente, cpf: dep.cpf_dependente }, 'dependente');
                    }
                });
            }
        } catch (e) {
            console.error("Erro ao processar dependentes:", e);
        }
    }
    
    downloadBtn.style.display = 'block';
}

// Função para baixar todos os cartões gerados
function downloadAllCards() {
    const canvases = document.querySelectorAll('#cardsContainer canvas');
    if (canvases.length === 0) {
        alert('Nenhum cartão para baixar.');
        return;
    }
    canvases.forEach((canvas, index) => {
        const personName = canvas.dataset.personName;
        const personType = canvas.dataset.personType;
        const link = document.createElement('a');
        link.download = `${personName}_(${personType})_bim.png`;
        link.href = canvas.toDataURL('image/png');
        setTimeout(() => link.click(), index * 200);
    });
}

// ==================================================================
// LÓGICA DE BUSCA ATUALIZADA AQUI
// ==================================================================
async function searchClients(query) {
    const searchResults = document.getElementById('carteirinhaSearchResults');
    searchResults.innerHTML = '';
    if (query.length < 3) {
        searchResults.style.display = 'none';
        return;
    }

    try {
        // Busca no Supabase em tempo real, assim como na página de Clientes
        const { data, error } = await _supabase
            .from('people')
            .select('nome, cpf, dependentes')
            .or(`nome.ilike.%${query}%`) // Busca pelo nome
            .limit(10); // Limita a 10 resultados para performance

        if (error) throw error;

        if (data.length > 0) {
            data.forEach(person => {
                const div = document.createElement('div');
                div.textContent = person.nome;
                div.addEventListener('click', () => {
                    document.getElementById('carteirinhaSearchInput').value = person.nome;
                    searchResults.innerHTML = '';
                    searchResults.style.display = 'none';
                    generateCards(person); // Gera os cartões para o cliente selecionado
                });
                searchResults.appendChild(div);
            });
            searchResults.style.display = 'block';
        } else {
            searchResults.style.display = 'none';
        }
    } catch (error) {
        console.error('Erro ao buscar clientes:', error);
        searchResults.style.display = 'none';
    }
}

// Configura a página e os eventos
export function setupCarteirinhaPage() {
    const searchInput = document.getElementById('carteirinhaSearchInput');
    const searchResults = document.getElementById('carteirinhaSearchResults');
    const downloadBtn = document.getElementById('downloadCardsBtn');
    
    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        // Aguarda um pouco após o usuário parar de digitar para fazer a busca
        debounceTimer = setTimeout(() => {
            searchClients(searchInput.value);
        }, 300); 
    });

    document.addEventListener('click', (e) => {
        if (!searchResults.contains(e.target) && e.target !== searchInput) {
            searchResults.style.display = 'none';
        }
    });

    downloadBtn.addEventListener('click', downloadAllCards);
}
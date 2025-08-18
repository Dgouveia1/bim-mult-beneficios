// =================================================================
// MÓDULO: FUNÇÕES DO WHATSAPP
// DESCRIÇÃO: Lógica para a página de Status de Conexão.
// =================================================================

/**
 * Busca e atualiza a interface com o status de conexão da instância do WhatsApp.
 * Esta função é chamada quando o usuário navega para a página de status.
 */
async function updateConnectionStatus() {
    // Garante que a função só execute se os elementos da página existirem
    const statusText = document.querySelector('#connectionStatus .status-text');
    const spinner = document.querySelector('#connectionStatus .spinner-small');
    const qrcodeContainer = document.getElementById('qrcodeContainer');
    const qrcodeOutput = document.getElementById('qrcodeOutput');
    const disconnectBtn = document.getElementById('disconnectBtn');

    if (!statusText || !spinner || !qrcodeContainer || !qrcodeOutput || !disconnectBtn) {
        console.error('Elementos da página de status não encontrados. A função será interrompida.');
        return;
    }

    // Reseta a interface para o estado de "carregando"
    statusText.textContent = 'VERIFICANDO...';
    spinner.style.display = 'block';
    disconnectBtn.style.display = 'none';
    qrcodeContainer.style.display = 'none';
    statusText.style.color = 'var(--pending-color)';

    try {
        const response = await fetch('https://webhook.ia-tess.com.br/webhook/conectar-whats');
        if (!response.ok) {
            throw new Error(`Erro de rede: ${response.status}`);
        }

        const data = await response.json();
        const statusInfo = data[0]; // Pega o primeiro item do array da resposta

        if (statusInfo && statusInfo.success) {
            // Caso 1: Instância está conectada e operacional
            if (statusInfo.data.instance && statusInfo.data.instance.state === 'open') {
                statusText.textContent = 'CONECTADO';
                statusText.style.color = 'var(--confirmed-color)';
                spinner.style.display = 'none';
                disconnectBtn.style.display = 'block';
                qrcodeContainer.style.display = 'none';
            
            // Caso 2: Instância precisa de um QR Code para conectar
            } else if (statusInfo.data.base64) {
                statusText.textContent = 'AGUARDANDO CONEXÃO';
                statusText.style.color = 'var(--pending-color)';
                qrcodeOutput.innerHTML = `<img src="${statusInfo.data.base64}" alt="QR Code para conectar ao WhatsApp">`;
                qrcodeContainer.style.display = 'block';
                spinner.style.display = 'none';
            
            // Caso 3: Instância está desconectada ou em outro estado
            } else {
                statusText.textContent = 'DESCONECTADO';
                statusText.style.color = 'var(--cancelled-color)';
                spinner.style.display = 'none';
            }
        } else {
            throw new Error('Resposta do webhook inválida ou sem sucesso.');
        }
    } catch (error) {
        console.error("Falha ao buscar status da conexão:", error);
        statusText.textContent = 'ERRO DE CONEXÃO';
        statusText.style.color = 'var(--cancelled-color)';
        spinner.style.display = 'none';
    }
}

/**
 * Envia um comando para o backend para desconectar a instância do WhatsApp.
 */
async function disconnectWhatsapp() {
    const disconnectBtn = document.getElementById('disconnectBtn');
    if (!disconnectBtn) {
        console.error('Botão de desconectar não encontrado.');
        return;
    }

    disconnectBtn.disabled = true;
    disconnectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Desconectando...';

    try {
        const response = await fetch('https://webhook.ia-tess.com.br/webhook/desconectar-whats', {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error("Falha ao enviar comando de desconexão.");
        }

        alert("Comando de desconexão enviado! O status será atualizado em breve.");
        setTimeout(updateConnectionStatus, 2000); // Aguarda 2s e verifica o status novamente

    } catch (error) {
        console.error('Erro na desconexão:', error);
        alert("Erro ao tentar desconectar.");
    } finally {
        disconnectBtn.disabled = false;
        disconnectBtn.innerHTML = '<i class="fas fa-power-off"></i> Desconectar';
    }
}
// =================================================================
// MÓDULO DE DISPAROS
// Função: Lógica para a página de envio de mensagens.
// =================================================================

/**
 * Lida com o envio do formulário de disparos.
 * Coleta todos os dados, incluindo a imagem, e prepara para o envio.
 * @param {Event} event - O evento de submit do formulário.
 */
async function handleDisparoSubmit(event) {
    console.log('📢 [DISPAROS] Iniciando envio de disparo...');
    
    // 1. Previne o recarregamento da página
    event.preventDefault();
    console.log('🛡️ [DISPAROS] Prevenção de recarregamento aplicada');

    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    
    if (!submitButton) {
        console.error('❌ [DISPAROS] Botão de submit não encontrado');
        return;
    }
    
    console.log('⏳ [DISPAROS] Desabilitando botão e mostrando loading...');
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    // 2. Coleta os dados do formulário
    console.log('📋 [DISPAROS] Coletando dados do formulário...');
    const mensagem = form.querySelector('#mensagem')?.value || '';
    const imagemInput = form.querySelector('#imagem');
    const imagemFile = imagemInput?.files[0]; // Pega o arquivo de imagem

    console.log('📊 [DISPAROS] Dados coletados:', {
        mensagemLength: mensagem.length,
        hasImagem: !!imagemFile,
        imagemSize: imagemFile ? `${(imagemFile.size / 1024).toFixed(2)} KB` : 'N/A'
    });

    // 3. Validação simples
    if (!mensagem || mensagem.trim().length === 0) {
        console.error('❌ [DISPAROS] Mensagem não preenchida');
        alert('Por favor, preencha a mensagem.');
        submitButton.disabled = false;
        submitButton.textContent = 'Enviar Mensagem';
        return;
    }

    // 4. Monta o payload usando FormData para suportar o arquivo de imagem
    console.log('📦 [DISPAROS] Montando FormData...');
    const formData = new FormData();
    formData.append('mensagem', mensagem);

    if (imagemFile) {
        console.log('🖼️ [DISPAROS] Adicionando imagem ao FormData:', imagemFile.name);
        formData.append('imagem', imagemFile);
    }
    
    console.log('🌐 [DISPAROS] Enviando para webhook...');
    // Futuramente, aqui entrará a chamada real para o n8n:
    try {
        const response = await fetch('https://webhook.ia-tess.com.br/webhook/mult-disparos', {
            method: 'POST',
            body: formData 
            // Note: Não definimos o Content-Type, o browser faz isso automaticamente para FormData
        });
        
        console.log('📥 [DISPAROS] Resposta recebida:', {
            status: response.status,
            ok: response.ok
        });
        
        if (response.ok) {
            console.log('✅ [DISPAROS] Disparo enviado com sucesso!');
            alert('Disparo enviado com sucesso!');
            form.reset();
        } else {
            console.error('❌ [DISPAROS] Erro ao enviar disparo - Status:', response.status);
            alert('Houve um erro ao enviar o disparo.');
        }
    } catch(error) {
        console.error('💥 [DISPAROS] Erro de conexão:', error);
        alert('Erro de conexão ao tentar enviar o disparo.');
    } finally {
        console.log('🔄 [DISPAROS] Restaurando botão...');
        submitButton.disabled = false;
        submitButton.textContent = 'Enviar Mensagem';
    }
}

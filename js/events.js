// =================================================================
// CONFIGURAÇÃO DOS EVENT LISTENERS
// =================================================================

function setupEventListeners() {
    console.log('⚙️ [EVENTS] Iniciando configuração de event listeners...');
    
    // Formulário de Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        console.log('🔐 [EVENTS] Configurando listener para formulário de login');
        loginForm.addEventListener('submit', handleLoginSubmit);
    } else {
        console.warn('⚠️ [EVENTS] Formulário de login não encontrado');
    }

    // Navegação da Sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        console.log('🍽️ [EVENTS] Configurando listener para sidebar');
        sidebar.addEventListener('click', (e) => {
            const clickedItem = e.target.closest('.menu-item, .submenu-item');
            if (!clickedItem) return;
            
            const hasDataPage = clickedItem.hasAttribute('data-page');
            const isSubmenuTrigger = !hasDataPage && clickedItem.classList.contains('menu-item');

            if (hasDataPage) {
                e.preventDefault();
                const pageName = clickedItem.getAttribute('data-page');
                console.log('🧭 [EVENTS] Navegação clicada para:', pageName);
                navigateToPage(pageName);
            }
            
            if (isSubmenuTrigger) {
                console.log('📂 [EVENTS] Submenu trigger clicado');
                const submenu = clickedItem.closest('.admin-only')?.querySelector('.submenu') || clickedItem.nextElementSibling;
                submenu?.classList.toggle('active');
            }
        });
    } else {
        console.warn('⚠️ [EVENTS] Sidebar não encontrada');
    }

    // Eventos no Conteúdo Principal (delegação de eventos)
    const mainContent = document.getElementById('mainContent');
    if (mainContent) {
        console.log('📄 [EVENTS] Configurando delegação de eventos no conteúdo principal');
        mainContent.addEventListener('click', function(e) {
            // Botão de Desconectar WhatsApp
            if (e.target.id === 'disconnectBtn') {
                console.log('📱 [EVENTS] Botão de desconectar WhatsApp clicado');
                if (confirm('Tem certeza que deseja desconectar?')) {
                    disconnectWhatsapp();
                }
            }
            
            // Abas da página de Pacientes
            if (e.target.matches('#areaAtendimento .atendimento-botoes .btn')) {
                const abaAlvo = e.target.dataset.aba;
                console.log('🔄 [EVENTS] Aba de atendimento clicada:', abaAlvo);
                
                document.querySelectorAll('#areaAtendimento .atendimento-botoes .btn').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('#areaAtendimento .aba-conteudo').forEach(aba => aba.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(`aba${abaAlvo.charAt(0).toUpperCase() + abaAlvo.slice(1)}`).classList.add('active');
            }
            
            // Seleção de Paciente na Fila
            if (e.target.closest('.paciente-espera-item')) {
                console.log('👤 [EVENTS] Paciente selecionado na fila');
                document.querySelectorAll('.paciente-espera-item').forEach(item => item.classList.remove('active'));
                e.target.closest('.paciente-espera-item').classList.add('active');
            }
            
            // Botão Finalizar Consulta
            if (e.target.matches('#areaAtendimento .atendimento-actions .btn-success')) {
                console.log('🏁 [EVENTS] Botão finalizar consulta clicado');
                finalizarConsulta();
            }
        });
    } else {
        console.warn('⚠️ [EVENTS] Conteúdo principal não encontrado');
    }

    // Eventos de Modais
    console.log('🪟 [EVENTS] Configurando eventos de modais...');
    setupModalEvents();
    
    // Eventos de Formulários
    console.log('📝 [EVENTS] Configurando eventos de formulários...');
    setupFormEvents();
    
    console.log('✅ [EVENTS] Configuração de event listeners concluída!');
}

function setupModalEvents() {
    console.log('🪟 [EVENTS] Configurando eventos de modais...');
    
    // Modal de Agendamento
    const newAppointmentBtn = document.getElementById('newAppointmentBtn');
    const closeAppointmentModal = document.getElementById('closeAppointmentModal');
    const cancelAppointmentBtn = document.getElementById('cancelAppointmentBtn');
    
    if (newAppointmentBtn) {
        console.log('➕ [EVENTS] Configurando botão novo agendamento');
        newAppointmentBtn.addEventListener('click', () => {
            console.log('📅 [EVENTS] Abrindo modal de agendamento');
            document.getElementById('appointmentModal').style.display = 'flex';
        });
    }
    
    if (closeAppointmentModal) {
        console.log('❌ [EVENTS] Configurando botão fechar modal de agendamento');
        closeAppointmentModal.addEventListener('click', () => {
            console.log('📅 [EVENTS] Fechando modal de agendamento');
            document.getElementById('appointmentModal').style.display = 'none';
        });
    }
    
    if (cancelAppointmentBtn) {
        console.log('🚫 [EVENTS] Configurando botão cancelar agendamento');
        cancelAppointmentBtn.addEventListener('click', () => {
            console.log('📅 [EVENTS] Cancelando modal de agendamento');
            document.getElementById('appointmentModal').style.display = 'none';
        });
    }
    
    // Modal de Pagamento
    const closePaymentModal = document.getElementById('closePaymentModal');
    const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
    
    if (closePaymentModal) {
        console.log('❌ [EVENTS] Configurando botão fechar modal de pagamento');
        closePaymentModal.addEventListener('click', closePaymentModal);
    }
    
    if (cancelPaymentBtn) {
        console.log('🚫 [EVENTS] Configurando botão cancelar pagamento');
        cancelPaymentBtn.addEventListener('click', closePaymentModal);
    }
    
    console.log('✅ [EVENTS] Eventos de modais configurados');
}

function setupFormEvents() {
    console.log('📝 [EVENTS] Configurando eventos de formulários...');
    
    // Formulário de Agendamento
    const appointmentForm = document.getElementById('appointmentForm');
    if (appointmentForm) {
        console.log('📅 [EVENTS] Configurando formulário de agendamento');
        appointmentForm.addEventListener('submit', saveAppointment);
    }
    
    // Formulário de Disparos
    const disparoForm = document.getElementById('disparoForm');
    if (disparoForm) {
        console.log('📢 [EVENTS] Configurando formulário de disparos');
        disparoForm.addEventListener('submit', handleDisparoSubmit);
    }

    // Listener para a barra de pesquisa de clientes
    const clientsSearchInput = document.getElementById('clientsSearchInput');
    if (clientsSearchInput) {
        clientsSearchInput.addEventListener('input', () => {
            // Adiciona um pequeno delay para evitar buscas a cada tecla
            clearTimeout(clientsSearchInput.searchTimeout);
            clientsSearchInput.searchTimeout = setTimeout(() => {
                filterAndRenderClients();
            }, 300); // 300ms de delay
        });
    }
    
    // Toggle de Visualização
    const viewButtons = document.querySelectorAll('.btn-view');
    console.log('👁️ [EVENTS] Configurando', viewButtons.length, 'botões de visualização');
    
    viewButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            console.log('👁️ [EVENTS] Botão de visualização clicado:', this.textContent.trim());
            document.querySelectorAll('.btn-view').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    console.log('✅ [EVENTS] Eventos de formulários configurados');
} 
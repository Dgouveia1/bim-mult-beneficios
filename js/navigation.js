// =================================================================
// NAVEGAÇÃO E CARREGAMENTO DE PÁGINAS
// =================================================================

function navigateToPage(pageName) {
    console.log('🧭 [NAV] Navegando para página:', pageName);
    
    // Remove active de todas as páginas
    const allPages = document.querySelectorAll('.page-content');
    console.log('📄 [NAV] Páginas encontradas:', allPages.length);
    
    allPages.forEach(page => {
        const wasActive = page.classList.contains('active');
        page.classList.remove('active');
        if (wasActive) {
            console.log('🔴 [NAV] Removendo active de:', page.id);
        }
    });
    
    const targetPage = document.getElementById(`${pageName}Page`);
    if (targetPage) {
        console.log('✅ [NAV] Página de destino encontrada:', targetPage.id);
        targetPage.classList.add('active');
        console.log('🟢 [NAV] Página ativada:', targetPage.id);
    } else {
        console.error('❌ [NAV] Página não encontrada:', `${pageName}Page`);
    }

    // Remove active de todos os itens do menu
    const menuItems = document.querySelectorAll('.menu-item, .submenu-item');
    console.log('🍽️ [NAV] Itens de menu encontrados:', menuItems.length);
    
    menuItems.forEach(item => {
        const wasActive = item.classList.contains('active');
        item.classList.remove('active');
        if (wasActive) {
            console.log('🔴 [NAV] Removendo active de menu item:', item.textContent.trim());
        }
    });
    
    const activeMenuItem = document.querySelector(`[data-page="${pageName}"]`);
    if (activeMenuItem) {
        console.log('🎯 [NAV] Item de menu encontrado:', activeMenuItem.textContent.trim());
        activeMenuItem.classList.add('active');
        
        const parentSubmenu = activeMenuItem.closest('.submenu');
        if (parentSubmenu && parentSubmenu.previousElementSibling.classList.contains('menu-item')) {
            console.log('📂 [NAV] Ativando submenu pai');
            parentSubmenu.previousElementSibling.classList.add('active');
        }
    } else {
        console.warn('⚠️ [NAV] Item de menu não encontrado para:', pageName);
    }

    // Carrega dados específicos da página
    console.log('📊 [NAV] Carregando dados específicos da página:', pageName);
    
    if (pageName === 'usuarios') { 
        console.log('👥 [NAV] Carregando dados de usuários...');
        loadUsers(); 
    } else if (pageName === 'recepcao') { 
        console.log('🏥 [NAV] Carregando dados de recepção...');
        loadReceptionQueue(); 
    } else if (pageName === 'status') { 
        console.log('📱 [NAV] Carregando status do WhatsApp...');
        updateConnectionStatus(); 
    } else if (pageName === 'agenda') {
        console.log('📅 [NAV] Carregando agenda...');
        loadScheduleView();
    } else if (pageName === 'pacientes') {
        console.log('👨‍⚕️ [NAV] Carregando dados de pacientes...');
        loadPatientsData();
    } else if (pageName === 'clientes') {
        console.log('👥 [NAV] Carregando dados de clientes...');
        loadClientsData();
    } else if (pageName === 'laboratorio') {
        console.log('🔬 [NAV] Carregando dados de laboratório...');
        loadLaboratoryData();
    } else if (pageName === 'produtos') {
        console.log('📦 [NAV] Carregando dados de produtos...');
        loadProductsData();
    } else if (pageName === 'financeiro') {
        console.log('💰 [NAV] Carregando dados financeiros...');
        loadFinancialData();
    } else if (pageName === 'disparos') {
        console.log('📢 [NAV] Carregando dados de disparos...');
        loadDisparosData();
    }
    
    console.log('✅ [NAV] Navegação concluída para:', pageName);
} 
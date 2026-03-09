import { _supabase } from './supabase.js';
import { showToast, showConfirm } from './utils.js';
import { openModal } from './clientes.js'; // To open modals easily if needed

let allPedidos = [];
let currentPedidoId = null;

export function setupExamesPage() {
    loadPedidosExames();
    setupEventListeners();
}

function setupEventListeners() {
    const searchInput = document.getElementById('examesSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const termo = e.target.value.toLowerCase();
            const filtered = allPedidos.filter(p =>
                p.paciente_nome.toLowerCase().includes(termo) ||
                p.paciente_cpf.toLowerCase().includes(termo) ||
                p.medico_nome.toLowerCase().includes(termo)
            );
            renderPedidosTable(filtered);
        });
    }

    document.getElementById('refreshExamesBtn')?.addEventListener('click', loadPedidosExames);

    document.getElementById('examesListTable')?.addEventListener('click', (e) => {
        const btnDetalhes = e.target.closest('.btn-detalhes-pedido');
        if (btnDetalhes) {
            abrirDetalhesPedido(btnDetalhes.dataset.id);
        }
    });

    const fileUpload = document.getElementById('resultadoExameUpload');
    if (fileUpload) {
        fileUpload.addEventListener('change', handleResultadoUpload);
    }

    document.getElementById('btnConcluirPedidoExame')?.addEventListener('click', marcarPedidoConcluido);

    document.querySelectorAll('.print-segunda-via-btn').forEach(btn => {
        btn.addEventListener('click', handleSegundaViaPrint);
    });
}

async function loadPedidosExames() {
    const tbody = document.getElementById('examesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando pedidos de exames...</td></tr>';

    try {
        const { data, error } = await _supabase
            .from('pedidos_exames')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        allPedidos = data || [];
        renderPedidosTable(allPedidos);
    } catch (err) {
        console.error("Erro ao carregar exames:", err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Erro ao carregar os pedidos.</td></tr>';
    }
}

function renderPedidosTable(pedidos) {
    const tbody = document.getElementById('examesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (pedidos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum pedido de exame encontrado.</td></tr>';
        return;
    }

    pedidos.forEach(p => {
        const dataFormatada = new Date(p.created_at).toLocaleDateString('pt-BR');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dataFormatada}</td>
            <td>${p.paciente_nome}</td>
            <td>${p.paciente_cpf}</td>
            <td>${p.medico_nome}</td>
            <td>
                <span class="status-badge status-${p.status === 'Concluído' ? 'active' : 'inactive'}">
                    ${p.status}
                </span>
            </td>
            <td>
                <button class="btn btn-small btn-secondary btn-detalhes-pedido" data-id="${p.id}">
                    <i class="fas fa-eye"></i> Detalhes
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function abrirDetalhesPedido(id) {
    const pedido = allPedidos.find(p => p.id === id);
    if (!pedido) return;

    currentPedidoId = id;

    document.getElementById('detalhePedidoExameId').value = id;
    document.getElementById('detalhePedidoPaciente').textContent = pedido.paciente_nome;
    document.getElementById('detalhePedidoCPF').textContent = pedido.paciente_cpf;
    document.getElementById('detalhePedidoMedico').textContent = pedido.medico_nome;
    document.getElementById('detalhePedidoData').textContent = new Date(pedido.created_at).toLocaleDateString('pt-BR');

    const statusEl = document.getElementById('detalhePedidoStatus');
    statusEl.textContent = pedido.status;
    statusEl.style.color = pedido.status === 'Concluído' ? 'green' : 'orange';

    // Lista Lab
    let labs = [];
    try { labs = typeof pedido.exames_lab_solicitados === 'string' ? JSON.parse(pedido.exames_lab_solicitados) : pedido.exames_lab_solicitados; } catch (e) { }
    const ulLab = document.getElementById('detalheExamesLabLista');
    const btn2aViaLab = document.querySelector('.print-segunda-via-btn[data-type="lab"]');
    ulLab.innerHTML = '';
    if (labs && labs.length > 0) {
        labs.forEach(ex => { ulLab.innerHTML += `<li>${ex.name}</li>`; });
        if (btn2aViaLab) btn2aViaLab.style.display = 'inline-block';
    } else {
        ulLab.innerHTML = '<li>Nenhum exame laboratorial solicitado.</li>';
        if (btn2aViaLab) btn2aViaLab.style.display = 'none';
    }

    // Lista Img
    let imgs = [];
    try { imgs = typeof pedido.exames_img_solicitados === 'string' ? JSON.parse(pedido.exames_img_solicitados) : pedido.exames_img_solicitados; } catch (e) { }
    const ulImg = document.getElementById('detalheExamesImgLista');
    const btn2aViaImg = document.querySelector('.print-segunda-via-btn[data-type="img"]');
    ulImg.innerHTML = '';
    if (imgs && imgs.length > 0) {
        imgs.forEach(ex => { ulImg.innerHTML += `<li>${ex.name}</li>`; });
        if (btn2aViaImg) btn2aViaImg.style.display = 'inline-block';
    } else {
        ulImg.innerHTML = '<li>Nenhum exame de imagem solicitado.</li>';
        if (btn2aViaImg) btn2aViaImg.style.display = 'none';
    }

    renderAnexosPedido(pedido);

    const modal = document.getElementById('pedidoExamesModal');
    if (modal) modal.style.display = 'flex';
}

function renderAnexosPedido(pedido) {
    let anexos = [];
    try { anexos = typeof pedido.anexos_resultados === 'string' ? JSON.parse(pedido.anexos_resultados) : pedido.anexos_resultados; } catch (e) { }
    if (!anexos) anexos = [];

    const ul = document.getElementById('detalheAnexosLista');
    ul.innerHTML = '';

    if (anexos.length === 0) {
        ul.innerHTML = '<li>Nenhum resultado anexado ainda.</li>';
    } else {
        anexos.forEach(anexo => {
            const { data } = _supabase.storage.from('resultados-exames').getPublicUrl(anexo.path);
            ul.innerHTML += `<li><a href="${data.publicUrl}" target="_blank"><i class="fas fa-file-download"></i> ${anexo.name}</a></li>`;
        });
    }
}

async function handleResultadoUpload(event) {
    const file = event.target.files[0];
    if (!file || !currentPedidoId) return;

    const pedido = allPedidos.find(p => p.id === currentPedidoId);
    if (!pedido) return;

    const statusDiv = document.getElementById('resultadoUploadStatus');
    statusDiv.textContent = `Enviando ${file.name}...`;

    const pacienteNome = pedido.paciente_nome.replace(/\s+/g, '_');
    const filePath = `exames_pedidos/${pacienteNome}/${currentPedidoId}/${Date.now()}-${file.name}`;

    try {
        const { error: uploadError } = await _supabase.storage.from('resultados-exames').upload(filePath, file);
        if (uploadError) throw uploadError;

        let anexos = [];
        try { anexos = typeof pedido.anexos_resultados === 'string' ? JSON.parse(pedido.anexos_resultados) : pedido.anexos_resultados; } catch (e) { }
        if (!anexos || !Array.isArray(anexos)) anexos = [];

        anexos.push({ name: file.name, path: filePath });

        const { error: updateError } = await _supabase
            .from('pedidos_exames')
            .update({ anexos_resultados: JSON.stringify(anexos) })
            .eq('id', currentPedidoId);

        if (updateError) throw updateError;

        statusDiv.textContent = 'Upload concluído com sucesso!';

        pedido.anexos_resultados = JSON.stringify(anexos); // update local cash
        renderAnexosPedido(pedido);

    } catch (err) {
        console.error("Erro no upload:", err);
        statusDiv.textContent = `Erro no upload: ${err.message}`;
    } finally {
        event.target.value = ''; // Reset file input
    }
}

async function marcarPedidoConcluido() {
    if (!currentPedidoId) return;

    const pedido = allPedidos.find(p => p.id === currentPedidoId);
    if (!pedido) return;

    if (pedido.status === 'Concluído') {
        showToast("Pedido já está marcado como concluído.");
        return;
    }

    const confirm = await showConfirm("Marcar este pedido de exame como Concluído?");
    if (!confirm) return;

    try {
        const { error } = await _supabase
            .from('pedidos_exames')
            .update({ status: 'Concluído' })
            .eq('id', currentPedidoId);

        if (error) throw error;

        showToast("Pedido marcado como concluído.");

        // Atualiza a UI imediatamente
        pedido.status = 'Concluído';
        document.getElementById('detalhePedidoStatus').textContent = 'Concluído';
        document.getElementById('detalhePedidoStatus').style.color = 'green';
        renderPedidosTable(allPedidos);

    } catch (err) {
        showToast("Erro ao concluir pedido: " + err.message, "error");
    }
}

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
        img.onerror = error => reject(error);
        img.src = url;
    });
}

async function handleSegundaViaPrint(e) {
    if (!currentPedidoId) return;
    const pedido = allPedidos.find(p => p.id === currentPedidoId);
    if (!pedido) return;

    const btn = e.target.closest('.print-segunda-via-btn');
    const type = btn.dataset.type; // 'lab' ou 'img'

    let examList = [];
    if (type === 'lab') {
        try { examList = typeof pedido.exames_lab_solicitados === 'string' ? JSON.parse(pedido.exames_lab_solicitados) : pedido.exames_lab_solicitados; } catch (err) { }
    } else {
        try { examList = typeof pedido.exames_img_solicitados === 'string' ? JSON.parse(pedido.exames_img_solicitados) : pedido.exames_img_solicitados; } catch (err) { }
    }

    if (!examList || examList.length === 0) return;

    const originalButtonText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgData = await imageToBase64('imagens/padra_impressao.png');

        const createPageLayout = (title) => {
            pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(16);
            pdf.setTextColor('#3a506b');
            pdf.text(title.toUpperCase(), 105, 45, { align: 'center' });
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);
            pdf.setTextColor('#333333');
            pdf.text(`Paciente: ${pedido.paciente_nome}`, 20, 65);
            pdf.text(`CPF: ${pedido.paciente_cpf}`, 20, 72);
            pdf.text(`Endereço: N/A`, 20, 79); // endereco nao consta neste DB, default N/A
            pdf.text('_________________________________________', 105, 250, { align: 'center' });
            pdf.setFont('helvetica', 'bold');
            pdf.text(pedido.medico_nome, 105, 257, { align: 'center' });
            pdf.setFont('helvetica', 'normal');
            // Busca CRM se possivel, neste escopo temos o profissional_id
            pdf.text(`2ª VIA DO PEDIDO ORIGINAL`, 105, 264, { align: 'center' });
        };

        if (type === 'lab') {
            createPageLayout('PEDIDO DE EXAMES LABORATORIAIS');
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);

            const itemsPerColumn = 28;
            if (examList.length > itemsPerColumn) {
                const midPoint = Math.ceil(examList.length / 2);
                const firstColumn = examList.slice(0, midPoint).map(exam => `- ${exam.name}`).join('\n');
                const secondColumn = examList.slice(midPoint).map(exam => `- ${exam.name}`).join('\n');
                pdf.text(pdf.splitTextToSize(firstColumn, 85), 20, 95);
                pdf.text(pdf.splitTextToSize(secondColumn, 85), 110, 95);
            } else {
                const examNamesText = examList.map(exam => `- ${exam.name}`).join('\n');
                const textLines = pdf.splitTextToSize(examNamesText, 170);
                pdf.text(textLines, 20, 95);
            }
        } else {
            createPageLayout('PEDIDO DE EXAMES DE IMAGEM');
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);

            const itemsPerColumn = 28;
            if (examList.length > itemsPerColumn) {
                const midPoint = Math.ceil(examList.length / 2);
                const firstColumn = examList.slice(0, midPoint).map(exam => `- ${exam.name}`).join('\n');
                const secondColumn = examList.slice(midPoint).map(exam => `- ${exam.name}`).join('\n');
                pdf.text(pdf.splitTextToSize(firstColumn, 85), 20, 95);
                pdf.text(pdf.splitTextToSize(secondColumn, 85), 110, 95);
            } else {
                const examNamesText = examList.map(exam => `- ${exam.name}`).join('\n');
                const textLines = pdf.splitTextToSize(examNamesText, 170);
                pdf.text(textLines, 20, 95);
            }
        }

        const fileName = `2a_via_pedido_${type}_${pedido.paciente_nome.replace(/\s+/g, '_')}.pdf`;
        pdf.save(fileName);

    } catch (err) {
        console.error('Erro ao gerar PDF de 2a via:', err);
        showToast('Ocorreu um erro ao gerar a 2ª via.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalButtonText;
    }
}

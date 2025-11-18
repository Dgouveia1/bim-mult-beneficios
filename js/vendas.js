import { _supabase } from './supabase.js';
import { validateCPF, validateEmail, validatePhone } from './utils.js';
import { logAction } from './logger.js';
import { showToast } from './utils.js';

let dependenteVendaCount = 0;

/**
 * Converte uma URL de imagem para o formato Base64.
 * Essencial para embutir a imagem no PDF.
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

/**
 * Formata uma data do tipo "dd/mm/aaaa" para "aaaa-mm-dd" (padrão Supabase)
 */
function formatDateForSupabase(dateString) {
    if (!dateString || !dateString.includes('/')) return null;
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;
    let year = parts[2];
    if (year.length === 2) {
        year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${parts[1]}-${parts[0]}`;
}


function addVendaDependenteField(container) {
    if (dependenteVendaCount >= 6) {
        showToast("É permitido no máximo 6 dependentes.");
        return;
    }
    dependenteVendaCount++;
    const id = dependenteVendaCount;

    const html = `
        <div class="dependente-form-group" data-dependente-new-id="${id}">
            <hr>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4>Novo Dependente ${id}</h4>
                <button type="button" class="btn btn-danger btn-small remove-dependente-btn">Remover</button>
            </div>
            <div class="form-row">
                <div class="form-group"><label>Nome</label><input type="text" name="dependente_nome_${id}" required></div>
                <div class="form-group"><label>Sobrenome</label><input type="text" name="dependente_sobrenome_${id}" required></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label>CPF</label><input type="text" name="dependente_cpf_${id}" maxlength="14"></div>
                <div class="form-group"><label>Data de Nascimento</label><input type="text" name="dependente_data_nascimento_${id}" placeholder="dd/mm/aaaa"></div>
            </div>
        </div>`;
    container.insertAdjacentHTML('beforeend', html);
}

async function handleNewSaleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');

    const titularFormData = new FormData(form);
    const titularFormProps = Object.fromEntries(titularFormData);

    if (titularFormProps.cpf && !validateCPF(titularFormProps.cpf)) {
        showToast('O CPF do titular é inválido!');
        return;
    }
    if (titularFormProps.email && !validateEmail(titularFormProps.email)) {
        showToast('O Email do titular é inválido!');
        return;
    }
    if (titularFormProps.telefone && !validatePhone(titularFormProps.telefone)) {
        showToast('O Telefone do titular parece inválido! Deve ter 10 ou 11 dígitos.');
        return;
    }

    const titularData = {
        nome: titularFormProps.nome,
        sobrenome: titularFormProps.sobrenome,
        telefone: titularFormProps.telefone,
        cpf: titularFormProps.cpf,
        email: titularFormProps.email,
        data_nascimento: titularFormProps.data_nascimento,
        plano: titularFormProps.plano,
        status: titularFormProps.status,
        cep: titularFormProps.cep,
        endereco: titularFormProps.endereco,
        municipio: titularFormProps.municipio,
        observacao: titularFormProps.observacao,

    };

    const dependentesData = [];
    for (let i = 1; i <= dependenteVendaCount; i++) {
        const nome = titularFormProps[`dependente_nome_${i}`];
        if (nome) {
            const dependente = {
                nome: nome,
                sobrenome: titularFormProps[`dependente_sobrenome_${i}`],
                cpf: titularFormProps[`dependente_cpf_${i}`],
                data_nascimento: titularFormProps[`dependente_data_nascimento_${i}`],
            };
            if (dependente.cpf && !validateCPF(dependente.cpf)) {
                showToast(`O CPF do dependente ${dependente.nome} é inválido!`);
                return;
            }
            dependentesData.push(dependente);
        }
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        const { data: newTitular, error: titularError } = await _supabase
            .from('clients')
            .insert({
                ...titularData,
                data_nascimento: formatDateForSupabase(titularData.data_nascimento)
            })
            .select()
            .single();

        if (titularError) throw titularError;
        
        await logAction('CREATE_SALE', { clientId: newTitular.id, clientName: `${newTitular.nome} ${newTitular.sobrenome}` });

        if (dependentesData.length > 0) {
            const dependentesParaSalvar = dependentesData.map(dep => ({
                ...dep,
                titular_id: newTitular.id,
                data_nascimento: formatDateForSupabase(dep.data_nascimento)
            }));

            const { error: dependentesError } = await _supabase
                .from('dependents')
                .insert(dependentesParaSalvar);

            if (dependentesError) throw dependentesError;
        }

        showToast('Venda registrada com sucesso! Gerando contrato...');
        // Passa o objeto 'titular' completo e os dependentes
        await generateContractPDF(newTitular, dependentesData);
        form.reset();
        document.getElementById('vendasDependentesContainer').innerHTML = '';
        dependenteVendaCount = 0;

    } catch (error) {
        showToast('Erro ao salvar venda: ' + error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-file-pdf"></i> Salvar e Gerar Contrato';
    }
}

/**
 * CORREÇÃO: Função de geração de PDF atualizada para melhor formatação
 * e inclusão de assinaturas.
 */
async function generateContractPDF(titular, dependentes) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const margin = 20;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const usableWidth = pageWidth - (margin * 2);
    let y = margin; // Posição vertical inicial

    // --- Helper para texto justificado ---
    const addWrappedText = (text, x, startY, maxWidth, lineHeight, isJustified = false) => {
        const lines = pdf.splitTextToSize(text, maxWidth);
        if (isJustified) {
             pdf.text(lines, x, startY, { align: 'justify', maxWidth: maxWidth });
        } else {
             pdf.text(lines, x, startY);
        }
        return startY + (lines.length * lineHeight);
    };

    try {
        // --- 1. ADICIONAR LOGO ---
        // Usando a logo dos arquivos. Ajuste o caminho se necessário.
        const logoBase64 = await imageToBase64('Logo_para_Marca_d_Água_MULTSAÚDE_Símbolo_(Laranja).png');
        pdf.addImage(logoBase64, 'PNG', margin, y, 30, 30); // Logo de 30x30mm
        y += 40; // Espaço após a logo

        // --- 2. TÍTULO ---
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS "BIM MULT BENEFICIOS"', pageWidth / 2, y, { align: 'center' });
        y += 15;

        // --- 3. DADOS DAS PARTES ---
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('CONTRATADA:', margin, y);
        pdf.setFont('helvetica', 'normal');
        y = addWrappedText(
            'BIM MULT BENEFICIOS, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 37.054.912/0001-56, com sede na Av. Amadeu Bizelli, 1315 – Centro, Fernandópolis - SP, CEP 15600-000.',
            margin, y + 5, usableWidth, 5, true
        );
        y += 10;
        
        pdf.setFont('helvetica', 'bold');
        pdf.text('CONTRATANTE:', margin, y);
        pdf.setFont('helvetica', 'normal');
        y = addWrappedText(
            `${titular.nome.toUpperCase()} ${titular.sobrenome.toUpperCase()}, inscrito(a) no CPF sob o nº ${titular.cpf}, data de nasc. ${titular.data_nascimento ? titular.data_nascimento.split('-').reverse().join('/') : 'N/A'}, residente e domiciliado(a) em ${titular.endereco || 'N/A'}, ${titular.municipio || 'N/A'} - SP, Telefone: ${titular.telefone || 'N/A'}.`,
            margin, y + 5, usableWidth, 5, true
        );
        y += 10;

        y = addWrappedText(
            'Pelo presente CONTRATO DE PRESTAÇÃO DE SERVIÇOS, as partes acima qualificadas têm, entre si, justo e contratado o que se segue:',
            margin, y, usableWidth, 5, true
        );
        y += 10;

        // --- 4. CLÁUSULAS ---
        const clausulas = [
            { title: 'CLÁUSULA 1ª – DO OBJETO', text: 'O presente contrato tem por objeto a prestação dos serviços descritos e detalhados no Anexo 1 deste instrumento. O Anexo compõe o presente contrato e são parte integrante deste, independentemente de transcrição, declarando-se o (a) CONTRATANTE ciente de seu inteiro teor.' },
            { title: 'CLÁUSULA 2ª – DA CARÊNCIA PARA UTILIZAÇÃO DOS BENEFÍCIOS:', text: 'O acesso aos benefícios e/ou às coberturas garantidas neste contrato somente terão efeito após o cumprimento dos prazos e condições descritos no Anexo 2. O (a) CONTRATANTE declara-se ciente de que há a possibilidade de necessidade de reiteração no cumprimento do prazo de carência em caso de inadimplemento, conforme prazos e condições dispostas no Anexo do presente contrato.' },
            { title: 'CLÁUSULA 3ª – DO PRAZO E DO PAGAMENTO', text: 'O presente contrato vigerá pelo prazo de 12 (doze) meses, contados a partir da assinatura do mesmo, sendo tal período renovado automaticamente, por iguais e sucessivos períodos, desde que não haja manifestação expressa de alguma das partes acerca da intenção de não renovação. Os valores a serem cumprido pela parte CONTRATANTE são aqueles discriminados em seu cadastro junto a CONTRATADA, de acordo com o plano, termos e condições e serviços escolhidos pelo cliente no momento da contratação. Essas informações podem ser solicitadas pelo (a) CONTRATANTE a qualquer momento. O atraso em qualquer das parcelas mensais acarretará o acréscimo de multa de 2% (dois por cento) ao mês e juros moratórios diários de 0,33% (zero vírgula trinta e três por cento). O valor do presente contrato será reajustado anualmente, pelo IGP-M da FGV ou, na hipótese de extinção deste, pelo índice que vier a substituí-lo. O(s) pagamento(s) de mensalidade(s) referente(s) a mês(es) posterior(es) ao de uma ou mais mensalidades vencidas não quita(m) eventuais débitos anteriores.' },
            { title: 'CLÁUSULA 4ª – DA RESCISÃO', text: 'O presente contrato poderá ser rescindido de pleno direito, antes de seu termo final, mediante notificação prévia da parte interessada, por escrito, com antecedência mínima de 30 (trinta) dias. No caso de pedido de rescisão, terá o (a) CONTRATANTE a obrigação de arcar com todos os valores devidos durante o período de aviso prévio de 30 (trinta) dias. No caso de cancelamento deverá ser efetuado por escrito para a BIM MULT BENEFICIOS, na Avenida Amadeu Bizelli, 1315 – Centro Fernandópolis – SP.'},
            { title: 'CLÁUSULA 5ª – DAS CONDIÇÕES GERAIS', text: 'O (A) CONTRATANTE declara que leu, compreendeu e aceitou o presente Contrato em todos seus termos e condições, de forma livre e independente de qualquer dolo, coação, fraude ou reserva mental. As definições necessárias e as condições específicas para a utilização das coberturas previstas neste contrato está nos respectivos Anexos, que fazem parte integrante do presente contrato.'},
            { title: 'CLÁUSULA 6ª – DO FORO:', text: 'As partes elegem o foro do domicilio de Fernandópolis para dirimir qualquer controvérsia oriunda do presente contrato. Por estarem justas e acordadas, as Partes assinam este Instrumento em duas vias de igual teor e forma.'}
        ];

        pdf.setFontSize(10);
        clausulas.forEach(clausula => {
            if (y > 250) { // Verifica se precisa de nova página
                pdf.addPage();
                y = margin;
            }
            pdf.setFont('helvetica', 'bold');
            y = addWrappedText(clausula.title, margin, y, usableWidth, 5);
            y += 2;
            pdf.setFont('helvetica', 'normal');
            y = addWrappedText(clausula.text, margin, y, usableWidth, 5, true); // Justificado
            y += 7;
        });

        if (y > 220) { // Pula para nova página se tiver pouco espaço para assinaturas
            pdf.addPage();
            y = margin;
        }

        // --- 5. DATA E LOCAL ---
        const today = new Date();
        pdf.text(`Fernandópolis - SP, ${today.toLocaleDateString('pt-BR')}`, pageWidth / 2, y + 10, { align: 'center' });
        y += 25;

        // --- 6. ASSINATURAS ---
        pdf.text('________________________________________', margin, y);
        pdf.text('________________________________________', pageWidth / 2 + 10, y);
        y += 5;

        pdf.setFont('helvetica', 'bold');
        pdf.text('CONTRATANTE', margin, y);
        pdf.text('CONTRATADA', pageWidth / 2 + 10, y);
        y += 5;
        
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${titular.nome.toUpperCase()} ${titular.sobrenome.toUpperCase()}`, margin, y);
        pdf.text('BIM MULT BENEFICIOS', pageWidth / 2 + 10, y);
        y += 5;
        
        pdf.text(`CPF: ${titular.cpf}`, margin, y);
        pdf.text('CNPJ: 37.054.912/0001-56', pageWidth / 2 + 10, y);
        y += 10;


        // --- 7. PÁGINA DE ANEXOS ---
        pdf.addPage();
        y = margin;
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.text('Anexo I - DISCRIMINAÇÃO DOS SERVIÇOS E BENEFICIÁRIOS', pageWidth / 2, y, { align: 'center' });
        y += 15;
        
        const tableData = [[
            `${titular.nome} ${titular.sobrenome}`,
            titular.cpf,
            titular.data_nascimento ? titular.data_nascimento.split('-').reverse().join('/') : 'N/A',
            titular.plano,
            'TITULAR'
        ]];

        dependentes.forEach(d => {
            tableData.push([
                `${d.nome} ${d.sobrenome}`,
                d.cpf || 'N/A',
                d.data_nascimento || 'N/A', // Vem como dd/mm/aaaa do form
                titular.plano,
                'DEPENDENTE'
            ]);
        });

        pdf.autoTable({
            startY: y,
            head: [['Nome', 'CPF', 'Data Nascimento', 'Plano', 'Parentesco']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [30, 77, 107] } // Azul escuro (var(--secondary-dark))
        });
        
        y = pdf.autoTable.previous.finalY + 10;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        y = addWrappedText('Composto pelos produtos: BIM PLANO FAMILIAR (composto por no máximo 7 (sete) pessoas. Carência – 1 dia útil.', margin, y, usableWidth, 5, true);
        y += 5;
        y = addWrappedText('Inadimplência: O não pagamento da “Parcela Mensal” transcorrido o lapso de quinze (15) dias, computados ininterruptamente a partir da data do vencimento da obrigação, sem que haja sido efetuado o cumprimento da obrigação contratual, será facultado à Empresa – CONTRATADA, suspender as disponibilizações dos “Serviços” que se presta a servir ao(s) Beneficiário(s) inscritos.', margin, y, usableWidth, 5, true);
        y += 10;
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.text('ANEXO 2 - DOS BENEFÍCIOS', pageWidth / 2, y, { align: 'center' });
        y += 10;
        
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        const anexo2Text = '1. A CONTRATADA terá direito a acesso a uma rede de profissionais de saúde, incluindo médicos de diversas especialidades e odontologia com descontos especiais sobre os honorários, cobrados.\n2. A CONTRATADA também terá acesso a exames laboratoriais e de imagem com descontos previamente estabelecidos, conforme tabela de preços que será disponibilizada pelo CONTRATANTE.\n3. Os descontos aplicáveis serão informados a CONTRATADA no momento da solicitação dos serviços e poderão variar de acordo com a especialidade e o tipo de exame.\n4. A CONTRATADA concorda em seguir os procedimentos necessários para agendamento e realização dos serviços, conforme as orientações do CONTRATANTE.\n5. O CONTRATANTE se reserva o direito de atualizar a lista de médicos e exames disponíveis, bem como os respectivos descontos, mediante aviso prévio a CONTRATADA.';
        y = addWrappedText(anexo2Text, margin, y, usableWidth, 5, true);

        // --- 8. SALVAR O PDF ---
        pdf.save(`contrato-${titular.nome.toLowerCase().replace(/\s/g, '_')}.pdf`);

    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        showToast("Não foi possível gerar o PDF. Verifique se a imagem da logo está acessível.");
    }
}

function setupVendasPage() {
    const form = document.getElementById('newSaleForm');
    if (!form) return;
    
    // Verifica se os listeners já foram anexados
    if (form.dataset.listenerAttached) return;

    form.addEventListener('submit', handleNewSaleSubmit);
    
    document.getElementById('addVendaDependenteBtn').addEventListener('click', () => {
        addVendaDependenteField(document.getElementById('vendasDependentesContainer'));
    });

    form.dataset.listenerAttached = 'true';
}

export { setupVendasPage };


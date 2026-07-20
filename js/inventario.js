import { db, appId } from './firebase-config.js';
import { collection, onSnapshot, doc, setDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { state } from './state.js';
import { abrirVistoria } from './inspecao.js';

// Cache do Firestore é importado do estado centralizado
const gridExtintores = document.getElementById('gridExtintores');
const secInventario = document.getElementById('secInventario');
const secCategorias = document.getElementById('secCategorias');
const secDetalhes = document.getElementById('secDetalhes');
const backToInventarioBtn = document.getElementById('backToInventarioBtn');
const backToCategoriasBtn = document.getElementById('backToCategoriasBtn');
const tituloInventario = document.getElementById('tituloInventario');

const badgeExtintores = document.getElementById('badgeExtintores');
const badgeHidrantes = document.getElementById('badgeHidrantes');

let currentCategory = null;

// Inicializa a escuta em tempo real do banco
let unsubInventario = null;
let unsubInspecoes = null;
let unsubHidrantes = null;

export function startInventarioSync() {
    if (unsubInventario) unsubInventario();
    if (unsubInspecoes) unsubInspecoes();
    if (unsubHidrantes) unsubHidrantes();

    const colInventario = collection(db, 'artifacts', appId, 'public', 'data', 'inventario');
    unsubInventario = onSnapshot(colInventario, (snapshot) => {
        state.inventarioCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateBadges();
        renderInventario();
    });

    const colHidrantes = collection(db, 'artifacts', appId, 'public', 'data', 'hidrantes');
    unsubHidrantes = onSnapshot(colHidrantes, (snapshot) => {
        state.hidrantesCache = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                categoria: 'Hidrante',
                local: data.localizacao || data.local || '',
                tipo: (data.polegada || data.tamanhoMangueira) ? `${data.polegada || ''} - ${data.tamanhoMangueira || ''}` : (data.tipo || '')
            };
        });
        updateBadges();
        renderInventario();
    });

    const colInspecoes = collection(db, 'artifacts', appId, 'public', 'data', 'inspecoes');
    unsubInspecoes = onSnapshot(colInspecoes, (snapshot) => {
        state.inspecoesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInventario();
    });
}

export function stopInventarioSync() {
    if (unsubInventario) { unsubInventario(); unsubInventario = null; }
    if (unsubInspecoes) { unsubInspecoes(); unsubInspecoes = null; }
    if (unsubHidrantes) { unsubHidrantes(); unsubHidrantes = null; }
}

function updateBadges() {
    if (!badgeExtintores || !badgeHidrantes) return;
    const qtdExtintores = state.inventarioCache.filter(e => !e.categoria || e.categoria === 'Extintor').length;
    const qtdHidrantes = state.hidrantesCache.length;
    
    badgeExtintores.innerText = `${qtdExtintores} itens`;
    badgeHidrantes.innerText = `${qtdHidrantes} itens`;
}

// Navegação de Categorias
const cardCatExtintores = document.getElementById('cardCatExtintores');
if (cardCatExtintores) {
    cardCatExtintores.onclick = () => {
        currentCategory = 'Extintor';
        if(tituloInventario) tituloInventario.innerText = 'Inventário - Extintores';
        if(secCategorias) secCategorias.classList.add('hidden');
        if(secInventario) secInventario.classList.remove('hidden');
        renderInventario();
    };
}

const cardCatHidrantes = document.getElementById('cardCatHidrantes');
if (cardCatHidrantes) {
    cardCatHidrantes.onclick = () => {
        currentCategory = 'Hidrante';
        if(tituloInventario) tituloInventario.innerText = 'Inventário - Hidrantes';
        if(secCategorias) secCategorias.classList.add('hidden');
        if(secInventario) secInventario.classList.remove('hidden');
        renderInventario();
    };
}

if (backToCategoriasBtn) {
    backToCategoriasBtn.onclick = () => {
        secInventario.classList.add('hidden');
        secCategorias.classList.remove('hidden');
    };
}

// Renderiza a lista de cards
function renderInventario() {
    if (!gridExtintores || !currentCategory) return;
    gridExtintores.innerHTML = '';

    const searchExtInput = document.getElementById('searchExtInput');
    const termoBusca = searchExtInput ? searchExtInput.value.toLowerCase() : '';

    // Junta os dois caches
    const todosElementos = [...state.inventarioCache, ...state.hidrantesCache];

    // Filtra pela categoria atual (considera 'Extintor' se não houver categoria, para retrocompatibilidade)
    const inventarioFiltrado = todosElementos.filter(ext => {
        const cat = ext.categoria || 'Extintor';
        const isMatchCategoria = (cat === currentCategory);
        const isMatchBusca = termoBusca === '' || ext.id.toLowerCase().includes(termoBusca);
        return isMatchCategoria && isMatchBusca;
    });

    // Ordenação alfanumérica crescente correta
    const inventarioOrdenado = [...inventarioFiltrado].sort((a, b) => 
        a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' })
    );

    // Evento de busca contínua
    if (searchExtInput && !searchExtInput.hasAttribute('data-listener-attached')) {
        searchExtInput.setAttribute('data-listener-attached', 'true');
        searchExtInput.oninput = () => renderInventario();
    }

    if (inventarioOrdenado.length === 0) {
        gridExtintores.innerHTML = '<p class="text-slate-500 text-xs text-center py-4">Nenhum elemento encontrado.</p>';
        return;
    }

    inventarioOrdenado.forEach(ext => {
        const historicoExt = state.inspecoesCache
            .filter(i => i.idExtintor === ext.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        const ultimaInspecao = historicoExt[0];

        // Status Visual
        let statusTag = `<span class="text-[9px] font-black bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-md uppercase">Sem Vistoria</span>`;
        let proxVistoriaHTML = '';
        
        if (ultimaInspecao) {
            const temErro = ultimaInspecao.conformidade && Object.values(ultimaInspecao.conformidade).includes('Não Conforme');
            statusTag = temErro 
                ? `<span class="text-[9px] font-black bg-red-500/10 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md uppercase">Com Pendências</span>`
                : `<span class="text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md uppercase">Conforme</span>`;
            
            if (ultimaInspecao.vencimentoRecarga) {
                // Formata a data de YYYY-MM-DD para DD/MM/YYYY
                const partesData = ultimaInspecao.vencimentoRecarga.split('-');
                if(partesData.length === 3) {
                    const dataFormatada = `${partesData[2]}/${partesData[1]}/${partesData[0]}`;
                    proxVistoriaHTML = `<p class="text-[10px] text-slate-400 font-medium mt-1"><i class="fa-regular fa-calendar-days mr-1"></i> Próx. Recarga/Vistoria: <span class="text-white">${dataFormatada}</span></p>`;
                }
            }
        }

        const card = document.createElement('div');
        card.className = "bg-nibt-card border border-nibt-border rounded-xl p-4 flex justify-between items-center hover:border-red-500/30 transition-all cursor-pointer";
        card.innerHTML = `
            <div class="space-y-1 w-full pr-4">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-black text-white bg-nibt-dark px-2 rounded border border-nibt-border">${ext.id}</span>
                    ${statusTag}
                </div>
                <p class="text-xs text-slate-300 font-bold">${ext.local}</p>
                ${proxVistoriaHTML}
            </div>
            <i class="fa-solid fa-chevron-right text-slate-600"></i>
        `;
        card.onclick = () => verDetalhes(ext, historicoExt);
        gridExtintores.appendChild(card);
    });
}

// Exibe detalhes
function verDetalhes(ext, historicoExt) {
    secInventario.classList.add('hidden');
    secDetalhes.classList.remove('hidden');
    const ultimaInspecao = historicoExt[0];

    const dataHojeStr = new Date().toISOString().split('T')[0];
    const vistoriaHoje = ultimaInspecao && ultimaInspecao.dataInspecao === dataHojeStr;

    let dataRevisaoFormatada = 'N/A';
    let dataRecargaFormatada = 'N/A';
    let avaliador = 'N/A';
    let notasOperador = '';

    if (ultimaInspecao) {
        if (ultimaInspecao.dataInspecao) {
            const p = ultimaInspecao.dataInspecao.split('-');
            if (p.length === 3) dataRevisaoFormatada = `${p[2]}/${p[1]}/${p[0]}`;
        }
        if (ultimaInspecao.vencimentoRecarga) {
            const p = ultimaInspecao.vencimentoRecarga.split('-');
            if (p.length === 3) dataRecargaFormatada = `${p[2]}/${p[1]}/${p[0]}`;
        }
        avaliador = ultimaInspecao.nomeBrigadista || 'N/A';
        notasOperador = ultimaInspecao.observacoes || '';
    }

    let statusHtml = `<div class="bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-slate-500 text-[10px] font-bold">Aguardando Vistoria</div>`;
    
    if (ultimaInspecao && ultimaInspecao.conformidade) {
        const reprovados = Object.entries(ultimaInspecao.conformidade)
            .filter(([key, val]) => val === 'Não Conforme')
            .map(([key]) => key);

        if (reprovados.length > 0) {
            statusHtml = `
                <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <p class="text-red-400 text-xs font-black uppercase mb-1 flex items-center gap-1"><i class="fa-solid fa-xmark"></i> Com Pendências</p>
                    ${reprovados.map(i => `<p class="text-red-300 text-[10px] font-medium">- ${i}</p>`).join('')}
                </div>
            `;
        } else {
            statusHtml = `<div class="bg-[#0f2e21] border border-[#1b4a36] rounded-lg p-2 text-center text-[#34d399] text-[10px] font-bold"><i class="fa-solid fa-check-circle mr-1"></i> 100% em Conformidade (Nenhum defeito)</div>`;
        }
    }

    document.getElementById('detalhesExtintorCard').innerHTML = `
        <div class="bg-slate-800 rounded-[20px] p-5 relative shadow-2xl border border-slate-700/50">
            
            <button class="absolute top-4 right-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 p-2 rounded-lg transition-all border border-red-500/20">
                <i class="fa-regular fa-trash-can text-sm"></i>
            </button>

            <div class="mb-5">
                <span class="bg-red-500/20 text-red-400 text-[10px] font-black px-2 py-0.5 rounded uppercase">${ext.categoria === 'Hidrante' ? 'HID' : 'EXT'}</span>
                <h2 class="text-white text-xl font-black mt-1 uppercase leading-tight">${ext.local || 'N/A'}</h2>
                <p class="text-slate-400 text-xs font-medium uppercase tracking-wide">${ext.tipo || 'N/A'}</p>
            </div>

            <div class="space-y-4">
                <div>
                    <h3 class="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-2">ÚLTIMO DIAGNÓSTICO</h3>
                    
                    <div class="bg-slate-900/50 rounded-xl p-3 border border-slate-700/50 space-y-2">
                        <div class="flex justify-between text-[11px]">
                            <span class="text-slate-400 font-medium">Última Revisão:</span>
                            <span class="text-white font-bold">${dataRevisaoFormatada}</span>
                        </div>
                        <div class="flex justify-between text-[11px]">
                            <span class="text-slate-400 font-medium">Avaliador:</span>
                            <span class="text-red-400 font-bold uppercase">${avaliador}</span>
                        </div>
                        <div class="flex justify-between text-[11px]">
                            <span class="text-slate-400 font-medium">Prox. Recarga:</span>
                            <span class="text-white font-bold">${dataRecargaFormatada}</span>
                        </div>
                    </div>
                </div>

                <div>
                    <h3 class="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-2">STATUS DE REPARO:</h3>
                    ${statusHtml}
                </div>

                ${notasOperador ? `
                <div>
                    <h3 class="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-2">NOTAS DO OPERADOR:</h3>
                    <div class="bg-slate-900/50 rounded-xl p-3 border border-slate-700/50 text-slate-300 text-xs italic">
                        ${notasOperador}
                    </div>
                </div>
                ` : ''}

            </div>

            <button id="btnIniciarVistoriaDireta" 
                class="w-full mt-6 py-3 rounded-xl shadow-lg transition-all text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2
                ${vistoriaHoje ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed border border-slate-600/50' : 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-600'}"
                ${vistoriaHoje ? 'disabled' : ''}>
                ${vistoriaHoje ? '<i class="fa-solid fa-shield"></i> VISTORIA CONCLUÍDA HOJE' : 'FAZER NOVA VISTORIA'}
            </button>
        </div>
    `;

    document.getElementById('btnIniciarVistoriaDireta').onclick = () => {
        if (vistoriaHoje) return;
        secDetalhes.classList.add('hidden');
        abrirVistoria(ext);
    };
}

// Botão voltar do painel de detalhes
if (backToInventarioBtn) {
    backToInventarioBtn.onclick = () => {
        secDetalhes.classList.add('hidden');
        secInventario.classList.remove('hidden');
    };
}

// --- MODAL DE CADASTRO DE NOVO ELEMENTO ---
const addElementoModal = document.getElementById('addElementoModal');
const openAddElementoModalBtn = document.getElementById('openAddElementoModalBtn');
const closeAddElementoModalBtn = document.getElementById('closeAddElementoModalBtn');
const addElementoForm = document.getElementById('addElementoForm');
const newCategoria = document.getElementById('newCategoria');
const newElementId = document.getElementById('newElementId');
const newElementLocal = document.getElementById('newElementLocal');
const newElementTipo = document.getElementById('newElementTipo');

if (openAddElementoModalBtn) {
    openAddElementoModalBtn.onclick = () => addElementoModal.classList.remove('hidden');
}

if (closeAddElementoModalBtn) {
    closeAddElementoModalBtn.onclick = () => {
        addElementoForm.reset();
        addElementoModal.classList.add('hidden');
    };
}

// --- MODAL DE EXPORTAÇÃO DE RELATÓRIOS ---
const exportRelatoriosModal = document.getElementById('exportRelatoriosModal');
const openExportModalBtn = document.getElementById('openExportModalBtn');
const closeExportModalBtn = document.getElementById('closeExportModalBtn');
const btnExportPDF = document.getElementById('btnExportPDF');
const btnExportExcel = document.getElementById('btnExportExcel');

if (openExportModalBtn) {
    openExportModalBtn.onclick = () => exportRelatoriosModal.classList.remove('hidden');
}

if (closeExportModalBtn) {
    closeExportModalBtn.onclick = () => exportRelatoriosModal.classList.add('hidden');
}

const MAP_CHECKLIST = {
    'acesso': 'Desobstrucao e Acesso',
    'sinalizacaoParede': 'Sinalizacao de Parede (Placa)',
    'sinalizacaoPiso': 'Sinalizacao de Piso (Pintura)',
    'suporte': 'Suporte e Altura de Fixacao',
    'cilindro': 'Casco / Cilindro Sem Corrosao',
    'instrucoes': 'Quadro de Instrucoes Legivel',
    'mangueira': 'Mangueira e Bico / Difusor',
    'lacre': 'Lacre de Seguranca Intacto',
    'trava': 'Trava de Seguranca / Pino',
    'manometro': 'Manometro na Faixa Verde'
};

function formatarDataBR(dataStr) {
    if (!dataStr || dataStr === 'N/A') return 'N/A';
    try {
        const partes = dataStr.split('-');
        if (partes.length === 3) {
            return `${partes[2]}/${partes[1]}/${partes[0]}`;
        }
    } catch(e) {}
    return dataStr;
}

if (btnExportPDF) {
    btnExportPDF.onclick = () => {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            const todosElementos = [...state.inventarioCache, ...state.hidrantesCache];
            const listaInspecoes = [];
            
            todosElementos.forEach(ext => {
                const historicoExt = state.inspecoesCache
                    .filter(i => i.idExtintor === ext.id)
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                if (historicoExt.length > 0) {
                    const ultima = historicoExt[0];
                    listaInspecoes.push({
                        idExtintor: ext.id,
                        local: ext.local || 'Local não especificado',
                        tipo: ext.tipoKgL || ext.tipo || 'Tipo não especificado',
                        nomeBrigadista: ultima.nomeBrigadista || 'N/A',
                        dataInspecao: ultima.dataInspecao || 'N/A',
                        vencimentoRecarga: ultima.vencimentoRecarga || 'N/A',
                        vencimentoHidrostatico: ultima.vencimentoHidrostatico || 'N/A',
                        observacoes: ultima.observacoes || '',
                        conformidade: ultima.conformidade || {}
                    });
                }
            });

            // Ordenação numérica pelo código
            listaInspecoes.sort((a, b) => {
                const numA = parseInt((a.idExtintor.match(/\d+/) || [9999])[0]);
                const numB = parseInt((b.idExtintor.match(/\d+/) || [9999])[0]);
                return numA - numB;
            });

            const conformes = [];
            const naoConformes = [];

            listaInspecoes.forEach(item => {
                const temErro = item.conformidade && Object.values(item.conformidade).includes('Não Conforme');
                if (temErro || Object.keys(item.conformidade).length === 0) {
                    naoConformes.push(item);
                } else {
                    conformes.push(item);
                }
            });

            const total = listaInspecoes.length;
            const taxa = total > 0 ? Math.round((conformes.length / total) * 100) : 0;

            // Design do Header
            doc.setFillColor(22, 30, 49);
            doc.rect(0, 0, 210, 32, 'F');
            doc.setFillColor(239, 68, 68);
            doc.rect(0, 31, 210, 1, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(15);
            doc.text('NIBT BRIGADA - RELATORIO DE VISTORIAS', 10, 12);
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text('Controle de Inventario, Validade e Conformidade de Equipamentos', 10, 20);

            const agora = new Date();
            const dataHoraGeracao = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.text(`Gerado em: ${dataHoraGeracao}`, 200, 12, { align: 'right' });

            // Dashboard de Métricas
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.rect(10, 40, 190, 22, 'FD');

            doc.setTextColor(100, 116, 139);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.text('TOTAL INSPECIONADOS', 33.75, 46, { align: 'center' });
            doc.text('EM CONFORMIDADE', 81.25, 46, { align: 'center' });
            doc.text('NAO CONFORMES', 128.75, 46, { align: 'center' });
            doc.text('TAXA DE CONFORMIDADE', 176.25, 46, { align: 'center' });

            doc.setTextColor(30, 41, 59);
            doc.setFontSize(12);
            doc.text(String(total), 33.75, 55, { align: 'center' });
            doc.setTextColor(16, 185, 129);
            doc.text(String(conformes.length), 81.25, 55, { align: 'center' });
            doc.setTextColor(239, 68, 68);
            doc.text(String(naoConformes.length), 128.75, 55, { align: 'center' });
            doc.setTextColor(30, 41, 59);
            doc.text(`${taxa}%`, 176.25, 55, { align: 'center' });

            let yOffset = 72;

            // Seção de Não Conformes
            doc.setTextColor(185, 28, 28);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text('1. DETALHES DE EQUIPAMENTOS NAO CONFORMES (ACAO REQUERIDA)', 10, yOffset);
            yOffset += 6;

            if (naoConformes.length === 0) {
                doc.setTextColor(100, 116, 139);
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(10);
                doc.text('Parabens! Nenhum equipamento apresenta pendencias ou inconformidades.', 10, yOffset);
                yOffset += 10;
            } else {
                naoConformes.forEach(item => {
                    if (yOffset > 250) { doc.addPage(); yOffset = 45; }

                    // Card de Não Conformidade
                    doc.setFillColor(254, 226, 226);
                    doc.setDrawColor(252, 165, 165);
                    doc.rect(10, yOffset, 190, 7, 'FD');

                    doc.setTextColor(153, 27, 27);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8.5);
                    doc.text(` ${item.idExtintor} - ${item.local}  (${item.tipo})  |  Brigadista: ${item.nomeBrigadista}  |  Data: ${formatarDataBR(item.dataInspecao)}`, 12, yOffset + 4.8);
                    yOffset += 7;

                    doc.setDrawColor(252, 165, 165);
                    doc.setFillColor(255, 255, 255);
                    
                    // Corpo do Card
                    const pendencias = Object.entries(item.conformidade)
                        .filter(([k, v]) => v === 'Não Conforme')
                        .map(([k]) => MAP_CHECKLIST[k] || k);
                    
                    let cardHeight = 10;
                    if (pendencias.length > 0) {
                        cardHeight += 5 + (pendencias.length * 4);
                    }
                    if (item.observacoes.trim()) {
                        cardHeight += 6;
                    }

                    doc.rect(10, yOffset, 190, cardHeight);
                    doc.setTextColor(51, 65, 85);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);
                    
                    doc.text(`Vencimento Recarga: ${formatarDataBR(item.vencimentoRecarga)}   |   Teste Hidrostatico: ${formatarDataBR(item.vencimentoHidrostatico)}`, 13, yOffset + 5.5);
                    let lineY = yOffset + 10;

                    if (pendencias.length > 0) {
                        doc.setTextColor(220, 38, 38);
                        doc.setFont('helvetica', 'bold');
                        doc.text('PENDENCIAS IDENTIFICADAS:', 13, lineY);
                        doc.setFont('helvetica', 'normal');
                        lineY += 4.5;
                        pendencias.forEach(p => {
                            doc.text(`- ${p}`, 16, lineY);
                            lineY += 4;
                        });
                    } else {
                        doc.setTextColor(220, 38, 38);
                        doc.setFont('helvetica', 'bold');
                        doc.text('PENDENCIAS IDENTIFICADAS: Sem dados de checklist ou vistoria nao finalizada.', 13, lineY);
                        lineY += 4.5;
                    }

                    if (item.observacoes.trim()) {
                        doc.setTextColor(100, 116, 139);
                        doc.setFont('helvetica', 'italic');
                        doc.text(`Observacoes: ${item.observacoes}`, 13, lineY);
                    }

                    yOffset += cardHeight + 4;
                });
            }

            // Seção de Conformes
            if (yOffset > 220) { doc.addPage(); yOffset = 45; }
            yOffset += 4;
            doc.setTextColor(21, 128, 61);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text('2. DETALHES DE EQUIPAMENTOS EM CONFORMIDADE (OK)', 10, yOffset);
            yOffset += 6;

            if (conformes.length === 0) {
                doc.setTextColor(100, 116, 139);
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(10);
                doc.text('Nenhum equipamento em conformidade no momento.', 10, yOffset);
            } else {
                const colunas = ["Codigo", "Localizacao", "Tipo/Especificacao", "Brigadista", "Vistoria", "Recarga"];
                const linhas = conformes.map(item => [
                    item.idExtintor,
                    item.local,
                    item.tipo,
                    item.nomeBrigadista,
                    formatarDataBR(item.dataInspecao),
                    formatarDataBR(item.vencimentoRecarga)
                ]);

                doc.autoTable({
                    head: [colunas],
                    body: linhas,
                    startY: yOffset,
                    margin: { left: 10, right: 10 },
                    theme: 'striped',
                    styles: { fontSize: 7.5, font: 'helvetica' },
                    headStyles: { fillColor: [21, 128, 61], textColor: [255, 255, 255], fontStyle: 'bold' },
                    alternateRowStyles: { fillColor: [248, 250, 252] }
                });
            }

            doc.save('Relatorio_Vistorias_Brigada.pdf');
            exportRelatoriosModal.classList.add('hidden');
            window.showModal("Exportado!", "Relatório PDF gerado e baixado com sucesso.", "success");

        } catch (err) {
            console.error("Erro ao gerar PDF", err);
            window.showModal("Erro", "Houve uma falha ao compilar o PDF.", "error");
        }
    };
}

if (btnExportExcel) {
    btnExportExcel.onclick = () => {
        try {
            const todosElementos = [...state.inventarioCache, ...state.hidrantesCache];
            const dataSheet = [];

            todosElementos.forEach(ext => {
                const historicoExt = state.inspecoesCache
                    .filter(i => i.idExtintor === ext.id)
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                const ultima = historicoExt[0] || {};
                const conformidade = ultima.conformidade || {};
                const isConf = Object.keys(conformidade).length > 0 && !Object.values(conformidade).includes('Não Conforme');
                const statusGeral = Object.keys(conformidade).length === 0 ? 'Sem Inspeção' : (isConf ? 'Conforme' : 'Não Conforme');

                const row = {
                    'Código': ext.id,
                    'Localização': ext.local || 'Não especificado',
                    'Tipo/Especificações': ext.tipoKgL || ext.tipo || 'Não especificado',
                    'Status Geral': statusGeral,
                    'Data da Vistoria': formatarDataBR(ultima.dataInspecao || ''),
                    'Brigadista': ultima.nomeBrigadista || '',
                    'E-mail Brigadista': ultima.emailBrigadista || '',
                    'Vencimento Recarga': formatarDataBR(ultima.vencimentoRecarga || ''),
                    'Vencimento Teste Hidrostático': formatarDataBR(ultima.vencimentoHidrostatico || ''),
                    'Observações': ultima.observacoes || ''
                };

                // Adiciona colunas do checklist
                Object.entries(MAP_CHECKLIST).forEach(([key_db, friendly_label]) => {
                    row[friendly_label] = conformidade[key_db] || 'N/A';
                });

                dataSheet.push(row);
            });

            // Ordenação pelo número do código
            dataSheet.sort((a, b) => {
                const numA = parseInt((a['Código'].match(/\d+/) || [9999])[0]);
                const numB = parseInt((b['Código'].match(/\d+/) || [9999])[0]);
                return numA - numB;
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(dataSheet);

            // Ajustar largura das colunas
            const colWidths = [];
            Object.keys(dataSheet[0] || {}).forEach(key => {
                let maxLen = key.length;
                dataSheet.forEach(row => {
                    const val = String(row[key] || '');
                    if (val.length > maxLen) maxLen = val.length;
                });
                colWidths.push({ wch: Math.min(maxLen + 3, 35) });
            });
            ws['!cols'] = colWidths;

            XLSX.utils.book_append_sheet(wb, ws, 'Vistorias');
            XLSX.writeFile(wb, 'Relatorio_Vistorias_Brigada.xlsx');

            exportRelatoriosModal.classList.add('hidden');
            window.showModal("Exportado!", "Relatório Excel gerado e baixado com sucesso.", "success");

        } catch (err) {
            console.error("Erro ao gerar Excel", err);
            window.showModal("Erro", "Houve uma falha ao compilar o Excel.", "error");
        }
    };
}

if (addElementoForm) {
    addElementoForm.onsubmit = async (e) => {
        e.preventDefault();
        const categoria = newCategoria.value;
        const id = newElementId.value.trim().toUpperCase();
        const local = newElementLocal.value.trim();
        const tipo = newElementTipo.value.trim();

        // Evitar cadastro de código duplicado
        const todosElementos = [...state.inventarioCache, ...state.hidrantesCache];
        const existe = todosElementos.some(e => e.id.toUpperCase() === id);
        if (existe) {
            window.showModal("Bloqueado", "Este código já está cadastrado no sistema!", "error");
            return;
        }

        const submitBtn = addElementoForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerText = "GRAVANDO...";

        try {
            if (categoria === 'Hidrante') {
                const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'hidrantes', id);
                await setDoc(docRef, { localizacao: local, tamanhoMangueira: tipo, polegada: '' });
            } else {
                const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventario', id);
                await setDoc(docRef, { local, tipo, categoria });
            }

            window.showModal("Sucesso!", `${categoria} ${id} cadastrado com sucesso.`, "success");
            addElementoForm.reset();
            addElementoModal.classList.add('hidden');
        } catch (err) {
            console.error("Erro ao gravar elemento no banco", err);
            window.showModal("Erro", "Falha ao cadastrar o elemento no Firestore.", "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "Salvar no Banco";
        }
    };
}
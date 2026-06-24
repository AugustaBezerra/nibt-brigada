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
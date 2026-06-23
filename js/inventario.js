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
export function startInventarioSync() {
    const colInventario = collection(db, 'artifacts', appId, 'public', 'data', 'inventario');
    onSnapshot(colInventario, (snapshot) => {
        state.inventarioCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateBadges();
        renderInventario();
    });

    const colInspecoes = collection(db, 'artifacts', appId, 'public', 'data', 'inspecoes');
    onSnapshot(colInspecoes, (snapshot) => {
        state.inspecoesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInventario();
    });
}

function updateBadges() {
    if (!badgeExtintores || !badgeHidrantes) return;
    const qtdExtintores = state.inventarioCache.filter(e => !e.categoria || e.categoria === 'Extintor').length;
    const qtdHidrantes = state.inventarioCache.filter(e => e.categoria === 'Hidrante').length;
    
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

    // Filtra pela categoria atual (considera 'Extintor' se não houver categoria, para retrocompatibilidade)
    const inventarioFiltrado = state.inventarioCache.filter(ext => {
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

    // Monta itens reprovados (Se houver)
    let itensReprovadosHTML = '<p class="text-emerald-400 text-xs font-bold"><i class="fa-solid fa-check"></i> 100% Conforme</p>';
    if (ultimaInspecao && ultimaInspecao.conformidade) {
        const reprovados = Object.entries(ultimaInspecao.conformidade)
            .filter(([key, val]) => val === 'Não Conforme')
            .map(([key]) => key);

        if (reprovados.length > 0) {
            itensReprovadosHTML = `<div class="bg-red-500/10 p-3 rounded-lg border border-red-500/20 space-y-1">
                <p class="text-red-400 text-xs font-black uppercase mb-1">Itens Não Conformes:</p>
                ${reprovados.map(i => `<p class="text-red-300 text-[10px] font-medium">- ${i}</p>`).join('')}
            </div>`;
        }
    }

    const catInfo = ext.categoria || 'Extintor';

    // Injeta detalhes
    document.getElementById('detalhesExtintorCard').innerHTML = `
        <div class="p-5 bg-nibt-card rounded-2xl border border-nibt-border space-y-4 shadow-xl">
            <div class="flex justify-between items-center">
                <h2 class="text-white text-base font-black">${ext.id}</h2>
                <span class="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded font-bold uppercase">${catInfo}</span>
            </div>
            <div class="text-xs space-y-1 text-slate-400">
                <p><span class="font-bold text-slate-300">Localização:</span> ${ext.local}</p>
                <p><span class="font-bold text-slate-300">Tipo e Especificações:</span> ${ext.tipo || 'Não especificado'}</p>
            </div>
            
            ${itensReprovadosHTML}
            
            <button id="btnIniciarVistoriaDireta" class="w-full mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all text-xs uppercase tracking-wider">
                Fazer Nova Vistoria
            </button>
        </div>
    `;

    document.getElementById('btnIniciarVistoriaDireta').onclick = () => {
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
        const existe = state.inventarioCache.some(e => e.id.toUpperCase() === id);
        if (existe) {
            window.showModal("Bloqueado", "Este código já está cadastrado no inventário!", "error");
            return;
        }

        const submitBtn = addElementoForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerText = "GRAVANDO...";

        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventario', id);
            await setDoc(docRef, { local, tipo, categoria });

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
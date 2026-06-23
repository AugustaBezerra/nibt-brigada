import { db, appId } from './firebase-config.js';
import { collection, onSnapshot, doc, setDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { state } from './state.js';
import { abrirVistoria } from './inspecao.js';

// Cache do Firestore é importado do estado centralizado
const gridExtintores = document.getElementById('gridExtintores');
const secInventario = document.getElementById('secInventario');
const secDetalhes = document.getElementById('secDetalhes');
const backToInventarioBtn = document.getElementById('backToInventarioBtn');

// Inicializa a escuta em tempo real do banco
export function startInventarioSync() {
    const colInventario = collection(db, 'artifacts', appId, 'public', 'data', 'inventario');
    onSnapshot(colInventario, (snapshot) => {
        state.inventarioCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInventario();
    });

    const colInspecoes = collection(db, 'artifacts', appId, 'public', 'data', 'inspecoes');
    onSnapshot(colInspecoes, (snapshot) => {
        state.inspecoesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInventario();
    });
}

// Renderiza a lista de cards de extintores
function renderInventario() {
    if (!gridExtintores) return;
    gridExtintores.innerHTML = '';

    // Ordenação alfanumérica crescente correta
    const inventarioOrdenado = [...state.inventarioCache].sort((a, b) => 
        a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' })
    );

    inventarioOrdenado.forEach(ext => {
        const historicoExt = state.inspecoesCache
            .filter(i => i.idExtintor === ext.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        const ultimaInspecao = historicoExt[0];

        // Status Visual
        let statusTag = `<span class="text-[9px] font-black bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-md uppercase">Sem Vistoria</span>`;
        if (ultimaInspecao) {
            const temErro = ultimaInspecao.conformidade && Object.values(ultimaInspecao.conformidade).includes('Não Conforme');
            statusTag = temErro 
                ? `<span class="text-[9px] font-black bg-red-500/10 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md uppercase">Com Pendências</span>`
                : `<span class="text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md uppercase">Conforme</span>`;
        }

        const card = document.createElement('div');
        card.className = "bg-nibt-card border border-nibt-border rounded-xl p-4 flex justify-between items-center hover:border-red-500/30 transition-all cursor-pointer";
        card.innerHTML = `
            <div class="space-y-1">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-black text-white bg-nibt-dark px-2 rounded">${ext.id}</span>
                    ${statusTag}
                </div>
                <p class="text-xs text-slate-300 font-bold">${ext.local}</p>
            </div>
            <i class="fa-solid fa-chevron-right text-slate-600"></i>
        `;
        card.onclick = () => verDetalhes(ext, historicoExt);
        gridExtintores.appendChild(card);
    });
}

// Exibe detalhes do extintor e última vistoria
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

    // Injeta detalhes e adiciona botão para realizar nova vistoria
    document.getElementById('detalhesExtintorCard').innerHTML = `
        <div class="p-5 bg-nibt-card rounded-2xl border border-nibt-border space-y-4 shadow-xl">
            <h2 class="text-white text-base font-black">${ext.id}</h2>
            <div class="text-xs space-y-1 text-slate-400">
                <p><span class="font-bold text-slate-300">Localização:</span> ${ext.local}</p>
                <p><span class="font-bold text-slate-300">Tipo e Capacidade:</span> ${ext.tipo || 'Não especificado'}</p>
            </div>
            
            ${itensReprovadosHTML}
            
            <button id="btnIniciarVistoriaDireta" class="w-full mt-4 bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all text-xs uppercase tracking-wider">
                Fazer Nova Vistoria
            </button>
        </div>
    `;

    // Evento de clique para iniciar vistoria
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

// --- MODAL DE CADASTRO DE NOVO EXTINTOR ---
const addExtintorModal = document.getElementById('addExtintorModal');
const openAddExtModalBtn = document.getElementById('openAddExtModalBtn');
const closeAddExtModalBtn = document.getElementById('closeAddExtModalBtn');
const addExtintorForm = document.getElementById('addExtintorForm');
const newExtId = document.getElementById('newExtId');
const newExtLocal = document.getElementById('newExtLocal');
const newExtTipo = document.getElementById('newExtTipo');

if (openAddExtModalBtn) {
    openAddExtModalBtn.onclick = () => addExtintorModal.classList.remove('hidden');
}

if (closeAddExtModalBtn) {
    closeAddExtModalBtn.onclick = () => {
        addExtintorForm.reset();
        addExtintorModal.classList.add('hidden');
    };
}

if (addExtintorForm) {
    addExtintorForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = newExtId.value.trim().toUpperCase();
        const local = newExtLocal.value.trim();
        const tipo = newExtTipo.value.trim();

        // Evitar cadastro de código duplicado
        const existe = state.inventarioCache.some(e => e.id.toUpperCase() === id);
        if (existe) {
            window.showModal("Bloqueado", "Este código de extintor já está cadastrado no inventário!", "error");
            return;
        }

        const submitBtn = addExtintorForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerText = "GRAVANDO...";

        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventario', id);
            await setDoc(docRef, { local, tipo });

            window.showModal("Sucesso!", `Extintor ${id} cadastrado com sucesso.`, "success");
            addExtintorForm.reset();
            addExtintorModal.classList.add('hidden');
        } catch (err) {
            console.error("Erro ao gravar extintor no banco", err);
            window.showModal("Erro", "Falha ao cadastrar o extintor no Firestore.", "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "Salvar no Banco";
        }
    };
}
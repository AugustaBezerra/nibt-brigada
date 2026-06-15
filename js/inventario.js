import { db, appId } from './firebase-config.js';
import { collection, onSnapshot, doc, setDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';



export let inventarioCache = [];
export let inspecoesCache = [];

const gridExtintores = document.getElementById('gridExtintores');
const secInventario = document.getElementById('secInventario');
const secDetalhes = document.getElementById('secDetalhes');

export function startInventarioSync() {
    const colInventario = collection(db, 'artifacts', appId, 'public', 'data', 'inventario');
    onSnapshot(colInventario, (snapshot) => {
        inventarioCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInventario();
    });

    const colInspecoes = collection(db, 'artifacts', appId, 'public', 'data', 'inspecoes');
    onSnapshot(colInspecoes, (snapshot) => {
        inspecoesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInventario();
    });
}

function renderInventario() {
    if (!gridExtintores) return;
    gridExtintores.innerHTML = '';

    // 1. ORDENAÇÃO CRESCENTE (Alfanumérica correta)
    const inventarioOrdenado = [...inventarioCache].sort((a, b) => 
        a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' })
    );

    inventarioOrdenado.forEach(ext => {
        const historicoExt = inspecoesCache
            .filter(i => i.idExtintor === ext.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        const ultimaInspecao = historicoExt[0];

        // Status Visual
        let statusTag = `<span class="text-[9px] font-black bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-md uppercase">Sem Vistoria</span>`;
        if (ultimaInspecao) {
            // Verifica se tem erro na conformidade (se algum item for "Não Conforme")
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
            itensReprovadosHTML = `<div class="bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                <p class="text-red-400 text-xs font-black uppercase mb-2">Itens Não Conformes:</p>
                ${reprovados.map(i => `<p class="text-red-300 text-[10px] font-medium">- ${i}</p>`).join('')}
            </div>`;
        }
    }

    document.getElementById('detalhesExtintorCard').innerHTML = `
        <div class="p-4 bg-nibt-card rounded-xl border border-nibt-border">
            <h2 class="text-white font-black">${ext.id} - ${ext.local}</h2>
            <div class="mt-4 space-y-4">
                ${itensReprovadosHTML}
            </div>
        </div>
    `;
}
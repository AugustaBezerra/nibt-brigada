// js/inventario.js
import { db, appId } from './firebase-config.js';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { abrirVistoria, verificarTravaDuplicidade } from './inspecao.js';

let unsubInventario = null;
let unsubInspecoes = null;
export let inventarioCache = [];
export let inspecoesCache = [];

const gridExtintores = document.getElementById('gridExtintores');
const secInventario = document.getElementById('secInventario');
const secDetalhes = document.getElementById('secDetalhes');
const detalhesExtintorCard = document.getElementById('detalhesExtintorCard');
const backToInventarioBtn = document.getElementById('backToInventarioBtn');

// Modais de Cadastro de Extintor
const openAddExtModalBtn = document.getElementById('openAddExtModalBtn');
const closeAddExtModalBtn = document.getElementById('closeAddExtModalBtn');
const addExtintorModal = document.getElementById('addExtintorModal');
const addExtintorForm = document.getElementById('addExtintorForm');

export function startInventarioSync() {
    // 1. Escuta o Inventário Geral em Tempo Real
    const colInventario = collection(db, 'artifacts', appId, 'public', 'data', 'inventario');
    unsubInventario = onSnapshot(colInventario, (snapshot) => {
        inventarioCache = [];
        snapshot.forEach(doc => { inventarioCache.push({ id: doc.id, ...doc.data() }); });
        renderInventario();
    });

    // 2. Escuta todas as Inspeções para histórico e travas
    const colInspecoes = collection(db, 'artifacts', appId, 'public', 'data', 'inspecoes');
    unsubInspecoes = onSnapshot(colInspecoes, (snapshot) => {
        inspecoesCache = [];
        snapshot.forEach(doc => { inspecoesCache.push({ id: doc.id, ...doc.data() }); });
        renderInventario(); // Re-renderiza para atualizar cores de status nos cards
    });
}

export function stopInventarioSync() {
    if (unsubInventario) unsubInventario();
    if (unsubInspecoes) unsubInspecoes();
}

// Substitua a renderInventario antiga por esta versão inteligente:
function renderInventario() {
    gridExtintores.innerHTML = '';

    if (inventarioCache.length === 0) {
        gridExtintores.innerHTML = `<p class="text-xs text-slate-500 text-center py-6">Nenhum extintor cadastrado no banco.</p>`;
        return;
    }

    // 1. ORDENAÇÃO CRESCENTE: Ordena o cache pelo ID do extintor
    const inventarioOrdenado = [...inventarioCache].sort((a, b) => {
        return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Pega o termo digitado na barra de pesquisa (se houver)
    const termoBusca = document.getElementById('searchExtInput')?.value.trim().toUpperCase() || '';

    let cardsRenderizados = 0;

    inventarioOrdenado.forEach(ext => {
        // 2. FILTRO DA BUSCA: Se o usuário digitou algo e não bate com o ID, ignora este extintor
        if (termoBusca && !ext.id.toUpperCase().includes(termoBusca)) {
            return;
        }

        cardsRenderizados++;

        // Encontra a última inspeção feita para este extintor específico
        const historicoExt = inspecoesCache
            .filter(i => i.idExtintor === ext.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const ultimaInspecao = historicoExt[0];
        const jaFeitoHoje = verificarTravaDuplicidade(ext.id);

        // Define a tag visual de status baseada na última vistoria
        let statusTag = `<span class="text-[9px] font-black bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-md uppercase">Sem Vistoria</span>`;
        if (jaFeitoHoje) {
            statusTag = `<span class="text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md uppercase"><i class="fa-solid fa-check"></i> Concluído Hoje</span>`;
        } else if (ultimaInspecao) {
            statusTag = `<span class="text-[9px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md uppercase">Pendente</span>`;
        }

        const card = document.createElement('div');
        card.className = "bg-nibt-card border border-nibt-border rounded-xl p-4 flex justify-between items-center hover:border-red-500/30 transition-all cursor-pointer shadow-md";
        card.innerHTML = `
            <div class="space-y-1.5 flex-1 pr-2">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-black text-white bg-nibt-dark border border-nibt-border px-2.5 py-0.5 rounded-md">${ext.id}</span>
                    ${statusTag}
                </div>
                <p class="text-xs text-slate-200 font-bold truncate">${ext.local}</p>
                <p class="text-[10px] text-slate-400 uppercase font-semibold">${ext.tipoKgL}</p>
            </div>
            <div class="text-slate-500 hover:text-white transition-colors p-1">
                <i class="fa-solid fa-chevron-right"></i>
            </div>
        `;

        card.onclick = () => verDetalhes(ext, historicoExt);
        gridExtintores.appendChild(card);
    });

    // Se a busca não encontrar nada que corresponda
    if (cardsRenderizados === 0 && termoBusca) {
        gridExtintores.innerHTML = `<p class="text-xs text-slate-500 text-center py-6">Nenhum extintor correspondente a "${termoBusca}" encontrado.</p>`;
    }
}

// Vincula o evento de digitação da barra de pesquisa para atualizar a tela na hora
document.getElementById('searchExtInput').oninput = () => {
    renderInventario();
};
// Substitua APENAS a função verDetalhes dentro de js/inventario.js

function verDetalhes(ext, historico) {
    secInventario.classList.add('hidden');
    secDetalhes.classList.remove('hidden');

    const ultima = historico[0];
    const jaFeitoHoje = verificarTravaDuplicidade(ext.id);

    let infoInspecaoHTML = `<p class="text-xs text-slate-400 italic">Nenhum histórico de vistoria registrado para este extintor.</p>`;

    if (ultima) {
        // Mapeamento dos nomes amigáveis dos itens da NBR
        const nomesItens = {
            acesso: 'Desobstrução e Acesso',
            sinalizacaoParede: 'Sinalização de Parede (Placa)',
            sinalizacaoPiso: 'Sinalização de Piso (Pintura)',
            suporte: 'Suporte e Altura de Fixação',
            cilindro: 'Casco / Cilindro Sem Corrosão',
            instrucoes: 'Quadro de Instruções Legível',
            mangueira: 'Mangueira e Bico / Difusor',
            lacre: 'Lacre de Segurança Intacto',
            trava: 'Trava de Segurança / Pino',
            manometro: 'Manômetro na Faixa Verde'
        };

        // Descobre quais itens estão com defeito ("Não Conforme")
        let itensComDefeitoHTML = '';
        if (ultima.conformidade) {
            Object.keys(ultima.conformidade).forEach(key => {
                if (ultima.conformidade[key] === 'Não Conforme') {
                    itensComDefeitoHTML += `
                        <div class="flex items-center gap-2 text-red-400 text-xs font-bold bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg">
                            <i class="fa-solid fa-triangle-exclamation animate-pulse"></i>
                            <span>${nomesItens[key] || key}</span>
                        </div>
                    `;
                }
            });
        }

        // Se tudo estiver OK
        if (itensComDefeitoHTML === '') {
            itensComDefeitoHTML = `
                <div class="flex items-center gap-2 text-emerald-400 text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                    <i class="fa-solid fa-circle-check"></i>
                    <span>100% em Conformidade (Nenhum defeito)</span>
                </div>
            `;
        }

        infoInspecaoHTML = `
            <div class="bg-nibt-dark/60 border border-nibt-border p-4 rounded-xl space-y-3">
                <div class="flex justify-between text-xs">
                    <span class="text-slate-400 font-semibold">Última Revisão:</span>
                    <span class="text-white font-black">${new Date(ultima.timestamp).toLocaleDateString('pt-BR')}</span>
                </div>
                <div class="flex justify-between text-xs">
                    <span class="text-slate-400 font-semibold">Avaliador:</span>
                    <span class="text-red-400 font-black uppercase text-[10px]">${ultima.nomeBrigadista}</span>
                </div>
                <div class="flex justify-between text-xs">
                    <span class="text-slate-400 font-semibold">Prox. Recarga:</span>
                    <span class="text-white font-bold">${new Date(ultima.vencimentoRecarga).toLocaleDateString('pt-BR')}</span>
                </div>

                <!-- LISTA DE NÃO CONFORMIDADES EM DESTAQUE -->
                <div class="space-y-1.5 pt-1">
                    <span class="block text-[10px] text-slate-500 font-bold uppercase">Status de Reparo:</span>
                    <div class="flex flex-col gap-1.5">
                        ${itensComDefeitoHTML}
                    </div>
                </div>

                <div class="border-t border-nibt-border/40 pt-2">
                    <span class="block text-[10px] text-slate-500 font-bold uppercase mb-1">Notas do Operador:</span>
                    <p class="text-xs text-slate-300 bg-nibt-dark/80 p-2 rounded-lg border border-nibt-border/40 italic">${ultima.observacoes || 'Sem observações registradas.'}</p>
                </div>
            </div>
        `;
    }

    detalhesExtintorCard.innerHTML = `
        <div class="bg-nibt-card border border-nibt-border rounded-2xl p-5 space-y-5 shadow-xl">
            <div class="flex justify-between items-start border-b border-nibt-border pb-3">
                <div>
                    <span class="text-xs bg-red-600/10 text-red-400 border border-red-500/20 px-3 py-1 rounded-md font-black">${ext.id}</span>
                    <h4 class="text-base font-black text-white mt-2">${ext.local}</h4>
                    <p class="text-xs text-slate-400 uppercase tracking-wider mt-0.5">${ext.tipoKgL}</p>
                </div>
                <button id="deleteExtBtn" class="bg-red-600/10 hover:bg-red-600 border border-red-500/20 hover:border-red-600 text-red-400 hover:text-white p-2 rounded-xl transition-all" title="Remover Extintor do Inventário">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>

            <div class="space-y-2">
                <h5 class="text-[10px] font-black text-slate-500 uppercase tracking-wider">Último Diagnóstico</h5>
                ${infoInspecaoHTML}
            </div>

            <button id="actionVistoriaBtn" class="w-full font-black py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                <i class="fa-solid fa-file-shield text-lg"></i>
                <span>${jaFeitoHoje ? 'VISTORIA CONCLUÍDA HOJE' : 'INICIAR NOVA VISTORIA'}</span>
            </button>
        </div>
    `;

    // Lógica do botão de ação da vistoria dentro dos detalhes
    const actionBtn = document.getElementById('actionVistoriaBtn');
    if (jaFeitoHoje) {
        actionBtn.className = "w-full bg-slate-800 text-slate-500 font-black py-4 rounded-xl cursor-not-allowed";
        actionBtn.disabled = true;
    } else {
        actionBtn.className = "w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-xl shadow-red-600/10 active:scale-[0.98]";
        actionBtn.onclick = () => {
            secDetalhes.classList.add('hidden');
            abrirVistoria(ext);
        };
    }

    // Ação de deletar extintor do banco
    document.getElementById('deleteExtBtn').onclick = async () => {
        if(confirm(`Atenção: Tem certeza que deseja remover o extintor ${ext.id} permanentemente do inventário?`)) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventario', ext.id));
            backToInventarioBtn.click();
        }
    };
}
// Navegação para Voltar ao Inventário Geral
backToInventarioBtn.onclick = () => {
    secDetalhes.classList.add('hidden');
    secInventario.classList.remove('hidden');
};

// Controles do Modal de Cadastro de Novo Extintor
openAddExtModalBtn.onclick = () => addExtintorModal.classList.remove('hidden');
closeAddExtModalBtn.onclick = () => { addExtintorModal.classList.add('hidden'); addExtintorForm.reset(); };

addExtintorForm.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('newExtId').value.trim().toUpperCase();
    const local = document.getElementById('newExtLocal').value.trim();
    const tipo = document.getElementById('newExtTipo').value.trim();

    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventario', id), {
            local: local,
            tipoKgL: tipo
        });
        addExtintorModal.classList.add('hidden');
        addExtintorForm.reset();
    } catch(err) {
        alert("Erro ao salvar o extintor no Firebase.");
    }
};
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

        // Formatação da data da última inspeção para exibir no card
        let dataTexto = "Última: Nenhuma registrada";
        if (ultimaInspecao && ultimaInspecao.timestamp) {
            const dataObjeto = new Date(ultimaInspecao.timestamp);
            // Formata no padrão brasileiro (DD/MM/AAAA)
            const dia = String(dataObjeto.getDate()).padStart(2, '0');
            const mes = String(dataObjeto.getMonth() + 1).padStart(2, '0');
            const ano = dataObjeto.getFullYear();
            dataTexto = `Última vistoria: ${dia}/${mes}/${ano}`;
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
                <div class="flex items-center justify-between pt-0.5">
                    <p class="text-[10px] text-slate-400 uppercase font-semibold">${ext.tipoKgL}</p>
                    <p class="text-[10px] text-slate-500 font-medium">${dataTexto}</p>
                </div>
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


// Procure por esta parte dentro da função verDetalhes no seu js/inventario.js
// Vamos atualizar o HTML que é injetado na div 'detalhesExtintorCard'

function verDetalhes(ext, historicoExt) {
    secInventario.classList.add('hidden'); 
    secDetalhes.classList.remove('hidden');

    const ultimaInspecao = historicoExt[0];
    
    // Trecho que gera o HTML do status de reparo principal
    let statusReparoHTML = `<div class="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs p-3 rounded-xl flex items-center gap-2 font-bold"><i class="fa-solid fa-circle-check"></i> 100% em Conformidade (Nenhum defeito)</div>`;
    
    // Se houver itens reprovados na última inspeção, monta a lista de erros
    if (ultimaInspecao && ultimaInspecao.itensReprovados && ultimaInspecao.itensReprovados.length > 0) {
        statusReparoHTML = `
            <div class="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl space-y-1 font-bold">
                <p class="text-[10px] uppercase tracking-wider text-red-300 mb-1"><i class="fa-solid fa-triangle-exclamation"></i> Itens Não Conformes:</p>
                ${ultimaInspecao.itensReprovados.map(item => `<div class="bg-red-950/40 px-2 py-1 rounded border border-red-900/30 text-[11px] font-semibold"><i class="fa-solid fa-xmark mr-1.5 text-red-500"></i>${item}</div>`).join('')}
            </div>
        `;
    }

    // --- NOVA SEÇÃO: GERADOR DO CHECKLIST COMPLETO EXIGIDO PELO SR. CHOCOLATE ---
    let checklistCompletoHTML = '';
    
    if (ultimaInspecao) {
        // Mapeia todos os itens padrão da NBR que seu formulário avalia
        // Caso os nomes das chaves no seu banco sejam diferentes, ajuste os textos abaixo:
        const mapeamentoItens = [
            { chave: 'manometro', label: 'Pressão do Manômetro' },
            { chave: 'lacre', label: 'Lacre de Segurança' },
            { chave: 'sinalizacao', label: 'Sinalização de Parede / Placa' },
            { chave: 'mangueira', label: 'Mangueira e Difusor' },
            { chave: 'acesso', label: 'Desobstrução do Acesso' },
            { chave: 'casco', label: 'Estado do Casco / Pintura' }
        ];

        checklistCompletoHTML = `
            <div class="bg-nibt-dark border border-nibt-border rounded-xl p-4 mt-3 space-y-3">
                <h5 class="text-[11px] font-black uppercase text-slate-400 tracking-wider border-b border-nibt-border pb-1.5 flex items-center gap-1">
                    <i class="fa-solid fa-clipboard-list text-red-500"></i> Checklist Completo da Inspeção
                </h5>
                <div class="space-y-2">
        `;

        mapeamentoItens.forEach(item => {
            // Verifica se o item específico foi marcado como reprovado na vistoria
            const foiReprovado = ultimaInspecao.itensReprovados?.includes(item.label) || ultimaInspecao[item.chave] === false;
            
            let badgeStatus = `<span class="text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md uppercase"><i class="fa-solid fa-check mr-1"></i> OK</span>`;
            if (foiReprovado) {
                badgeStatus = `<span class="text-[9px] font-black bg-red-500/10 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md uppercase"><i class="fa-solid fa-xmark mr-1"></i> Falha</span>`;
            }

            checklistCompletoHTML += `
                <div class="flex justify-between items-center py-1 border-b border-nibt-border/30 last:border-0">
                    <span class="text-xs text-slate-300 font-medium">${item.label}</span>
                    ${badgeStatus}
                </div>
            `;
        });

        checklistCompletoHTML += `
                </div>
            </div>
        `;
    } else {
        checklistCompletoHTML = `
            <div class="bg-nibt-dark border border-nibt-border rounded-xl p-4 text-center mt-3">
                <p class="text-xs text-slate-500">Nenhum histórico de checklist encontrado para este extintor.</p>
            </div>
        `;
    }

    // Injeta a estrutura completa de volta na tela, posicionando o novo card abaixo das notas
    document.getElementById('detalhesExtintorCard').innerHTML = `
        <div class="bg-nibt-card border border-nibt-border rounded-2xl p-5 shadow-md space-y-4">
            <div class="flex justify-between items-start">
                <div>
                    <span class="text-xs font-black text-white bg-nibt-dark border border-nibt-border px-2.5 py-0.5 rounded-md">${ext.id}</span>
                    <h4 class="text-base font-black text-white mt-2">${ext.local}</h4>
                    <p class="text-xs text-slate-400 uppercase font-bold">${ext.tipoKgL}</p>
                </div>
                <button onclick="excluirExtintorDoBanco('${ext.id}')" class="text-slate-500 hover:text-red-400 p-2 transition-colors">
                    <i class="fa-solid fa-trash text-base"></i>
                </button>
            </div>

            <div class="space-y-3 bg-nibt-dark/50 border border-nibt-border/60 p-4 rounded-xl text-xs">
                <p class="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Último Diagnóstico</p>
                <div class="flex justify-between">
                    <span class="text-slate-400 font-semibold">Última Revisão:</span>
                    <span class="text-white font-bold">${ultimaInspecao ? new Date(ultimaInspecao.timestamp).toLocaleDateString('pt-BR') : 'N/A'}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-slate-400 font-semibold">Avaliador:</span>
                    <span class="text-red-400 font-black uppercase">${ultimaInspecao ? ultimaInspecao.usuario : 'N/A'}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-slate-400 font-semibold">Prox. Recarga:</span>
                    <span class="text-white font-bold">${ultimaInspecao ? new Date(ultimaInspecao.vencimentoRecarga).toLocaleDateString('pt-BR') : 'N/A'}</span>
                </div>
            </div>

            <div class="space-y-1.5">
                <p class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Status de Reparo:</p>
                ${statusReparoHTML}
            </div>

            <div class="space-y-1.5">
                <p class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Notas do Operador:</p>
                <div class="w-full bg-nibt-dark border border-nibt-border rounded-xl p-3 text-slate-300 text-xs italic">
                    ${ultimaInspecao && ultimaInspecao.observacoes ? ultimaInspecao.observacoes : 'Sem observações registradas.'}
                </div>
            </div>

            ${checklistCompletoHTML}

            <button id="btnIniciarVistoriaId" class="w-full text-center text-xs font-black tracking-wide uppercase py-4 rounded-xl shadow-lg transition-all ${verificarTravaDuplicidade(ext.id) ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'}" ${verificarTravaDuplicidade(ext.id) ? 'disabled' : ''}>
                <i class="fa-solid fa-file-signature mr-1.5"></i> ${verificarTravaDuplicidade(ext.id) ? 'Vistoria Concluída Hoje' : 'Iniciar Nova Vistoria'}
            </button>
        </div>
    `;

    // Vincula o clique do botão de nova vistoria
    document.getElementById('btnIniciarVistoriaId').onclick = () => abrirFormularioVistoria(ext);
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
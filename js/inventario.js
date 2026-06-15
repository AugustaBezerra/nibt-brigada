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
        renderInventario(); // Re-renderiza para atualizar status em tempo real
    });
}

export function stopInventarioSync() {
    if (unsubInventario) unsubInventario();
    if (unsubInspecoes) unsubInspecoes();
}

// Helper para normalizar textos removendo acentos e símbolos para comparação precisa
function normalizeText(str) {
    if (!str) return "";
    return str.toString()
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "") // Remove acentos
              .replace(/[^a-z0-9]/g, "");     // Remove símbolos, parênteses e espaços
}

// Garante que o nome do avaliador seja extraído e nunca retorne undefined
function obterNomeAvaliador(inspecao) {
    if (!inspecao) return "N/A";
    const rawUser = inspecao.usuario || inspecao.usuarioEmail || inspecao.operador || inspecao.email || "";
    
    // Tratamento rigoroso contra strings nulas ou indefinidas
    if (!rawUser || rawUser === "undefined" || rawUser === "null" || String(rawUser).trim() === "") {
        return "ANÔNIMO";
    }
    
    if (typeof rawUser === "string") {
        const nomeLimpo = rawUser.split("@")[0].trim();
        if (nomeLimpo.toLowerCase() === "undefined" || nomeLimpo.toLowerCase() === "null") {
            return "ANÔNIMO";
        }
        return nomeLimpo.toUpperCase();
    }
    return String(rawUser).toUpperCase();
}

// Constrói de forma segura a lista de itens que falharam na inspeção
function obterItensReprovados(inspecao) {
    if (!inspecao) return [];
    
    // 1. Se o banco já possui o array compilado de itens reprovados/não conformes
    if (inspecao.itensReprovados && Array.isArray(inspecao.itensReprovados)) {
        return inspecao.itensReprovados;
    }
    if (inspecao.itensNaoConformes && Array.isArray(inspecao.itensNaoConformes)) {
        return inspecao.itensNaoConformes;
    }

    // 2. Se o banco armazena apenas campos booleanos individuais, reconstrói o array dinamicamente
    const reprovadosCalculados = [];
    if (inspecao.manometro === false || inspecao.manometro === "Não") reprovadosCalculados.push("Pressão do Manômetro");
    if (inspecao.lacre === false || inspecao.lacre === "Não") reprovadosCalculados.push("Lacre de Segurança");
    if (inspecao.sinalizacao === false || inspecao.sinalizacao === "Não") reprovadosCalculados.push("Sinalização de Parede / Placa");
    if (inspecao.mangueira === false || inspecao.mangueira === "Não") reprovadosCalculados.push("Mangueira e Difusor");
    if (inspecao.acesso === false || inspecao.acesso === "Não") reprovadosCalculados.push("Desobstrução do Acesso");
    if (inspecao.casco === false || inspecao.casco === "Não") reprovadosCalculados.push("Estado do Casco / Pintura");

    return reprovadosCalculados;
}

// Verifica se um item específico falhou, cruzando o campo booleano direto ou a lista de reprovados
function verificarSeItemFalhou(item, inspecao, listaReprovados) {
    if (!inspecao) return false;

    // 1. Verificação prioritária pelo campo booleano individual do banco
    const valorCampo = inspecao[item.chave];
    if (valorCampo !== undefined) {
        if (valorCampo === false || valorCampo === "Não" || valorCampo === "Reprovado" || valorCampo === "N") {
            return true; // Falhou
        }
    }

    // 2. Verificação de correspondência textual aproximada (Fuzzy Match) contra a lista de strings
    const labelNormalizado = normalizeText(item.label);
    const chaveNormalizada = normalizeText(item.chave);

    return listaReprovados.some(r => {
        const reprovadoNormalizado = normalizeText(r);
        return reprovadoNormalizado.includes(labelNormalizado) || 
               labelNormalizado.includes(reprovadoNormalizado) ||
               reprovadoNormalizado.includes(chaveNormalizada);
    });
}

function renderInventario() {
    gridExtintores.innerHTML = '';
    
    if (inventarioCache.length === 0) {
        gridExtintores.innerHTML = `<p class="text-xs text-slate-500 text-center py-6">Nenhum extintor cadastrado no banco.</p>`;
        return;
    }

    // Ordena o cache pelo ID do extintor
    const inventarioOrdenado = [...inventarioCache].sort((a, b) => {
        return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });

    const termoBusca = document.getElementById('searchExtInput')?.value.trim().toUpperCase() || '';
    let cardsRenderizados = 0;

    inventarioOrdenado.forEach(ext => {
        if (termoBusca && !ext.id.toUpperCase().includes(termoBusca)) {
            return; 
        }

        cardsRenderizados++;

        const historicoExt = inspecoesCache
            .filter(i => i.idExtintor === ext.id)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        const ultimaInspecao = historicoExt[0];
        const jaFeitoHoje = verificarTravaDuplicidade(ext.id);

        let statusTag = `<span class="text-[9px] font-black bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-md uppercase">Sem Vistoria</span>`;
        if (jaFeitoHoje) {
            statusTag = `<span class="text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md uppercase"><i class="fa-solid fa-check"></i> Concluído Hoje</span>`;
        } else if (ultimaInspecao) {
            statusTag = `<span class="text-[9px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md uppercase">Pendente</span>`;
        }

        let dataTexto = "Última: Nenhuma registrada";
        if (ultimaInspecao && ultimaInspecao.timestamp) {
            const dataObjeto = new Date(ultimaInspecao.timestamp);
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

    if (cardsRenderizados === 0 && termoBusca) {
        gridExtintores.innerHTML = `<p class="text-xs text-slate-500 text-center py-6">Nenhum extintor correspondente a "${termoBusca}" encontrado.</p>`;
    }
}

document.getElementById('searchExtInput').oninput = () => {
    renderInventario();
};

function verDetalhes(ext, historicoExt) {
    secInventario.classList.add('hidden'); 
    secDetalhes.classList.remove('hidden');

    const ultimaInspecao = historicoExt[0];
    
    // Recuperação rigorosa de dados limpos do banco
    const listaReprovados = obterItensReprovados(ultimaInspecao);
    const avaliadorDisplay = obterNomeAvaliador(ultimaInspecao);
    
    // Determinação precisa do status de reparo principal
    let statusReparoHTML = `<div class="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs p-3 rounded-xl flex items-center gap-2 font-bold"><i class="fa-solid fa-circle-check"></i> 100% em Conformidade (Nenhum defeito)</div>`;
    
    if (listaReprovados.length > 0) {
        statusReparoHTML = `
            <div class="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl space-y-1 font-bold">
                <p class="text-[10px] uppercase tracking-wider text-red-300 mb-1"><i class="fa-solid fa-triangle-exclamation"></i> Itens Não Conformes:</p>
                ${listaReprovados.map(item => `<div class="bg-red-950/40 px-2 py-1 rounded border border-red-900/30 text-[11px] font-semibold"><i class="fa-solid fa-xmark mr-1.5 text-red-500"></i>${item}</div>`).join('')}
            </div>
        `;
    }

    // --- NOVA SEÇÃO: DETALHAMENTO DO CHECKLIST EXIGIDO PELO SR. CHOCOLATE ---
    let checklistCompletoHTML = '';
    
    if (ultimaInspecao) {
        const mapeamentoItens = [
            { chave: 'manometro', label: 'Pressão do Manômetro' },
            { chave: 'lacre', label: 'Lacre de Segurança' },
            { chave: 'sinalizacao', label: 'Sinalização de Parede / Placa' },
            { chave: 'mangueira', label: 'Mangueira e Difusor' },
            { chave: 'acesso', label: 'Desobstrução do Acesso' },
            { chave: 'casco', label: 'Estado do Casco / Pintura' }
        ];

        checklistCompletoHTML = `
            <!-- Bloco de Checklist unificado ao card de detalhes -->
            <div class="space-y-1.5 pt-1">
                <p class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Checklist Completo da Inspeção:</p>
                <div class="bg-nibt-dark/40 border border-nibt-border/60 rounded-xl p-4 space-y-2 text-xs">
        `;

        mapeamentoItens.forEach(item => {
            const foiReprovado = verificarSeItemFalhou(item, ultimaInspecao, listaReprovados);
            
            let badgeStatus = `<span class="text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md uppercase"><i class="fa-solid fa-check mr-1"></i> OK</span>`;
            if (foiReprovado) {
                badgeStatus = `<span class="text-[9px] font-black bg-red-500/10 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-md uppercase"><i class="fa-solid fa-xmark mr-1"></i> Falha</span>`;
            }

            checklistCompletoHTML += `
                <div class="flex justify-between items-center py-1.5 border-b border-nibt-border/30 last:border-0">
                    <span class="text-slate-300 font-medium">${item.label}</span>
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
            <div class="space-y-1.5 pt-1">
                <p class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Checklist Completo da Inspeção:</p>
                <div class="bg-nibt-dark/40 border border-nibt-border/60 rounded-xl p-4 text-center text-xs text-slate-500">
                    Nenhum histórico de checklist encontrado para este extintor.
                </div>
            </div>
        `;
    }

    // Injeta a estrutura completa de volta na tela, mantendo o design original integrado
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
                    <span class="text-red-400 font-black uppercase">${avaliadorDisplay}</span>
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

            <!-- Checklist Completo integrado no mesmo fluxo visual -->
            ${checklistCompletoHTML}

            <button id="btnIniciarVistoriaId" class="w-full text-center text-xs font-black tracking-wide uppercase py-4 rounded-xl shadow-lg transition-all ${verificarTravaDuplicidade(ext.id) ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'}" ${verificarTravaDuplicidade(ext.id) ? 'disabled' : ''}>
                <i class="fa-solid fa-file-signature mr-1.5"></i> ${verificarTravaDuplicidade(ext.id) ? 'Vistoria Concluída Hoje' : 'Iniciar Nova Vistoria'}
            </button>
        </div>
    `;

    document.getElementById('btnIniciarVistoriaId').onclick = () => abrirVistoria(ext);
}

// Função de exclusão de extintor integrada ao modal estético global (substitui alerts invasivos)
window.excluirExtintorDoBanco = async function(id) {
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventario', id);
        await deleteDoc(docRef);
        
        secDetalhes.classList.add('hidden');
        secInventario.classList.remove('hidden');
        
        if (typeof window.showModal === 'function') {
            window.showModal('Excluído', `O extintor ${id} foi removido com sucesso do banco de dados.`, 'success');
        }
    } catch (err) {
        if (typeof window.showModal === 'function') {
            window.showModal('Erro', 'Não foi possível excluir este extintor. Verifique suas permissões.', 'error');
        }
    }
};

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
        if (typeof window.showModal === 'function') {
            window.showModal('Erro', 'Falha ao salvar o novo extintor no banco de dados.', 'error');
        }
    }
};
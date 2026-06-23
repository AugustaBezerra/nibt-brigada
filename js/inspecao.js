// js/inspecao.js
import { db, appId, auth } from './firebase-config.js';
import { collection, addDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { state } from './state.js';

const secVistoria = document.getElementById('secVistoria');
const secInventario = document.getElementById('secInventario');
const vistoriaTitle = document.getElementById('vistoriaTitle');
const checklistContainer = document.getElementById('checklistContainer');
const inspectionForm = document.getElementById('inspectionForm');
const cancelVistoriaBtn = document.getElementById('cancelVistoriaBtn');

const vencimentoRecarga = document.getElementById('vencimentoRecarga');
const vencimentoHidrostatico = document.getElementById('vencimentoHidrostatico');
const observacoes = document.getElementById('observacoes');

let extintorAtual = null;
const conformidadeState = {};

const checklistItems = [
    { id: 'acesso', label: 'Desobstrução e Acesso' },
    { id: 'sinalizacaoParede', label: 'Sinalização de Parede (Placa)' },
    { id: 'sinalizacaoPiso', label: 'Sinalização de Piso (Pintura)' },
    { id: 'suporte', label: 'Suporte e Altura de Fixação' },
    { id: 'cilindro', label: 'Casco / Cilindro Sem Corrosão' },
    { id: 'instrucoes', label: 'Quadro de Instruções Legível' },
    { id: 'mangueira', label: 'Mangueira e Bico / Difusor' },
    { id: 'lacre', label: 'Lacre de Segurança Intacto' },
    { id: 'trava', label: 'Trava de Segurança / Pino' },
    { id: 'manometro', label: 'Manômetro na Faixa Verde' }
];

export function verificarTravaDuplicidade(idExtintor) {
    const dataHoje = new Date().toISOString().split('T')[0];
    return state.inspecoesCache.some(i => i.idExtintor === idExtintor && i.dataInspecao === dataHoje);
}

export function abrirVistoria(extintor) {
    extintorAtual = extintor;
    vistoriaTitle.innerText = `Nova Vistoria: ${extintor.id}`;
    secVistoria.classList.remove('hidden');

    buildChecklistUI();
}

function buildChecklistUI() {
    checklistContainer.innerHTML = '';
    checklistItems.forEach(item => {
        conformidadeState[item.id] = 'Conforme'; // Reseta padrão para Conforme

        const itemRow = document.createElement('div');
        itemRow.className = 'flex flex-col p-3 rounded-xl bg-nibt-dark/40 border border-nibt-border/60 space-y-2';
        itemRow.innerHTML = `
            <span class="text-xs font-bold text-slate-200">${item.label}</span>
            <div class="grid grid-cols-2 gap-2">
                <button type="button" id="btn-conf-${item.id}" class="py-2 px-3 text-xs font-black rounded-lg border flex items-center justify-center gap-1 bg-emerald-500/10 border-emerald-500/40 text-emerald-400">
                    <i class="fa-solid fa-check-double text-[10px]"></i> CONFORME
                </button>
                <button type="button" id="btn-nconf-${item.id}" class="py-2 px-3 text-xs font-black rounded-lg border flex items-center justify-center gap-1 bg-slate-900 border-nibt-border text-slate-500">
                    <i class="fa-solid fa-ban text-[10px]"></i> NÃO CONFORME
                </button>
            </div>
        `;
        checklistContainer.appendChild(itemRow);

        const btnConf = itemRow.querySelector(`#btn-conf-${item.id}`);
        const btnNconf = itemRow.querySelector(`#btn-nconf-${item.id}`);

        btnConf.onclick = () => {
            conformidadeState[item.id] = 'Conforme';
            btnConf.className = "py-2 px-3 text-xs font-black rounded-lg border flex items-center justify-center gap-1 bg-emerald-500/10 border-emerald-500/40 text-emerald-400";
            btnNconf.className = "py-2 px-3 text-xs font-black rounded-lg border flex items-center justify-center gap-1 bg-slate-900 border-nibt-border text-slate-500";
        };

        btnNconf.onclick = () => {
            conformidadeState[item.id] = 'Não Conforme';
            btnConf.className = "py-2 px-3 text-xs font-black rounded-lg border flex items-center justify-center gap-1 bg-slate-900 border-nibt-border text-slate-500";
            btnNconf.className = "py-2 px-3 text-xs font-black rounded-lg border flex items-center justify-center gap-1 bg-red-500/10 border-red-500/40 text-red-400";
        };
    });
}

inspectionForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!auth.currentUser || !extintorAtual) return;

    if (verificarTravaDuplicidade(extintorAtual.id)) {
        window.showModal("Bloqueado", "Este extintor já foi inspecionado hoje!", "error");
        return;
    }

    const dataHoje = new Date().toISOString().split('T')[0];
    const submitBtn = inspectionForm.querySelector('button[type="submit"]');

    const payload = {
        idExtintor: extintorAtual.id,
        nomeBrigadista: auth.currentUser.email.split('@')[0],
        emailBrigadista: auth.currentUser.email,
        dataInspecao: dataHoje,
        timestamp: new Date().toISOString(),
        vencimentoRecarga: vencimentoRecarga.value,
        vencimentoHidrostatico: vencimentoHidrostatico.value,
        observacoes: observacoes.value.trim(),
        conformidade: { ...conformidadeState }
    };

    submitBtn.disabled = true;
    submitBtn.innerText = 'GRAVANDO VISTORIA...';

    try {
        const colInspecoes = collection(db, 'artifacts', appId, 'public', 'data', 'inspecoes');
        await addDoc(colInspecoes, payload);

        window.showModal("Sucesso!", `Vistoria do extintor ${extintorAtual.id} gravada.`, "success");

        inspectionForm.reset();
        extintorAtual = null;
        secVistoria.classList.add('hidden');
        secInventario.classList.remove('hidden');
    } catch (err) {
        window.showModal("Erro", "Falha ao registrar a vistoria.", "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'SALVAR VISTORIA';
    }
};

cancelVistoriaBtn.onclick = () => {
    inspectionForm.reset();
    extintorAtual = null;
    secVistoria.classList.add('hidden');
    secInventario.classList.remove('hidden');
};
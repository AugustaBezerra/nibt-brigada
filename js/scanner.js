// js/scanner.js
import { abrirVistoria } from './inspecao.js';
import { state } from './state.js';

let html5QrCode = null;
const readerContainer = document.getElementById('reader-container');
const secVistoria = document.getElementById('secVistoria');
const secInventario = document.getElementById('secInventario');
const secDetalhes = document.getElementById('secDetalhes');

// Inicializa os cliques das abas inferiores para gerenciar o scanner
export function initScanner() {
    const navScanTab = document.getElementById('navScanTab');
    const navInventarioTab = document.getElementById('navInventarioTab');

    if (!navScanTab || !navInventarioTab) return;

    navScanTab.onclick = () => {
        // Altera estados visuais da navegação (Scan ativa)
        navScanTab.classList.add('text-red-500');
        navScanTab.classList.remove('text-slate-400');
        navInventarioTab.classList.add('text-slate-400');
        navInventarioTab.classList.remove('text-red-500');

        // Esconde telas normais
        secInventario.classList.add('hidden');
        secDetalhes.classList.add('hidden');
        secVistoria.classList.add('hidden');
        
        // Exibe o container da câmera e inicializa
        readerContainer.classList.remove('hidden');
        startCamera();
    };

    navInventarioTab.onclick = () => {
        // Altera estados visuais da navegação (Inventário ativa)
        navInventarioTab.classList.add('text-red-500');
        navInventarioTab.classList.remove('text-slate-400');
        navScanTab.classList.add('text-slate-400');
        navScanTab.classList.remove('text-red-500');

        // Volta ao inventário
        secInventario.classList.remove('hidden');
        readerContainer.classList.add('hidden');
        stopCamera();
    };
}

// Liga a câmera do aparelho
function startCamera() {
    if (html5QrCode && html5QrCode.isScanning) return;
    
    // Html5Qrcode é exposto globalmente pelo script no index.html
    if (typeof Html5Qrcode === 'undefined') {
        console.error("Biblioteca html5-qrcode não carregou.");
        window.showModal("Erro", "Erro ao carregar módulo do leitor de QR Code.", "error");
        return;
    }

    html5QrCode = new Html5Qrcode("reader");
    const qrCodeSuccessCallback = (decodedText, decodedResult) => {
        const extId = decodedText.trim().toUpperCase();
        
        // Busca o extintor no cache local sincronizado
        const extintor = state.inventarioCache.find(e => e.id.toUpperCase() === extId);
        
        if (extintor) {
            stopCamera();
            readerContainer.classList.add('hidden');
            
            // Retorna o destaque da barra de navegação para a aba Inventário
            const navScanTab = document.getElementById('navScanTab');
            const navInventarioTab = document.getElementById('navInventarioTab');
            navInventarioTab.classList.add('text-red-500');
            navInventarioTab.classList.remove('text-slate-400');
            navScanTab.classList.add('text-slate-400');
            navScanTab.classList.remove('text-red-500');
            
            abrirVistoria(extintor);
        } else {
            window.showModal("Aviso", `Código QR "${decodedText}" não cadastrado no inventário.`, "error");
        }
    };
    
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    
    html5QrCode.start(
        { facingMode: "environment" }, // Preferência para câmera traseira
        config, 
        qrCodeSuccessCallback
    ).catch(err => {
        console.error("Falha ao abrir câmera", err);
        window.showModal("Erro", "Não foi possível acessar a câmera do dispositivo.", "error");
        
        // Retorna automático para a aba do Inventário em caso de falha de permissão
        const navInventarioTab = document.getElementById('navInventarioTab');
        if (navInventarioTab) navInventarioTab.click();
    });
}

// Desliga a câmera e libera o recurso do dispositivo
export function stopCamera() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            html5QrCode = null;
        }).catch(err => console.error("Erro ao desligar câmera", err));
    }
}

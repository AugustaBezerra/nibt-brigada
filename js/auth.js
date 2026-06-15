// js/auth.js
import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { startInventarioSync, stopInventarioSync } from './inventario.js';

const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const loginForm = document.getElementById('loginForm');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginError = document.getElementById('loginError');
const userEmailDisplay = document.getElementById('userEmailDisplay');
const logoutBtn = document.getElementById('logoutBtn');

export function initAuth() {
    // Escuta mudanças de estado do usuário
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userEmailDisplay.innerText = user.email;
            loginScreen.classList.add('hidden');
            appScreen.classList.remove('hidden');
            startInventarioSync(); // Começa a puxar os dados do banco
        } else {
            loginScreen.classList.remove('hidden');
            appScreen.classList.add('hidden');
            stopInventarioSync(); // Para os listeners para economizar memória
        }
    });

    // Evento de Submit do Formulário de Login
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        loginError.classList.add('hidden');
        const email = loginEmail.value.trim();
        const password = loginPassword.value.trim();

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            loginError.classList.remove('hidden');
            loginError.innerText = "Credenciais operacionais inválidas.";
        }
    };

    // Botão de Logout
    logoutBtn.onclick = async () => {
        await signOut(auth);
    };
}
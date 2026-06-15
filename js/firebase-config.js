// js/firebase-config.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyAwfyn8hTaveH5R2zE-kSCrUW_NFEg_U0w",
    authDomain: "brigadantb.firebaseapp.com",
    projectId: "brigadantb",
    storageBucket: "brigadantb.firebasestorage.app",
    messagingSenderId: "721794364692",
    appId: "1:721794364692:web:56f7f29a5f3d524db63e01",
    measurementId: "G-VWTLN2DX1P"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = 'brigadantb';
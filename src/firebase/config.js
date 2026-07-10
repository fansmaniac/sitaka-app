import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
// 1. IMPORT APP CHECK
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyADDWedVUYaJDl_vIdOELhpb_Imw7odtjU",
  authDomain: "sitaka-2026.firebaseapp.com",
  projectId: "sitaka-2026",
  storageBucket: "sitaka-2026.firebasestorage.app",
  messagingSenderId: "624532693532",
  appId: "1:624532693532:web:919ba2794204eab0c8b5d9"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);

// 2. INISIALISASI APP CHECK (reCAPTCHA v3)
const appCheck = initializeAppCheck(app, {
  // Site Key publik dimasukkan ke sini
  provider: new ReCaptchaV3Provider('6LdtyEwtAAAAAMiGA8gfTXmER51x785SijnONhu3'),
  
  // Mengaktifkan auto-refresh token agar user tidak terputus
  isTokenAutoRefreshEnabled: true 
});

// Inisialisasi Firestore Database & Auth
export const db = getFirestore(app);
export const auth = getAuth(app);
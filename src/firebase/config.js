import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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

// Inisialisasi Firestore Database
export const db = getFirestore(app);
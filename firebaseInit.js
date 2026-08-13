// Inizializzazione Firebase (App, Auth, Firestore, Storage) estratta da script.js.

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

// --- INCOLLA QUI LE TUE CHIAVI FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDt8pd18PRlF5wfERHjH42xsw4s64kp5BQ",
  authDomain: "japstudypro.firebaseapp.com",
  projectId: "japstudypro",
  storageBucket: "japstudypro.firebasestorage.app",
  messagingSenderId: "561634594964",
  appId: "1:561634594964:web:0109ae1e6fe5cc93b6e481"
};
// --- FINE CHIAVI ---

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
setPersistence(auth, browserLocalPersistence).catch(console.error);

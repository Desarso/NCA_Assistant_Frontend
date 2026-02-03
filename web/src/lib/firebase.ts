import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD9PucYvBRL4Pxi1cHFDQ60Ab8xIXeMXko",
  authDomain: "whagons-assistant.firebaseapp.com",
  projectId: "whagons-assistant",
  storageBucket: "whagons-assistant.firebasestorage.app",
  messagingSenderId: "372173091660",
  appId: "1:372173091660:web:adfc39f56c132ab686d5e9",
  measurementId: "G-6YNYVSR6PW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

export { 
    app, 
    auth, 
    storage,
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut,
    updateProfile,
    ref,
    uploadBytes,
    getDownloadURL
};

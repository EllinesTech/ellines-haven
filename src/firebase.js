import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            "AIzaSyAM-BhM2HQAZype3OU6nwH_ldzA6tf6yTg",
  authDomain:        "ellines-haven-web.firebaseapp.com",
  projectId:         "ellines-haven-web",
  storageBucket:     "ellines-haven-web.firebasestorage.app",
  messagingSenderId: "733742563669",
  appId:             "1:733742563669:web:3f5f627161d021c99aefdc",
  measurementId:     "G-NS37C57X64",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;

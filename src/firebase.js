/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║              ELLINES HAVEN — INFRASTRUCTURE OVERVIEW            ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║                                                                  ║
 * ║  HOSTING  →  Cloudflare Pages (ellines-haven)                   ║
 * ║              Live URL : haven.ellines.co.ke                      ║
 * ║              Preview  : ellines-haven.pages.dev                  ║
 * ║              Deploy   : git push origin main → auto-build        ║
 * ║                                                                  ║
 * ║  DATABASE →  Firebase (project: ellines-haven-web)               ║
 * ║              Firebase is used ONLY for:                          ║
 * ║                • Firestore (all app data — books, orders,        ║
 * ║                  users, libraries, messages, etc.)               ║
 * ║                • Firebase Auth (custom email/password)           ║
 * ║                • Firebase Storage (book covers, uploads)         ║
 * ║                • Cloud Functions (M-Pesa, Paystack, PayPal)      ║
 * ║              Firebase does NOT host the website files.           ║
 * ║                                                                  ║
 * ║  ADMIN EMAIL → ellines.haven@gmail.com                           ║
 * ║  SUPPORT TEL → +254 748 255 466 (WhatsApp)                       ║
 * ║                                                                  ║
 * ║  DO NOT run `firebase deploy --only hosting`                     ║
 * ║  The site is hosted on Cloudflare Pages, NOT Firebase Hosting.   ║
 * ║  Deploying to Firebase Hosting has NO effect on the live site.   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';

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

// Enable IndexedDB offline persistence with multi-tab support.
// Falls back to memory cache if IndexedDB is unavailable (private browsing, etc.)
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (e) {
  // Fallback: default Firestore (no offline persistence) — prevents white-screen crash
  console.warn('[Firebase] Offline persistence unavailable, using default cache:', e.message);
  db = getFirestore(app);
}
export { db };

export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');

// Callable cloud functions
export const callStkPush          = (data) => httpsCallable(functions, 'stkPush')(data);
export const callQueryPayStatus   = (data) => httpsCallable(functions, 'queryPaymentStatus')(data);
export const callVerifyPaystack   = (data) => httpsCallable(functions, 'verifyPaystackPayment')(data);
export const callCreatePayPalOrder  = (data) => httpsCallable(functions, 'createPayPalOrder')(data);
export const callCapturePayPalOrder = (data) => httpsCallable(functions, 'capturePayPalOrder')(data);
export const callTrackVisitor     = (data) => httpsCallable(functions, 'trackVisitor')(data);

export default app;

// src/firebase.js
// Initialize Firebase — replace config with your Firebase project credentials
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
export const isFirebaseConfigured = !!(
  apiKey &&
  apiKey !== 'YOUR_API_KEY' &&
  apiKey !== 'your_api_key' &&
  apiKey !== ''
);

let app = null;
let auth = null;
let db = null;
let messaging = null;
let storage = null;
let functions = null;

if (isFirebaseConfigured) {
  const firebaseConfig = {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  };

  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    functions = getFunctions(app);

    // Enable offline persistence using the modern API
    // (Replaces deprecated enableIndexedDbPersistence from Firebase v9 compat layer)
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  } catch (error) {
    console.error('Firebase initialization failed:', error);
  }
}

// Optional Firebase services — dynamically loaded when feature is actively used
export async function getFirebaseStorage() {
  if (!storage && app) {
    const { getStorage } = await import('firebase/storage');
    storage = getStorage(app);
  }
  return storage;
}

export async function getFirebaseMessaging() {
  if (!messaging && app) {
    const { getMessaging, isSupported } = await import('firebase/messaging');
    const supported = await isSupported();
    if (supported) {
      messaging = getMessaging(app);
    }
  }
  return messaging;
}

export { app, auth, db, messaging, storage, functions };

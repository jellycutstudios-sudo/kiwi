// src/firebase.js
// Initialize Firebase — replace config with your Firebase project credentials
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getMessaging, isSupported } from 'firebase/messaging';

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
    db = getFirestore(app);

    // Enable offline persistence
    enableIndexedDbPersistence(db).catch(() => {});

    // FCM — only in browsers that support it
    isSupported().then(supported => {
      if (supported) {
        messaging = getMessaging(app);
      }
    });
  } catch (error) {
    console.error('Firebase initialization failed:', error);
  }
}

export { app, auth, db, messaging };


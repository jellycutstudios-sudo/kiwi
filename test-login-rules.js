import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const config = {};
env.split("\n").forEach(line => {
  const [k, v] = line.split("=");
  if (k && v) config[k.replace('VITE_FIREBASE_', '')] = v.trim();
});

const app = initializeApp({
  apiKey: config.API_KEY,
  authDomain: config.AUTH_DOMAIN,
  projectId: config.PROJECT_ID,
  storageBucket: config.STORAGE_BUCKET,
  messagingSenderId: config.MESSAGING_SENDER_ID,
  appId: config.APP_ID
});

const auth = getAuth(app);
const db = getFirestore(app);

async function testAdmin() {
  console.log("\n--- Testing Admin ---");
  try {
    const cred = await signInWithEmailAndPassword(auth, "salman@kiwi.com", "password123");
    console.log("Admin Auth Success:", cred.user.uid);
    
    console.log("Reading user doc...");
    const userDoc = await getDoc(doc(db, "users", cred.user.uid));
    console.log("User doc read success:", userDoc.exists());
    
    console.log("Reading restaurant...");
    const restDoc = await getDoc(doc(db, "restaurants", "rest1"));
    console.log("Restaurant read success:", restDoc.exists());
    
  } catch(e) {
    console.error("Admin Error:", e.message);
  }
}

async function testStaff() {
  console.log("\n--- Testing Staff PIN ---");
  try {
    const cred = await signInAnonymously(auth);
    console.log("Anon Auth Success:", cred.user.uid);
    
    console.log("Reading restaurant query...");
    const q = query(collection(db, "restaurants"), where("customId", "==", "kiwi"));
    const restSnap = await getDocs(q);
    console.log("Restaurant query success, docs:", restSnap.size);
    
    console.log("Reading PIN...");
    const pinDoc = await getDoc(doc(db, "restaurants", "rest1", "pins", "1234"));
    console.log("PIN read success:", pinDoc.exists());

    console.log("Reading Staff Profile...");
    const staffDoc = await getDoc(doc(db, "restaurants", "rest1", "staff", "staff1"));
    console.log("Staff profile read success:", staffDoc.exists());
  } catch(e) {
    console.error("Staff Error:", e.message);
  }
}

async function run() {
  await testAdmin();
  await testStaff();
  process.exit(0);
}
run();

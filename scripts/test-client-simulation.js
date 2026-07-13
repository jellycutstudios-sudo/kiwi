import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const apiKey = env.match(/VITE_FIREBASE_API_KEY=(.*)/)[1];
const projectId = env.match(/VITE_FIREBASE_PROJECT_ID=(.*)/)[1];

const app = initializeApp({ apiKey, projectId });
const auth = getAuth(app);
const db = getFirestore(app);

async function test() {
  try {
    const cred = await signInAnonymously(auth);
    console.log("Anon UID:", cred.user.uid);
    
    // Simulate token decode
    const token = await cred.user.getIdTokenResult();
    console.log("Sign in provider:", token.claims.firebase.sign_in_provider);

    const actualRestId = "rest1";
    const staffId = "dfOQTiqpQi725JIUzLhu"; // Fahad

    const staffProfileRef = doc(db, 'restaurants', actualRestId, 'staff', staffId);
    console.log("Fetching staff profile...");
    const staffProfileSnap = await getDoc(staffProfileRef);
    console.log("Success:", staffProfileSnap.data());

  } catch(e) {
    console.error("Simulation error:", e.message);
  }
  process.exit(0);
}
test();

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const apiKey = env.match(/VITE_FIREBASE_API_KEY=(.*)/)[1];
const projectId = env.match(/VITE_FIREBASE_PROJECT_ID=(.*)/)[1];

const app = initializeApp({ apiKey, projectId });
const auth = getAuth(app);
const db = getFirestore(app);

async function test() {
  try {
    console.log("Testing Anonymous Auth...");
    const anonCred = await signInAnonymously(auth);
    console.log("Anon Auth Success! UID:", anonCred.user.uid);
  } catch (e) {
    console.error("Anon Auth Failed:", e.code, e.message);
  }
}
test();

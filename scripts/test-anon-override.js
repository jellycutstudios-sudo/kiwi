import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signInWithEmailAndPassword } from "firebase/auth";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const apiKey = env.match(/VITE_FIREBASE_API_KEY=(.*)/)[1];
const projectId = env.match(/VITE_FIREBASE_PROJECT_ID=(.*)/)[1];

const app = initializeApp({ apiKey, projectId });
const auth = getAuth(app);

async function test() {
  try {
    const cred = await signInWithEmailAndPassword(auth, "salman@kiwi.com", "password123");
    console.log("Logged in with email:", cred.user.uid);
    
    console.log("Now trying to signInAnonymously...");
    const anon = await signInAnonymously(auth);
    console.log("Anon success:", anon.user.uid);
  } catch(e) {
    console.error("Error:", e.code, e.message);
  }
  process.exit(0);
}
test();

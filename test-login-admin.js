import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const apiKey = env.match(/VITE_FIREBASE_API_KEY=(.*)/)[1];
const projectId = env.match(/VITE_FIREBASE_PROJECT_ID=(.*)/)[1];

const app = initializeApp({ apiKey, projectId });
const auth = getAuth(app);

async function test() {
  try {
    console.log("Testing Email/Password Auth...");
    const cred = await signInWithEmailAndPassword(auth, "admin@demo.com", "password123");
    console.log("Auth Success! UID:", cred.user.uid);
  } catch (e) {
    console.error("Auth Failed:", e.code, e.message);
  }
  process.exit(0);
}
test();

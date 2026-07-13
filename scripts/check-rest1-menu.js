import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const apiKey = env.match(/VITE_FIREBASE_API_KEY=(.*)/)[1];
const projectId = env.match(/VITE_FIREBASE_PROJECT_ID=(.*)/)[1];

const app = initializeApp({ apiKey, projectId });
const auth = getAuth(app);
const db = getFirestore(app);

async function test() {
  try {
    console.log("Checking rest1");
    const menu1 = await getDocs(collection(db, 'restaurants', 'rest1', 'menu'));
    menu1.forEach(doc => console.log(doc.id, doc.data().name));
  } catch(e) {
    console.error("FAIL:", e);
  }
  process.exit(0);
}
test();

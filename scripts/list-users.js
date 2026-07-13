import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const apiKey = env.match(/VITE_FIREBASE_API_KEY=(.*)/)[1];
const projectId = env.match(/VITE_FIREBASE_PROJECT_ID=(.*)/)[1];

const app = initializeApp({ apiKey, projectId });
const db = getFirestore(app);

async function test() {
  try {
    const r = await getDoc(doc(db, "restaurants/rest1"));
    console.log("rest1 ownerUid:", r.data().ownerUid);
    // Since we don't have admin SDK, we can't read users easily unless we know the UID
    const uid = r.data().ownerUid;
    if (uid) {
        // Can we read it anonymously? Probably not. Let's try.
        const u = await getDoc(doc(db, "users", uid));
        console.log("user doc:", u.data());
    }
  } catch(e) {
    console.error(e.message);
  }
  process.exit(0);
}
test();

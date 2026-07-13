import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
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
    await signInWithEmailAndPassword(auth, "salman@kiwi.com", "password123");
    
    const restQuery = await getDocs(collection(db, 'restaurants'));
    restQuery.forEach(doc => {
      console.log("Restaurant:", doc.id, doc.data().name, doc.data().customId);
    });
  } catch(e) {
    console.error("FAIL:", e);
  }
  process.exit(0);
}
test();

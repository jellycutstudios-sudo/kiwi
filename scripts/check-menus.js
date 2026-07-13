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
    
    console.log("Checking pk cafe (PqfB5AygpLjmW2T6ui0E)");
    const menu1 = await getDocs(collection(db, 'restaurants', 'PqfB5AygpLjmW2T6ui0E', 'menu'));
    menu1.forEach(doc => console.log(doc.id, doc.data().name));
    
    console.log("Checking cafesal (k1pvEH2sLThuBbh5mxkq)");
    const menu2 = await getDocs(collection(db, 'restaurants', 'k1pvEH2sLThuBbh5mxkq', 'menu'));
    menu2.forEach(doc => console.log(doc.id, doc.data().name));

  } catch(e) {
    console.error("FAIL:", e);
  }
  process.exit(0);
}
test();

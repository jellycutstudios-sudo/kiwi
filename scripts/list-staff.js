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
    console.log("Logged in as admin");
    
    const restQuery = await getDocs(collection(db, 'restaurants', 'rest1', 'staff'));
    restQuery.forEach(doc => {
      console.log("Staff:", doc.id, doc.data());
    });
    
    console.log("Looking up pins via brute force for rest1...");
    // Since list is false for pins, we can't query it.
    // We already know 1234 is a pin.
  } catch(e) {
    console.error("FAIL:", e);
  }
  process.exit(0);
}
test();

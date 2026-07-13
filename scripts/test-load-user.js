import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
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
    const cred = await signInWithEmailAndPassword(auth, "salman@kiwi.com", "password123");
    console.log("Logged in with email:", cred.user.uid);
    
    console.log("Fetching user doc...");
    const userDocRef = doc(db, 'users', cred.user.uid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
       console.log("User doc:", userSnap.data());
       if (userSnap.data().restaurantId) {
           console.log("Fetching restaurant...");
           const restDoc = await getDoc(doc(db, "restaurants", userSnap.data().restaurantId));
           console.log("Restaurant:", restDoc.exists());
       }
    } else {
       console.log("User doc does not exist.");
    }
  } catch(e) {
    console.error("Error:", e.message);
  }
  process.exit(0);
}
test();

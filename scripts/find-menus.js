import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collectionGroup, getDocs } from "firebase/firestore";
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
    
    console.log("Querying all menus via collectionGroup...");
    const menus = await getDocs(collectionGroup(db, 'menu'));
    if (menus.empty) {
        console.log("No menu items found anywhere!");
    } else {
        menus.forEach(doc => {
            console.log("Found menu item:", doc.id, doc.data().name, "in path:", doc.ref.path);
        });
    }
  } catch(e) {
    console.error("FAIL:", e);
  }
  process.exit(0);
}
test();

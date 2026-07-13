import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const apiKey = env.match(/VITE_FIREBASE_API_KEY=(.*)/)[1];
const projectId = env.match(/VITE_FIREBASE_PROJECT_ID=(.*)/)[1];

const app = initializeApp({ apiKey, projectId });
const auth = getAuth(app);
const db = getFirestore(app);

async function test() {
  try {
    const cred = await signInWithEmailAndPassword(auth, "admin@demo.com", "password123");
    console.log("Logged in as admin@demo.com, uid:", cred.user.uid);
    const u = await getDoc(doc(db, "users", cred.user.uid));
    console.log("User doc:", u.data());
    
    if (u.data() && u.data().restaurantId) {
        const restId = u.data().restaurantId;
        console.log("Restaurant ID:", restId);
        const r = await getDoc(doc(db, "restaurants", restId));
        console.log("Restaurant doc:", r.data());
        
        const staffRef = await getDocs(collection(db, "restaurants", restId, "staff"));
        staffRef.forEach(d => console.log("Staff:", d.id, d.data()));
        
        const pinsRef = await getDocs(collection(db, "restaurants", restId, "pins"));
        pinsRef.forEach(d => console.log("Pin:", d.id, d.data()));
        
        const menuRef = await getDocs(collection(db, "restaurants", restId, "menu"));
        menuRef.forEach(d => console.log("Menu:", d.id, d.data().name));
    }
  } catch(e) {
    console.error("FAIL:", e);
  }
  process.exit(0);
}
test();

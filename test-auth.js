import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { readFileSync } from "fs";

const html = readFileSync("./index.html", "utf-8");
const env = readFileSync(".env", "utf-8");
const apiKey = env.match(/VITE_FIREBASE_API_KEY=(.*)/)[1];
const projectId = env.match(/VITE_FIREBASE_PROJECT_ID=(.*)/)[1];

const app = initializeApp({
  apiKey,
  projectId,
});
const db = getFirestore(app);

async function test() {
  console.log("Querying...");
  try {
    const q = query(collection(db, "restaurants"), where("customId", "==", "kiwi"));
    const snap = await getDocs(q);
    console.log("Docs found:", snap.docs.length);
    snap.docs.forEach(d => console.log(d.id, d.data().customId));
    
    // Also try checking the specific document rest1
    const docSnap = await getDoc(doc(db, "restaurants", "rest1"));
    if (docSnap.exists()) {
        console.log("rest1 exists, customId:", docSnap.data().customId, "slug:", docSnap.data().slug);
    }
  } catch(e) {
    console.error(e);
  }
}
test();

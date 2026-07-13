import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const apiKey = env.match(/VITE_FIREBASE_API_KEY=(.*)/)[1];
const projectId = env.match(/VITE_FIREBASE_PROJECT_ID=(.*)/)[1];

const app = initializeApp({ apiKey, projectId });
const db = getFirestore(app);

async function test() {
  try {
    console.log("Listing pins for rest1...");
    // This will fail from client SDK if firestore rules block list on /pins
    // But let's try it anyway
    const snap = await getDocs(collection(db, "restaurants/rest1/pins"));
    snap.docs.forEach(d => console.log(d.id, d.data()));
  } catch(e) {
    console.error(e.message);
  }
}
test();

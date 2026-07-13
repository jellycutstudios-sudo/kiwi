import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const apiKey = env.match(/VITE_FIREBASE_API_KEY=(.*)/)[1];
const projectId = env.match(/VITE_FIREBASE_PROJECT_ID=(.*)/)[1];

const app = initializeApp({ apiKey, projectId });
const auth = getAuth(app);
const db = getFirestore(app);

async function test() {
  await signInAnonymously(auth);
  console.log("Logged in anonymously.");
  
  const validPins = [];
  // Brute force 0000-9999
  const batchSize = 100;
  for (let i = 0; i < 10000; i += batchSize) {
    const promises = [];
    for (let j = 0; j < batchSize; j++) {
      const pin = String(i + j).padStart(4, '0');
      promises.push(
        getDoc(doc(db, "restaurants/rest1/pins", pin))
          .then(snap => {
            if (snap.exists()) {
              validPins.push({ pin, data: snap.data() });
            }
          })
          .catch(err => {})
      );
    }
    await Promise.all(promises);
    process.stdout.write(`\rChecked up to ${i + batchSize}`);
  }
  console.log("\nValid PINs found:");
  console.log(validPins);
  process.exit(0);
}
test();

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const apiKey = env.match(/VITE_FIREBASE_API_KEY=(.*)/)[1];
const projectId = env.match(/VITE_FIREBASE_PROJECT_ID=(.*)/)[1];

const app = initializeApp({ apiKey, projectId });
const auth = getAuth(app);
const db = getFirestore(app);

async function test() {
  try {
    await signInAnonymously(auth);
    console.log("Logged in anonymously.");

    const cleanRestId = "kiwi";
    let actualRestId = cleanRestId;

    const restQuery = query(collection(db, 'restaurants'), where('customId', '==', cleanRestId));
    const restSnap = await getDocs(restQuery);
    
    if (!restSnap.empty) {
      actualRestId = restSnap.docs[0].id;
      console.log("Found restaurant by customId:", actualRestId);
    } else {
      console.log("Not found by customId, trying slug...");
      const slugQuery = query(collection(db, 'restaurants'), where('slug', '==', cleanRestId));
      const slugSnap = await getDocs(slugQuery);
      if (!slugSnap.empty) {
        actualRestId = slugSnap.docs[0].id;
        console.log("Found restaurant by slug:", actualRestId);
      } else {
        console.log("Not found by slug either.");
      }
    }

    const pin = "1234";
    console.log("Looking up PIN doc...", `restaurants/${actualRestId}/pins/${pin}`);
    const staffRef = doc(db, 'restaurants', actualRestId, 'pins', pin);
    const snap = await getDoc(staffRef);
    if (!snap.exists()) {
      console.log('Invalid PIN');
      process.exit(1);
    }
    const { staffId } = snap.data();
    console.log("Staff ID from PIN:", staffId);

    const staffProfileRef = doc(db, 'restaurants', actualRestId, 'staff', staffId);
    const staffProfileSnap = await getDoc(staffProfileRef);
    if (!staffProfileSnap.exists() || staffProfileSnap.data().active === false) {
      console.log('Invalid PIN or account deactivated');
      process.exit(1);
    }
    console.log("Staff profile:", staffProfileSnap.data());

    const restDoc = await getDoc(doc(db, 'restaurants', actualRestId));
    if (!restDoc.exists()) {
      console.log('Restaurant not found');
      process.exit(1);
    }
    console.log("Restaurant doc:", restDoc.data());

    console.log("SUCCESS!");
  } catch(e) {
    console.error("FAIL:", e);
  }
  process.exit(0);
}
test();

import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const apiKey = env.match(/VITE_FIREBASE_API_KEY=(.*)/)[1];
const projectId = env.match(/VITE_FIREBASE_PROJECT_ID=(.*)/)[1];

const app = initializeApp({ apiKey, projectId });
const auth = getAuth(app);
const db = getFirestore(app);

async function createAdmin() {
  try {
    const email = "demo@kiwi.com";
    const password = "password123";
    console.log(`Creating user ${email}...`);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    console.log("User created! UID:", uid);

    console.log("Setting user doc...");
    await setDoc(doc(db, "users", uid), {
      email,
      name: "Demo Admin",
      role: "admin",
      restaurantId: "rest1",
      createdAt: new Date()
    });
    console.log("Admin user successfully set up for rest1!");
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
        console.log("demo@kiwi.com already exists. That's fine, we can use it.");
    } else {
        console.error("Failed:", e.code, e.message);
    }
  }
  process.exit(0);
}
createAdmin();

import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';

const env = fs.readFileSync('.env', 'utf-8');
const apiKey = env.match(/VITE_FIREBASE_API_KEY=(.*)/)[1];
const projectId = env.match(/VITE_FIREBASE_PROJECT_ID=(.*)/)[1];

const app = initializeApp({ apiKey, projectId });
const auth = getAuth(app);
const db = getFirestore(app);

const url = 'https://images.unsplash.com/photo-1626804475297-41609ea004eb?auto=format&fit=crop&w=400&q=80';
const filename = 'chicken_caesar_wrap.jpg';
const dir = path.join(process.cwd(), 'public', 'menu-images');

async function run() {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Status: ' + res.status);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(path.join(dir, filename), Buffer.from(buffer));
    console.log('Downloaded wrap image!');

    await signInWithEmailAndPassword(auth, "demo@kiwi.com", "password123");
    const restId = "rest1";
    const menuRef = collection(db, "restaurants", restId, "menu");
    const snapshot = await getDocs(menuRef);
    
    for (const d of snapshot.docs) {
      const data = d.data();
      if (data.name === 'Tacos & Wraps') {
        const updatedItems = data.items.map(item => {
          if (item.name === 'Chicken Caesar Wrap') {
            return {
              ...item,
              imageUrl: `/menu-images/${filename}`
            };
          }
          return item;
        });
        await updateDoc(doc(db, "restaurants", restId, "menu", d.id), {
          items: updatedItems
        });
        console.log('Updated Chicken Caesar Wrap in DB!');
      }
    }
  } catch (e) {
    console.error('Failed to fix wrap image:', e.message);
  }
  process.exit(0);
}
run();

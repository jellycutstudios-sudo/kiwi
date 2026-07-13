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

const imgMap = {
  'Burgers & Sandwiches': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
  'Artisanal Pizzas': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80',
  'Starters & Sides': 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=400&q=80',
  'Beverages': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80',
  'Desserts': 'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=400&q=80',
  'Pasta & Mains': 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=400&q=80',
  'Tacos & Wraps': 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=400&q=80'
};

const dir = path.join(process.cwd(), 'public', 'menu-images');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

async function download(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch ' + url);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(path.join(dir, filename), Buffer.from(buffer));
    console.log('Downloaded', filename);
  } catch (e) {
    console.error('Error downloading', url, e);
  }
}

async function run() {
  // 1. Download images
  for (const [cat, url] of Object.entries(imgMap)) {
    const filename = cat.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.jpg';
    await download(url, filename);
  }

  // 2. Update Firestore
  await signInWithEmailAndPassword(auth, "demo@kiwi.com", "password123");
  const restId = "rest1";
  const menuRef = collection(db, "restaurants", restId, "menu");
  const snapshot = await getDocs(menuRef);
  
  for (const d of snapshot.docs) {
    const data = d.data();
    const catName = data.name;
    const filename = catName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.jpg';
    
    // update all items in this category to use local image
    const updatedItems = data.items.map(item => ({
      ...item,
      imageUrl: `/menu-images/${filename}`
    }));
    
    await updateDoc(doc(db, "restaurants", restId, "menu", d.id), {
      items: updatedItems
    });
    console.log('Updated category in DB:', catName);
  }
  
  console.log('All done!');
  process.exit(0);
}

run();

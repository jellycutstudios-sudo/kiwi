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

const itemImages = {
  // Burgers & Sandwiches
  'Classic Cheeseburger': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
  'Double Bacon Smash': 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=400&q=80',
  'Spicy Chicken Sandwich': 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=400&q=80',
  'BBQ Pulled Pork': 'https://images.unsplash.com/photo-1521305916504-4a1121188589?auto=format&fit=crop&w=400&q=80',
  'Vegan Beyond Burger': 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=400&q=80',

  // Artisanal Pizzas
  'Margherita': 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=400&q=80',
  'Pepperoni Feast': 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=400&q=80',
  'BBQ Chicken Pizza': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80',
  'Veggie Supreme': 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=400&q=80',
  'Four Cheese': 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=400&q=80',

  // Starters & Sides
  'Truffle Parmesan Fries': 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=400&q=80',
  'Crispy Calamari': 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=400&q=80',
  'Mozzarella Sticks': 'https://images.unsplash.com/photo-1531749668029-2db88e4276c7?auto=format&fit=crop&w=400&q=80',
  'Garlic Bread': 'https://images.unsplash.com/photo-1619535860434-ba1d8fa12536?auto=format&fit=crop&w=400&q=80',
  'Buffalo Wings': 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=400&q=80',

  // Beverages
  'Iced Matcha Latte': 'https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=400&q=80',
  'Fresh Lemonade': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80',
  'Classic Mojito': 'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?auto=format&fit=crop&w=400&q=80',

  // Desserts
  'New York Cheesecake': 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=400&q=80',
  'Warm Chocolate Lava Cake': 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=400&q=80',
  'Tiramisu': 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=400&q=80',
  'Vanilla Bean Gelato': 'https://images.unsplash.com/photo-1560008511-11c63416e52d?auto=format&fit=crop&w=400&q=80',

  // Pasta & Mains
  'Spaghetti Carbonara': 'https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=400&q=80',
  'Fettuccine Alfredo': 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?auto=format&fit=crop&w=400&q=80',
  'Grilled Salmon': 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=400&q=80',
  'Ribeye Steak': 'https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=400&q=80',

  // Tacos & Wraps
  'Beef Birria Tacos': 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=400&q=80',
  'Baja Fish Tacos': 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=400&q=80',
  'Chicken Caesar Wrap': 'https://images.unsplash.com/photo-1626700051175-6518c4793f4f?auto=format&fit=crop&w=400&q=80'
};

const dir = path.join(process.cwd(), 'public', 'menu-images');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

async function download(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch ' + url + ' Status: ' + res.status);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(path.join(dir, filename), Buffer.from(buffer));
    console.log('Downloaded unique image:', filename);
  } catch (e) {
    console.error('Error downloading:', url, e.message);
  }
}

async function run() {
  // 1. Download unique images
  for (const [itemName, url] of Object.entries(itemImages)) {
    const filename = itemName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.jpg';
    await download(url, filename);
  }

  // 2. Update Firestore items to point to unique local images
  await signInWithEmailAndPassword(auth, "demo@kiwi.com", "password123");
  const restId = "rest1";
  const menuRef = collection(db, "restaurants", restId, "menu");
  const snapshot = await getDocs(menuRef);
  
  for (const d of snapshot.docs) {
    const data = d.data();
    const updatedItems = data.items.map(item => {
      const filename = item.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.jpg';
      const localPath = `/menu-images/${filename}`;
      // Double check if file exists
      if (fs.existsSync(path.join(dir, filename))) {
        return {
          ...item,
          imageUrl: localPath
        };
      }
      return item; // Keep existing if download failed
    });
    
    await updateDoc(doc(db, "restaurants", restId, "menu", d.id), {
      items: updatedItems
    });
    console.log('Updated category items in DB:', data.name);
  }
  
  console.log('Finished updating Firestore with unique, local images!');
  process.exit(0);
}

run();

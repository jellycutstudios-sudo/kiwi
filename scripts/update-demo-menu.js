import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs, deleteDoc, doc, addDoc } from "firebase/firestore";
import { readFileSync } from "fs";

const env = readFileSync(".env", "utf-8");
const apiKey = env.match(/VITE_FIREBASE_API_KEY=(.*)/)[1];
const projectId = env.match(/VITE_FIREBASE_PROJECT_ID=(.*)/)[1];

const app = initializeApp({ apiKey, projectId });
const auth = getAuth(app);
const db = getFirestore(app);

const newMenu = [
  {
    name: 'Burgers & Sandwiches',
    emoji: '🍔',
    items: [
      {
        id: crypto.randomUUID(),
        name: 'Classic Cheeseburger',
        price: 250,
        description: '100% Angus beef patty, cheddar, lettuce, tomato, house sauce.',
        emoji: '🍔',
        available: true,
        station: 'Grill',
        imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Double Bacon Smash',
        price: 350,
        description: 'Two smashed patties, crispy bacon, american cheese, caramelized onions.',
        emoji: '🥓',
        available: true,
        station: 'Grill',
        imageUrl: 'https://images.unsplash.com/photo-1594212202875-86ac1af82bc9?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Spicy Chicken Sandwich',
        price: 280,
        description: 'Crispy fried chicken breast, spicy mayo, pickles, brioche bun.',
        emoji: '🍗',
        available: true,
        station: 'Fryer',
        imageUrl: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=400&q=80'
      }
    ]
  },
  {
    name: 'Artisanal Pizzas',
    emoji: '🍕',
    items: [
      {
        id: crypto.randomUUID(),
        name: 'Margherita',
        price: 350,
        description: 'San Marzano tomato sauce, fresh mozzarella, basil, EVOO.',
        emoji: '🍕',
        available: true,
        station: 'Kitchen',
        imageUrl: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Pepperoni Feast',
        price: 450,
        description: 'Double pepperoni, mozzarella, hot honey drizzle.',
        emoji: '🍕',
        available: true,
        station: 'Kitchen',
        imageUrl: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=400&q=80'
      }
    ]
  },
  {
    name: 'Starters & Sides',
    emoji: '🍟',
    items: [
      {
        id: crypto.randomUUID(),
        name: 'Truffle Parmesan Fries',
        price: 180,
        description: 'Crispy fries tossed in truffle oil, parmesan, and parsley.',
        emoji: '🍟',
        available: true,
        station: 'Fryer',
        imageUrl: 'https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Crispy Calamari',
        price: 260,
        description: 'Lightly dusted calamari rings served with lemon aioli.',
        emoji: '🦑',
        available: true,
        station: 'Fryer',
        imageUrl: 'https://images.unsplash.com/photo-1600803907087-f56d462fd26b?auto=format&fit=crop&w=400&q=80'
      }
    ]
  },
  {
    name: 'Beverages',
    emoji: '🥤',
    items: [
      {
        id: crypto.randomUUID(),
        name: 'Iced Matcha Latte',
        price: 180,
        description: 'Premium ceremonial grade matcha, whole milk, over ice.',
        emoji: '🍵',
        available: true,
        station: 'Bar',
        imageUrl: 'https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Cold Brew Coffee',
        price: 150,
        description: '18-hour steeped cold brew, served black or with milk.',
        emoji: '☕',
        available: true,
        station: 'Bar',
        imageUrl: 'https://images.unsplash.com/photo-1461023058943-0708e52150fe?auto=format&fit=crop&w=400&q=80'
      }
    ]
  },
  {
    name: 'Desserts',
    emoji: '🍰',
    items: [
      {
        id: crypto.randomUUID(),
        name: 'New York Cheesecake',
        price: 220,
        description: 'Classic baked cheesecake with a graham cracker crust and berry compote.',
        emoji: '🍰',
        available: true,
        station: 'Bakery',
        imageUrl: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Warm Chocolate Lava Cake',
        price: 250,
        description: 'Gooey chocolate center, served with vanilla bean ice cream.',
        emoji: '🍫',
        available: true,
        station: 'Bakery',
        imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=400&q=80'
      }
    ]
  }
];

async function run() {
  try {
    await signInWithEmailAndPassword(auth, "demo@kiwi.com", "password123");
    const restId = "rest1";
    
    // 1. Fetch current categories
    const menuRef = collection(db, "restaurants", restId, "menu");
    const snapshot = await getDocs(menuRef);
    
    // 2. Delete all current categories
    console.log(`Deleting ${snapshot.docs.length} old categories...`);
    for (const d of snapshot.docs) {
      await deleteDoc(doc(db, "restaurants", restId, "menu", d.id));
    }
    
    // 3. Add new categories and items
    console.log("Adding new professional categories...");
    for (const cat of newMenu) {
      const docRef = await addDoc(menuRef, {
        name: cat.name,
        emoji: cat.emoji,
        items: cat.items
      });
      console.log(`Added category: ${cat.name} (${docRef.id})`);
    }
    
    console.log("Menu update complete!");
  } catch (e) {
    console.error("FAIL:", e);
  }
  process.exit(0);
}
run();

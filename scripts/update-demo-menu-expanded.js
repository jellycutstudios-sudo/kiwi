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
      },
      {
        id: crypto.randomUUID(),
        name: 'BBQ Pulled Pork',
        price: 320,
        description: 'Slow-cooked pulled pork, house BBQ sauce, creamy slaw.',
        emoji: '🥪',
        available: true,
        station: 'Kitchen',
        imageUrl: 'https://images.unsplash.com/photo-1627308595229-7830f5c90683?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Vegan Beyond Burger',
        price: 380,
        description: 'Plant-based patty, vegan cheese, avocado, lettuce.',
        emoji: '🌱',
        available: true,
        station: 'Grill',
        imageUrl: 'https://images.unsplash.com/photo-1594212202715-bee27c95a044?auto=format&fit=crop&w=400&q=80'
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
      },
      {
        id: crypto.randomUUID(),
        name: 'BBQ Chicken Pizza',
        price: 480,
        description: 'BBQ sauce, grilled chicken, red onions, cilantro.',
        emoji: '🍕',
        available: true,
        station: 'Kitchen',
        imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Veggie Supreme',
        price: 400,
        description: 'Mushrooms, bell peppers, olives, onions, tomatoes.',
        emoji: '🍄',
        available: true,
        station: 'Kitchen',
        imageUrl: 'https://images.unsplash.com/photo-1585238342024-78d387f4a707?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Four Cheese',
        price: 420,
        description: 'Mozzarella, provolone, parmesan, gorgonzola.',
        emoji: '🧀',
        available: true,
        station: 'Kitchen',
        imageUrl: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=400&q=80'
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
      },
      {
        id: crypto.randomUUID(),
        name: 'Mozzarella Sticks',
        price: 200,
        description: 'Served with house marinara sauce.',
        emoji: '🧀',
        available: true,
        station: 'Fryer',
        imageUrl: 'https://images.unsplash.com/photo-1531749668029-2db88e4276c7?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Garlic Bread',
        price: 120,
        description: 'Toasted baguette with garlic butter and herbs.',
        emoji: '🥖',
        available: true,
        station: 'Bakery',
        imageUrl: 'https://images.unsplash.com/photo-1573140247632-f8fd74997d5c?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Buffalo Wings',
        price: 350,
        description: 'Spicy buffalo wings served with blue cheese dip.',
        emoji: '🍗',
        available: true,
        station: 'Fryer',
        imageUrl: 'https://images.unsplash.com/photo-1524114664604-cd8133cd67ad?auto=format&fit=crop&w=400&q=80'
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
      },
      {
        id: crypto.randomUUID(),
        name: 'Fresh Lemonade',
        price: 120,
        description: 'Freshly squeezed lemons with a hint of mint.',
        emoji: '🍋',
        available: true,
        station: 'Bar',
        imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Mango Smoothie',
        price: 200,
        description: 'Blended Alphonso mangoes with yogurt.',
        emoji: '🥭',
        available: true,
        station: 'Bar',
        imageUrl: 'https://images.unsplash.com/photo-1553530666-ba11a7dc2ae8?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Classic Mojito',
        price: 250,
        description: 'Mint, lime, sugar, soda water.',
        emoji: '🍹',
        available: true,
        station: 'Bar',
        imageUrl: 'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?auto=format&fit=crop&w=400&q=80'
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
      },
      {
        id: crypto.randomUUID(),
        name: 'Tiramisu',
        price: 280,
        description: 'Coffee-soaked ladyfingers, mascarpone, cocoa powder.',
        emoji: '🍰',
        available: true,
        station: 'Bakery',
        imageUrl: 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Vanilla Bean Gelato',
        price: 150,
        description: 'Authentic Italian gelato.',
        emoji: '🍨',
        available: true,
        station: 'Kitchen',
        imageUrl: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=400&q=80'
      }
    ]
  },
  {
    name: 'Pasta & Mains',
    emoji: '🍝',
    items: [
      {
        id: crypto.randomUUID(),
        name: 'Spaghetti Carbonara',
        price: 450,
        description: 'Pancetta, egg yolk, pecorino romano, black pepper.',
        emoji: '🍝',
        available: true,
        station: 'Kitchen',
        imageUrl: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Fettuccine Alfredo',
        price: 420,
        description: 'Rich parmesan cream sauce, fresh parsley.',
        emoji: '🍝',
        available: true,
        station: 'Kitchen',
        imageUrl: 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Grilled Salmon',
        price: 650,
        description: 'Atlantic salmon, asparagus, lemon butter sauce.',
        emoji: '🐟',
        available: true,
        station: 'Grill',
        imageUrl: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Ribeye Steak',
        price: 1200,
        description: '12oz prime ribeye, garlic herb butter, mashed potatoes.',
        emoji: '🥩',
        available: true,
        station: 'Grill',
        imageUrl: 'https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=400&q=80'
      }
    ]
  },
  {
    name: 'Tacos & Wraps',
    emoji: '🌮',
    items: [
      {
        id: crypto.randomUUID(),
        name: 'Beef Birria Tacos',
        price: 320,
        description: 'Slow-cooked beef, melted cheese, cilantro, onions, consommé.',
        emoji: '🌮',
        available: true,
        station: 'Kitchen',
        imageUrl: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Baja Fish Tacos',
        price: 300,
        description: 'Beer-battered cod, cabbage slaw, chipotle crema.',
        emoji: '🌮',
        available: true,
        station: 'Fryer',
        imageUrl: 'https://images.unsplash.com/photo-1512839004743-41bb335d2165?auto=format&fit=crop&w=400&q=80'
      },
      {
        id: crypto.randomUUID(),
        name: 'Chicken Caesar Wrap',
        price: 280,
        description: 'Grilled chicken, romaine, parmesan, caesar dressing.',
        emoji: '🌯',
        available: true,
        station: 'Kitchen',
        imageUrl: 'https://images.unsplash.com/photo-1626804475297-41609ea004eb?auto=format&fit=crop&w=400&q=80'
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
    console.log("Adding extensive new professional categories...");
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

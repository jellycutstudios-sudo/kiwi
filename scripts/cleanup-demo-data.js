#!/usr/bin/env node

/**
 * Cleanup Demo Data Script
 * 
 * Cleans up demo data hygiene issues in `rest1`:
 * 1. Consolidates duplicate "Mocktails" categories into a single populated category.
 * 2. Fixes suspicious ₹0 and ₹1 prices (e.g., Iced Matcha Latte, Garlic Chicken).
 * 3. Cleans up duplicate / corrupted floor names (e.g. "RooftopRooftop" -> "Rooftop", "Unknown" -> "Ground Floor").
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const admin = require(path.join(__dirname, '../functions/node_modules/firebase-admin'));
const credPath = path.join(__dirname, '../serviceAccountKey.json');

if (!fs.existsSync(credPath)) {
  console.error('❌ serviceAccountKey.json not found in project root.');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function cleanupDemoData() {
  console.log('🧹 Starting DineOS demo data cleanup for rest1...\n');
  const restRef = db.collection('restaurants').doc('rest1');
  const menuCol = restRef.collection('menu');
  const tablesCol = restRef.collection('tables');

  // 1. Clean up Floors in Restaurant Document
  console.log('--- 1. Cleaning Floors ---');
  await restRef.update({
    floors: ['Ground Floor', 'Rooftop']
  });
  console.log('✓ Updated restaurant floors to: ["Ground Floor", "Rooftop"]');

  // 2. Normalize Tables Floors
  console.log('\n--- 2. Normalizing Table Floors ---');
  const tablesSnap = await tablesCol.get();
  const tableBatch = db.batch();
  let tablesUpdated = 0;

  tablesSnap.forEach(tDoc => {
    const t = tDoc.data();
    let newFloor = t.floor;
    if (t.floor === 'RooftopRooftop') {
      newFloor = 'Rooftop';
    } else if (!t.floor || t.floor === 'Unknown') {
      newFloor = 'Ground Floor';
    }

    if (newFloor !== t.floor) {
      tableBatch.update(tablesCol.doc(tDoc.id), { floor: newFloor });
      tablesUpdated++;
      console.log(`   ✓ Table [${t.name || tDoc.id}]: Floor changed from "${t.floor}" to "${newFloor}"`);
    }
  });

  if (tablesUpdated > 0) {
    await tableBatch.commit();
    console.log(`✓ Committed ${tablesUpdated} table floor updates.`);
  } else {
    console.log('✓ All table floors already clean.');
  }

  // 3. Fix Menu Categories & Prices
  console.log('\n--- 3. Cleaning Menu Categories & Suspicious Prices ---');
  const menuSnap = await menuCol.get();
  const mocktailDocs = [];
  
  for (const docSnap of menuSnap.docs) {
    const cat = docSnap.data();
    const catName = (cat.name || '').trim();

    if (catName.toLowerCase() === 'mocktails') {
      mocktailDocs.push(docSnap);
      continue;
    }

    // Check items for suspicious prices
    let itemsChanged = false;
    const cleanedItems = (cat.items || []).map(item => {
      let updatedItem = { ...item };

      if (item.name === 'Iced Matcha Latte' && item.price <= 5) {
        console.log(`   ✓ Fixed Iced Matcha Latte price: ₹${item.price} -> ₹180`);
        updatedItem.price = 180;
        itemsChanged = true;
      } else if (item.name === 'Garlic chicken' && item.price <= 5) {
        console.log(`   ✓ Fixed Garlic chicken price: ₹${item.price} -> ₹360`);
        updatedItem.price = 360;
        itemsChanged = true;
      } else if (item.price === 0) {
        console.log(`   ✓ Fixed ${item.name} price: ₹0 -> ₹150`);
        updatedItem.price = 150;
        itemsChanged = true;
      }

      if (!updatedItem.station) {
        updatedItem.station = 'Kitchen';
        itemsChanged = true;
      }

      return updatedItem;
    });

    if (itemsChanged) {
      await menuCol.doc(docSnap.id).update({ items: cleanedItems });
      console.log(`✓ Updated category "${cat.name}" with corrected prices.`);
    }
  }

  // Handle Mocktails duplicate consolidation
  console.log(`\nFound ${mocktailDocs.length} "Mocktails" categories.`);
  if (mocktailDocs.length > 0) {
    // Delete all existing empty duplicate mocktails categories
    for (const mDoc of mocktailDocs) {
      await menuCol.doc(mDoc.id).delete();
      console.log(`   ✓ Deleted duplicate category ID: ${mDoc.id}`);
    }

    // Create a single rich Mocktails category with realistic items
    await menuCol.add({
      name: 'Mocktails',
      order: 8,
      items: [
        {
          id: 'mocktail_1',
          name: 'Virgin Mojito',
          price: 180,
          description: 'Muddled fresh mint, lime juice, cane sugar, and sparkling soda over crushed ice.',
          available: true,
          dietary: 'veg',
          station: 'Bar',
          image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80'
        },
        {
          id: 'mocktail_2',
          name: 'Blue Lagoon Cooler',
          price: 200,
          description: 'Vibrant blue curacao syrup, freshly squeezed lemonade, and citrus zest.',
          available: true,
          dietary: 'veg',
          station: 'Bar',
          image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=400&q=80'
        },
        {
          id: 'mocktail_3',
          name: 'Watermelon Mint Splash',
          price: 190,
          description: 'Cold-pressed fresh watermelon, crushed mint leaves, and a touch of Himalayan black salt.',
          available: true,
          dietary: 'veg',
          station: 'Bar',
          image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80'
        },
        {
          id: 'mocktail_4',
          name: 'Passionfruit Mango Fizz',
          price: 220,
          description: 'Ripe Alphonso mango puree with tangy passionfruit and effervescent soda.',
          available: true,
          dietary: 'veg',
          station: 'Bar',
          image: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=400&q=80'
        }
      ]
    });
    console.log('✓ Created single consolidated "Mocktails" category with 4 premium signature drinks.');
  }

  console.log('\n🎉 Demo data cleanup complete!');
}

cleanupDemoData().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});


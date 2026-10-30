#!/usr/bin/env node

/**
 * Migrate Staff Credentials Script
 * 
 * Migrates plaintext PINs and salary details from public `/staff/{staffId}` documents
 * into the isolated `/staff_credentials/{staffId}` (admin-only) and `/staff_auth/{pin}`
 * collections, then strips the sensitive fields from `/staff/{staffId}`.
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

async function migrateStaffCredentials() {
  console.log('🔒 Starting staff credentials isolation migration...\n');

  const restSnap = await db.collection('restaurants').get();
  console.log(`Found ${restSnap.size} restaurants.`);

  let totalStaff = 0;
  let totalMigrated = 0;

  for (const restDoc of restSnap.docs) {
    const restId = restDoc.id;
    const staffCol = db.collection('restaurants').doc(restId).collection('staff');
    const staffSnap = await staffCol.get();

    if (staffSnap.empty) continue;

    console.log(`\nRestaurant [${restId}]: Processing ${staffSnap.size} staff members...`);

    const batch = db.batch();
    let batchCount = 0;

    for (const sDoc of staffSnap.docs) {
      totalStaff++;
      const sData = sDoc.data();
      const staffId = sDoc.id;
      const pin = sData.pin ? String(sData.pin).trim() : null;

      if (!pin) {
        console.log(`   - Staff [${sData.name || staffId}]: No PIN found, skipping.`);
        continue;
      }

      // 1. Create or update isolated admin-only credentials doc
      const credRef = db.collection('restaurants').doc(restId).collection('staff_credentials').doc(staffId);
      batch.set(credRef, {
        staffId,
        pin,
        salaryType: sData.salaryType || 'monthly',
        salaryRate: sData.salaryRate || 0,
        overtimeRate: sData.overtimeRate || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // 2. Create single-key auth lookup doc: staff_auth/{pin}
      const authRef = db.collection('restaurants').doc(restId).collection('staff_auth').doc(pin);
      batch.set(authRef, {
        staffId,
        name: sData.name || 'Staff',
        role: sData.role || 'staff',
        active: sData.active !== false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 3. Remove pin and salaryRate from the general staff profile doc
      const staffRef = staffCol.doc(staffId);
      batch.update(staffRef, {
        pin: admin.firestore.FieldValue.delete(),
        salaryRate: admin.firestore.FieldValue.delete(),
        overtimeRate: admin.firestore.FieldValue.delete(),
      });

      batchCount++;
      totalMigrated++;
      console.log(`   ✓ Isolated credentials for ${sData.name} (${sData.role}) -> PIN ${pin}`);
    }

    if (batchCount > 0) {
      await batch.commit();
      console.log(`   💾 Committed batch for restaurant [${restId}].`);
    }
  }

  console.log(`\n🎉 Migration complete!`);
  console.log(`   Total staff checked: ${totalStaff}`);
  console.log(`   Total staff credentials isolated: ${totalMigrated}\n`);
}

migrateStaffCredentials().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});


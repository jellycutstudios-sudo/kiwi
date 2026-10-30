#!/usr/bin/env node

/**
 * Cleanup Anonymous Users Script
 * 
 * Safely finds and deletes all Firebase anonymous guest sessions while
 * strictly preserving registered staff, admins, email, and phone accounts.
 *
 * Usage:
 *   node scripts/cleanup-anonymous-users.js [--dry-run]
 * 
 * Authentication options:
 *   1. export GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"
 *   2. Or place serviceAccountKey.json in the project root or scripts/ directory
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve firebase-admin from functions directory if not in root
const require = createRequire(import.meta.url);
let admin;
try {
  admin = require('firebase-admin');
} catch {
  admin = require(path.join(__dirname, '../functions/node_modules/firebase-admin'));
}

const isDryRun = process.argv.includes('--dry-run');

// Locate service account credentials
function initializeFirebaseAdmin() {
  const possiblePaths = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(__dirname, 'serviceAccountKey.json'),
    path.join(__dirname, '../serviceAccountKey.json'),
    path.join(__dirname, '../functions/serviceAccountKey.json'),
  ].filter(Boolean);

  for (const credPath of possiblePaths) {
    if (fs.existsSync(credPath)) {
      console.log(`🔑 Using service account key from: ${credPath}`);
      const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      return;
    }
  }

  // Fallback to application default credentials
  try {
    admin.initializeApp({
      projectId: 'posrest-5a97f',
    });
    console.log('🔑 Initialized with default credentials for project: posrest-5a97f');
  } catch (err) {
    console.error('❌ Could not initialize Firebase Admin. Please download a service account key from:');
    console.error('   Firebase Console -> Project Settings -> Service accounts -> Generate new private key');
    console.error('   and save it as serviceAccountKey.json in the project directory.');
    process.exit(1);
  }
}

async function cleanupAnonymousUsers() {
  initializeFirebaseAdmin();
  const auth = admin.auth();

  console.log(`\n🧹 Starting scan of Firebase Authentication users... ${isDryRun ? '(DRY RUN)' : ''}\n`);

  let nextPageToken;
  let totalScanned = 0;
  let totalAnonymous = 0;
  let totalPreserved = 0;
  const anonymousUidsToDelete = [];

  do {
    const listResult = await auth.listUsers(1000, nextPageToken);
    nextPageToken = listResult.pageToken;

    for (const user of listResult.users) {
      totalScanned++;

      // A user is anonymous if they have NO provider data, NO email, and NO phone number
      const isAnonymous = 
        (!user.providerData || user.providerData.length === 0) &&
        !user.email &&
        !user.phoneNumber;

      if (isAnonymous) {
        totalAnonymous++;
        anonymousUidsToDelete.push(user.uid);
      } else {
        totalPreserved++;
        console.log(`🛡️  Preserving account: ${user.email || user.phoneNumber || user.uid} (Provider: ${user.providerData.map(p => p.providerId).join(', ') || 'custom'})`);
      }
    }
  } while (nextPageToken);

  console.log(`\n📊 Scan Complete:`);
  console.log(`   - Total users scanned: ${totalScanned}`);
  console.log(`   - Registered accounts preserved: ${totalPreserved}`);
  console.log(`   - Anonymous guest sessions found: ${totalAnonymous}`);

  if (anonymousUidsToDelete.length === 0) {
    console.log('\n✨ No anonymous sessions to delete. Your user list is already clean!\n');
    return;
  }

  if (isDryRun) {
    console.log(`\nℹ️ Dry run completed. ${anonymousUidsToDelete.length} anonymous accounts would be deleted.`);
    console.log(`   To execute, run without --dry-run.\n`);
    return;
  }

  console.log(`\n🗑️  Deleting ${anonymousUidsToDelete.length} anonymous accounts in batches...`);

  // Delete in batches of 1000 (Firebase Auth deleteUsers limit)
  const batchSize = 1000;
  let deletedCount = 0;

  for (let i = 0; i < anonymousUidsToDelete.length; i += batchSize) {
    const batch = anonymousUidsToDelete.slice(i, i + batchSize);
    const deleteResult = await auth.deleteUsers(batch);
    deletedCount += deleteResult.successCount;
    if (deleteResult.failureCount > 0) {
      console.warn(`   ⚠️ ${deleteResult.failureCount} deletions failed in this batch.`);
    }
    console.log(`   ✓ Deleted batch ${Math.floor(i / batchSize) + 1} (${deletedCount}/${anonymousUidsToDelete.length})`);
  }

  console.log(`\n🎉 Done! Successfully deleted ${deletedCount} anonymous users.`);
  console.log(`   Only your ${totalPreserved} real staff & admin accounts remain in Firebase Authentication.\n`);
}

cleanupAnonymousUsers().catch(err => {
  console.error('\n❌ Error during cleanup:', err.message);
  process.exit(1);
});


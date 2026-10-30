const admin = require('../functions/node_modules/firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const RESTAURANT_ID = 'rest1';
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

async function runCleanup() {
  console.log(`Starting stale order cleanup for restaurant: ${RESTAURANT_ID}...`);
  const now = Date.now();

  const ordersRef = db.collection('restaurants').doc(RESTAURANT_ID).collection('orders');
  const activeSnap = await ordersRef
    .where('status', 'in', ['pending', 'preparing', 'ready', 'served'])
    .get();

  console.log(`Found ${activeSnap.size} total active/open orders in Firestore.`);

  let archivedCount = 0;
  const tablesToFree = new Set();
  const batch = db.batch();

  activeSnap.forEach((docSnap) => {
    const data = docSnap.data();
    let createdMs = 0;

    if (data.createdAt) {
      if (typeof data.createdAt.toDate === 'function') {
        createdMs = data.createdAt.toDate().getTime();
      } else if (typeof data.createdAt === 'number') {
        createdMs = data.createdAt;
      } else {
        const parsed = new Date(data.createdAt).getTime();
        if (!isNaN(parsed)) createdMs = parsed;
      }
    }

    const ageMs = now - createdMs;
    const ageHours = (ageMs / (1000 * 60 * 60)).toFixed(1);

    if (createdMs > 0 && ageMs > STALE_THRESHOLD_MS) {
      console.log(`Archiving stale order ${docSnap.id} (Age: ${ageHours}h, Status: ${data.status}, Table: ${data.tableName || data.tableId || 'N/A'})`);
      batch.update(docSnap.ref, {
        status: 'completed',
        autoArchived: true,
        archivedReason: 'stale_order_over_24h',
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      archivedCount++;

      if (data.tableId) {
        tablesToFree.add(data.tableId);
      }
    }
  });

  if (archivedCount > 0) {
    await batch.commit();
    console.log(`Successfully archived ${archivedCount} stale orders in Firestore.`);
  } else {
    console.log('No orders older than 24 hours to archive.');
  }

  // Free tables that were marked occupied or linked to stale orders
  console.log('Checking tables in restaurant...');
  const tablesRef = db.collection('restaurants').doc(RESTAURANT_ID).collection('tables');
  const tablesSnap = await tablesRef.get();
  const tableBatch = db.batch();
  let freedTablesCount = 0;

  for (const tDoc of tablesSnap.docs) {
    const tData = tDoc.data();
    const orderId = tData.currentOrderId || tData.activeOrderId;
    let shouldFree = false;

    if (tablesToFree.has(tDoc.id)) {
      shouldFree = true;
    } else if (orderId) {
      // Check if the order is completed/billed or stale
      if (orderId.startsWith('offline_')) {
        // Parse timestamp from offline ID like offline_1793277216473_st0me
        const match = orderId.match(/offline_(\d+)_/);
        if (match && match[1]) {
          const offlineTs = Number(match[1]);
          if (now - offlineTs > STALE_THRESHOLD_MS) {
            shouldFree = true;
          }
        } else {
          shouldFree = true;
        }
      } else {
        const oSnap = await ordersRef.doc(orderId).get();
        if (!oSnap.exists || ['completed', 'billed', 'cancelled'].includes(oSnap.data()?.status)) {
          shouldFree = true;
        }
      }
    } else if (tData.status === 'occupied') {
      shouldFree = true;
    }

    if (shouldFree) {
      console.log(`Freeing stale occupied table ${tDoc.id} (${tData.name || 'Unnamed'})`);
      tableBatch.update(tDoc.ref, {
        status: 'free',
        currentOrderId: null,
        activeOrderId: null,
        occupiedSince: null,
      });
      freedTablesCount++;
    }
  }

  if (freedTablesCount > 0) {
    await tableBatch.commit();
    console.log(`Successfully freed ${freedTablesCount} stuck/occupied tables.`);
  } else {
    console.log('All tables are clean.');
  }

  console.log('Stale order & table cleanup finished.');
}

runCleanup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  });

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// ─────────────────────────────────────────────────────────────────────────────
// Helper: verify Firebase ID token from Authorization header
// ─────────────────────────────────────────────────────────────────────────────
async function verifyAuthToken(req, res) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).send('Unauthorized: Missing Bearer token');
    return null;
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return decoded;
  } catch (e) {
    console.error('Token verification failed:', e.message);
    res.status(401).send('Unauthorized: Invalid token');
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FCM: Notify staff when a new online order arrives
// ─────────────────────────────────────────────────────────────────────────────
exports.sendNewOrderNotification = functions.firestore
  .document('restaurants/{restaurantId}/orders/{orderId}')
  .onCreate(async (snapshot, context) => {
    const order = snapshot.data();

    // Only send notification for incoming online orders
    if (order.type !== 'online') {
      return null;
    }

    const { restaurantId } = context.params;

    try {
      const staffRef = admin.firestore().collection('restaurants').doc(restaurantId).collection('staff');
      const staffSnap = await staffRef.where('active', '==', true).get();

      const tokens = [];
      staffSnap.forEach(doc => {
        const staffData = doc.data();
        if (staffData.fcmTokens && Array.isArray(staffData.fcmTokens)) {
          tokens.push(...staffData.fcmTokens);
        }
      });

      if (tokens.length === 0) {
        console.log('No registered FCM tokens found for staff at restaurant:', restaurantId);
        return null;
      }

      const uniqueTokens = [...new Set(tokens)];

      const response = await admin.messaging().sendEachForMulticast({
        tokens: uniqueTokens,
        notification: {
          title: 'New Online Order!',
          body: `Order for ${order.customerName || 'Customer'} - Total: ${order.total} ${order.currency}`,
        },
        data: {
          orderId: snapshot.id,
          click_action: `/online-orders`
        }
      });

      console.log(`FCM: ${response.successCount} succeeded, ${response.failureCount} failed.`);

      // Clean up invalid/stale tokens
      if (response.failureCount > 0) {
        const tokensToRemove = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error.code;
            if (
              errCode === 'messaging/invalid-registration-token' ||
              errCode === 'messaging/registration-token-not-registered'
            ) {
              tokensToRemove.push(uniqueTokens[idx]);
            }
          }
        });

        if (tokensToRemove.length > 0) {
          console.log(`Cleaning up ${tokensToRemove.length} stale tokens.`);
          const batch = admin.firestore().batch();
          staffSnap.forEach(doc => {
            const staffData = doc.data();
            if (staffData.fcmTokens) {
              const updatedTokens = staffData.fcmTokens.filter(t => !tokensToRemove.includes(t));
              if (updatedTokens.length !== staffData.fcmTokens.length) {
                batch.update(doc.ref, { fcmTokens: updatedTokens });
              }
            }
          });
          await batch.commit();
        }
      }
      return null;
    } catch (error) {
      console.error('Error sending order FCM notification:', error);
      return null;
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Webhook: Receive incoming orders from delivery platforms (Uber Eats, Zomato…)
// ─────────────────────────────────────────────────────────────────────────────
exports.handleDeliveryWebhook = functions.https.onRequest(async (req, res) => {
  const { platform, restaurantId } = req.query;

  if (!platform || !restaurantId) {
    console.error('Webhook missing platform or restaurantId');
    return res.status(400).send('Bad Request: Missing platform or restaurantId');
  }

  try {
    const db = admin.firestore();
    const restDoc = await db.collection('restaurants').doc(restaurantId).get();

    if (!restDoc.exists) {
      console.error(`Restaurant ${restaurantId} not found`);
      return res.status(404).send('Restaurant Not Found');
    }

    const restData = restDoc.data();
    const integrations = restData.deliveryIntegrations || {};
    const platformConfig = integrations[platform] || {};

    if (!platformConfig.enabled) {
      console.error(`Integration for platform ${platform} is disabled`);
      return res.status(400).send('Integration Disabled');
    }

    // Load Adapter
    let adapter;
    try {
      adapter = require(`./webhooks/${platform}Adapter`);
    } catch (e) {
      console.error(`Adapter not found for platform: ${platform}`, e);
      return res.status(400).send('Unsupported Platform');
    }

    // Validate Signature/Auth — NEVER bypass in production
    let isValid = false;
    if (platform === 'ubereats') {
      const signature = req.headers['x-uber-signature'];
      const rawBody = req.rawBody || JSON.stringify(req.body);
      isValid = adapter.verifySignature(rawBody, signature, platformConfig.clientSecret);
    } else {
      isValid = adapter.verifySignature(req.headers, platformConfig.apiKey);
    }

    if (!isValid) {
      console.warn(`Unauthorized webhook signature for platform: ${platform}`);
      return res.status(401).send('Unauthorized: Invalid Signature');
    }

    // Check if platform is paused
    const settingsDoc = await db.collection('restaurants').doc(restaurantId)
      .collection('deliverySettings').doc(platform).get();

    if (settingsDoc.exists) {
      const settingsData = settingsDoc.data();
      if (settingsData.paused) {
        let isPaused = true;
        if (settingsData.pauseUntil) {
          const pauseUntilDate = settingsData.pauseUntil.toDate
            ? settingsData.pauseUntil.toDate()
            : new Date(settingsData.pauseUntil);
          if (pauseUntilDate <= new Date()) {
            isPaused = false;
          }
        }
        if (isPaused) {
          console.warn(`Webhook for ${platform} rejected — channel paused. Reason: ${settingsData.pauseReason || 'None'}`);
          return res.status(503).send(`Service Temporarily Unavailable: Channel ${platform} is paused.`);
        }
      }
    }

    // Normalize order
    const normalizedOrder = adapter.normalize(req.body);

    // Set auto-accept state
    const autoAccept = restData.deliverySettings?.autoAccept ?? false;
    if (autoAccept) {
      normalizedOrder.status = 'accepted';
      normalizedOrder.requiresAcceptance = false;
    } else {
      normalizedOrder.status = 'pending';
      normalizedOrder.requiresAcceptance = true;
    }

    // Save order
    const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders');
    const savedDoc = await orderRef.add(normalizedOrder);

    console.log(`Processed ${platform} order ${normalizedOrder.externalOrderId} -> docId ${savedDoc.id}`);

    if (platform === 'ubereats') {
      return res.status(200).json({ status: 'ok', order_id: normalizedOrder.externalOrderId });
    }
    return res.status(200).send('Order Processed');
  } catch (error) {
    console.error(`Error processing delivery webhook for platform ${platform}:`, error);
    return res.status(500).send('Internal Server Error');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP: Menu sync + order accept/reject — SECURED with Firebase Auth token
// ─────────────────────────────────────────────────────────────────────────────
exports.syncDeliveryMenu = functions.https.onRequest(async (req, res) => {
  // Require valid Firebase Auth Bearer token
  const decodedToken = await verifyAuthToken(req, res);
  if (!decodedToken) return;

  const { restaurantId, platform, action, orderId } = req.query;
  if (!restaurantId) {
    return res.status(400).send('Missing restaurantId');
  }

  // Handle order accept/reject actions from the POS frontend
  if (action) {
    if (!platform || !orderId) {
      return res.status(400).send('Missing platform or orderId for order action');
    }
    try {
      console.log(`[ORDER ACTION] ${action} for ${platform} order ${orderId} at ${restaurantId} by uid=${decodedToken.uid}`);
      // TODO: Call platform APIs (Uber Eats, Zomato…) to accept/reject the order
      return res.status(200).json({
        success: true,
        action,
        platform,
        orderId,
        details: `Order ${action} processed for ${platform}.`
      });
    } catch (err) {
      console.error(`Error notifying ${platform} of order ${action}:`, err);
      return res.status(500).send(err.message);
    }
  }

  // Manual menu sync
  try {
    const { syncAllEnabledPlatforms } = require('./menu/syncMenu');
    const result = await syncAllEnabledPlatforms(restaurantId, platform || null);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).send(err.message);
  }
});

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
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
exports.sendNewOrderNotification = onDocumentCreated('restaurants/{restaurantId}/orders/{orderId}', async (event) => {
    const snapshot = event.data;
    if (!snapshot) return null;
    const order = snapshot.data();

    // Only send notification for incoming online orders
    if (order.type !== 'online') {
      return null;
    }

    const { restaurantId } = event.params;

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

// Simple in-memory rate limiting stub (For production, use Cloud Armor or Redis)
const rateLimitCache = new Map();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

exports.handleDeliveryWebhook = onRequest(async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  
  // Basic Rate Limiting
  const clientLimit = rateLimitCache.get(ip) || { count: 0, startTime: now };
  if (now - clientLimit.startTime > RATE_LIMIT_WINDOW_MS) {
    clientLimit.count = 1;
    clientLimit.startTime = now;
  } else {
    clientLimit.count++;
  }
  rateLimitCache.set(ip, clientLimit);

  if (clientLimit.count > MAX_REQUESTS_PER_WINDOW) {
    console.warn(`Rate limit exceeded for IP: ${ip}`);
    return res.status(429).send('Too Many Requests');
  }

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
    let timestamp = req.headers['x-uber-webhook-timestamp'] || Date.now(); // Platform specific timestamp logic
    
    // Replay Attack Protection (check if timestamp is within 5 minutes)
    const MAX_AGE_MS = 5 * 60 * 1000;
    if (Math.abs(Date.now() - timestamp) > MAX_AGE_MS) {
        console.warn(`Webhook request is too old (possible replay attack) for platform: ${platform}`);
        return res.status(401).send('Unauthorized: Request Expired');
    }

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
exports.syncDeliveryMenu = onRequest(async (req, res) => {
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

// ─────────────────────────────────────────────────────────────────────────────
// Auth: Validate Staff PIN
// ─────────────────────────────────────────────────────────────────────────────
exports.validatePin = onCall(async (request) => {
  const { restaurantId, pin } = request.data;
  
  if (!restaurantId || !pin) {
    throw new HttpsError('invalid-argument', 'Missing restaurantId or pin');
  }

  try {
    const db = admin.firestore();
    let actualRestId = restaurantId;

    // Support for customId or slug login
    const restQuery = await db.collection('restaurants').where('customId', '==', restaurantId).get();
    if (!restQuery.empty) {
      actualRestId = restQuery.docs[0].id;
    } else {
      const slugQuery = await db.collection('restaurants').where('slug', '==', restaurantId).get();
      if (!slugQuery.empty) {
        actualRestId = slugQuery.docs[0].id;
      }
    }

    // Lookup staff by PIN
    const staffQuery = await db.collection('restaurants').doc(actualRestId).collection('staff')
      .where('pin', '==', pin)
      .where('active', '==', true)
      .get();

    if (staffQuery.empty) {
      throw new HttpsError('unauthenticated', 'Invalid PIN');
    }

    const staffDoc = staffQuery.docs[0];
    const staffData = staffDoc.data();
    
    // Check if restaurant is approved
    const restDoc = await db.collection('restaurants').doc(actualRestId).get();
    if (!restDoc.exists || restDoc.data().status !== 'approved') {
       throw new HttpsError('permission-denied', 'Restaurant is pending approval or suspended');
    }

    // Create a custom token with custom claims
    const uid = staffDoc.id; // Or a specific format like `staff_${staffDoc.id}`
    const additionalClaims = {
      role: staffData.role,
      restaurantId: actualRestId,
      isPinLogin: true
    };
    
    const customToken = await admin.auth().createCustomToken(uid, additionalClaims);

    return { 
      token: customToken, 
      staff: { id: staffDoc.id, ...staffData },
      restaurantId: actualRestId
    };

  } catch (error) {
    console.error('Error in validatePin:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Internal server error during PIN validation');
  }
});

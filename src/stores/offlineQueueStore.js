import { create } from 'zustand';
import { collection, doc, writeBatch, serverTimestamp, increment, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useShiftStore } from './shiftStore';
import { useAuthStore } from './authStore';
import { getActiveModes } from '../hooks/useBusinessConfig';
import toast from 'react-hot-toast';

const QUEUE_STORAGE_KEY = 'dineos_offline_order_queue';

const loadPersistedQueue = () => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY) || localStorage.getItem('dineos_offline_orders_queue');
    const parsed = raw ? JSON.parse(raw) : [];
    return parsed.map(o => ({
      ...o,
      createdAt: o.createdAt || o.offlineQueuedAt || new Date().toISOString()
    }));
  } catch (err) {
    console.error('Failed to parse offline order queue:', err);
    return [];
  }
};

const savePersistedQueue = (queue) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    localStorage.setItem('dineos_offline_orders_queue', JSON.stringify(queue));
  } catch (err) {
    console.error('Failed to persist offline order queue:', err);
  }
};

export const useOfflineQueueStore = create((set, get) => {
  let isListenerAttached = false;
  let heartbeatTimer = null;

  return {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    queue: loadPersistedQueue(),
    isSyncing: false,
    syncError: null,
    lastSyncTime: null,
    showSyncModal: false,

    setShowSyncModal: (show) => set({ showSyncModal: show }),

    // ── Enqueue an order during an outage or network failure ──
    enqueueOrder: (orderPayload, restaurant) => {
      const queue = get().queue;
      const clientOrderId = orderPayload.id || `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const rest = restaurant || useAuthStore.getState().restaurant;
      const isTokenEnabled = getActiveModes(rest).includes('token');
      const tokenNumber = isTokenEnabled
        ? (orderPayload.token || `OFF-${Math.floor(100 + Math.random() * 900)}`)
        : null;
      const nowIso = new Date().toISOString();

      // Ensure createdAt is a valid ISO string, never undefined or Firestore sentinel
      const rawCreatedAt = orderPayload.createdAt || orderPayload.offlineQueuedAt;
      const validCreatedAt = (typeof rawCreatedAt === 'string' && !isNaN(new Date(rawCreatedAt).getTime()))
        ? rawCreatedAt
        : (typeof rawCreatedAt === 'number' && rawCreatedAt > 0 ? new Date(rawCreatedAt).toISOString() : nowIso);

      const queuedOrder = {
        ...orderPayload,
        id: clientOrderId,
        token: tokenNumber,
        isOffline: true,
        restaurantId: restaurant?.id || useAuthStore.getState().restaurant?.id,
        createdAt: validCreatedAt,
        offlineQueuedAt: orderPayload.offlineQueuedAt || nowIso,
        syncAttempts: 0,
        lastError: null,
      };

      const existingIndex = queue.findIndex(o => o.id === clientOrderId);
      const updatedQueue = existingIndex >= 0
        ? queue.map((o, idx) => idx === existingIndex ? { ...o, ...queuedOrder } : o)
        : [...queue, queuedOrder];

      set({ queue: updatedQueue });
      savePersistedQueue(updatedQueue);

      // Record offline paid order to active shift float immediately
      if (existingIndex < 0 && orderPayload.paymentMethod !== 'unpaid' && (orderPayload.total ?? 0) > 0) {
        useShiftStore.getState().applySaleToActiveShift({
          total: orderPayload.total,
          method: orderPayload.paymentMethod,
          splitPayments: orderPayload.splitPayments
        });
      }

      if (typeof toast?.success === 'function') {
        toast.success(`⚡ Order buffered in Offline Queue (#${tokenNumber})`, { icon: '📦', duration: 4000 });
      } else if (typeof toast === 'function') {
        toast(`⚡ Order buffered in Offline Queue (#${tokenNumber})`, { icon: '📦', duration: 4000 });
      }

      return {
        ok: true,
        orderId: clientOrderId,
        token: tokenNumber,
        isOffline: true
      };
    },

    // ── Update single order in queue ──
    updateQueuedOrder: (orderId, partial) => {
      const queue = get().queue;
      if (!queue.some(o => o.id === orderId)) return;
      const updatedQueue = queue.map(o => o.id === orderId ? {
        ...o,
        ...partial,
        updatedAt: new Date().toISOString()
      } : o);
      set({ queue: updatedQueue });
      savePersistedQueue(updatedQueue);
    },

    // ── Remove single order from queue ──
    dequeueOrder: (orderId) => {
      const updatedQueue = get().queue.filter(o => o.id !== orderId);
      set({ queue: updatedQueue });
      savePersistedQueue(updatedQueue);
    },

    // ── Clear entire queue (manual purge if needed) ──
    clearQueue: () => {
      set({ queue: [] });
      savePersistedQueue([]);
    },

    // ── Process and drain offline orders to Firestore ──
    processQueue: async (explicitRestaurantId = null) => {
      const { queue, isSyncing } = get();
      if (isSyncing || queue.length === 0) return { syncedCount: 0, failedCount: 0 };

      const restaurantId = explicitRestaurantId || useAuthStore.getState().restaurant?.id;
      if (!restaurantId) return { syncedCount: 0, failedCount: 0 };

      const restaurant = useAuthStore.getState().restaurant;
      if (restaurant?.localStorageOnly) {
        // Local-Only Mode active: keep orders safely buffered on device, do not send to cloud
        return { syncedCount: 0, failedCount: 0, isLocalOnly: true };
      }

      // Ensure anonymous or valid auth session before pushing
      try {
        await useAuthStore.getState().ensureAnonymousAuth();
      } catch (authErr) {
        console.warn('Could not re-authenticate before sync:', authErr);
      }

      set({ isSyncing: true, syncError: null });

      let syncedCount = 0;
      let failedCount = 0;
      const remainingQueue = [];

      for (const order of queue) {
        try {
          // Prepare clean document for Firestore
          const targetOrderId = order.id.startsWith('offline_') 
            ? doc(collection(db, 'restaurants', restaurantId, 'orders')).id 
            : order.id;

          const isPaid = order.paid === true || (order.paymentMethod && order.paymentMethod !== 'unpaid');
          const validCreatedAt = (typeof order.createdAt === 'string' && !isNaN(new Date(order.createdAt).getTime()))
            ? Timestamp.fromDate(new Date(order.createdAt))
            : (order.createdAt || serverTimestamp());
          const firestoreOrder = {
            ...order,
            id: targetOrderId,
            syncedFromOffline: true,
            syncedAt: serverTimestamp(),
            createdAt: validCreatedAt,
            updatedAt: serverTimestamp(),
            paidAt: isPaid ? serverTimestamp() : null,
          };

          // Remove offline metadata flags before writing
          delete firestoreOrder.syncAttempts;
          delete firestoreOrder.lastError;

          const batch = writeBatch(db);
          const orderDocRef = doc(db, 'restaurants', restaurantId, 'orders', targetOrderId);
          batch.set(orderDocRef, firestoreOrder);

          // Update active shift if this order was paid
          const activeShift = useShiftStore.getState().activeShift;
          if (activeShift?.id && order.paymentMethod !== 'unpaid' && (order.total ?? 0) > 0) {
            const shiftRef = doc(db, 'restaurants', restaurantId, 'shifts', activeShift.id);
            const shiftUpdate = {
              totalSalesAmount: increment(order.total)
            };
            if (order.paymentMethod === 'cash') {
              shiftUpdate.cashSalesCount = increment(1);
              shiftUpdate.cashSalesAmount = increment(order.total);
              shiftUpdate.expectedCash = increment(order.total);
            } else if (order.paymentMethod === 'card' || order.paymentMethod === 'terminal') {
              shiftUpdate.cardSalesCount = increment(1);
              shiftUpdate.cardSalesAmount = increment(order.total);
            } else if (order.paymentMethod === 'upi') {
              shiftUpdate.upiSalesCount = increment(1);
              shiftUpdate.upiSalesAmount = increment(order.total);
            } else if (order.paymentMethod === 'split' && Array.isArray(order.splitPayments)) {
              let cashCount = 0;
              let cashAmt = 0;
              let cardCount = 0;
              let cardAmt = 0;
              let upiCount = 0;
              let upiAmt = 0;

              order.splitPayments.forEach(p => {
                const m = p.method ?? 'cash';
                const amt = p.amount ?? 0;
                if (m === 'cash') {
                  cashCount += 1;
                  cashAmt += amt;
                } else if (m === 'card' || m === 'terminal') {
                  cardCount += 1;
                  cardAmt += amt;
                } else if (m === 'upi') {
                  upiCount += 1;
                  upiAmt += amt;
                }
              });

              if (cashCount > 0) {
                shiftUpdate.cashSalesCount = increment(cashCount);
                shiftUpdate.cashSalesAmount = increment(cashAmt);
                shiftUpdate.expectedCash = increment(cashAmt);
              }
              if (cardCount > 0) {
                shiftUpdate.cardSalesCount = increment(cardCount);
                shiftUpdate.cardSalesAmount = increment(cardAmt);
              }
              if (upiCount > 0) {
                shiftUpdate.upiSalesCount = increment(upiCount);
                shiftUpdate.upiSalesAmount = increment(upiAmt);
              }
            }
            batch.update(shiftRef, shiftUpdate);
          }

          // Deplete inventory for offline orders upon sync
          const items = order.items ?? [];
          for (const item of items) {
            const recipe = item.recipe ?? [];
            for (const recipeItem of recipe) {
              if (recipeItem.ingredientId && recipeItem.amount) {
                const ingDocRef = doc(db, 'restaurants', restaurantId, 'inventory', recipeItem.ingredientId);
                batch.update(ingDocRef, {
                  qty: increment(-recipeItem.amount * (item.qty || 1))
                });
              }
            }
          }

          // Update customer profile with loyalty points, visit counts, and lifetime spends if paid
          if (order.customerPhone && isPaid) {
            const pointsEarned = order.loyaltyEarned ?? 0;
            const pointsRedeemed = order.loyaltyRedeemed ?? 0;
            const custDocRef = doc(db, 'restaurants', restaurantId, 'customers', order.customerPhone);
            batch.set(custDocRef, {
              phone: order.customerPhone,
              name: order.customerName || '',
              visitCount: increment(1),
              lifetimeSpend: increment(order.total || 0),
              points: increment(pointsEarned - pointsRedeemed)
            }, { merge: true });
          }

          // Commit individual order batch
          await batch.commit();
          syncedCount++;
        } catch (err) {
          console.error(`Failed to sync offline order ${order.id}:`, err);
          failedCount++;
          remainingQueue.push({
            ...order,
            syncAttempts: (order.syncAttempts || 0) + 1,
            lastError: err.message || 'Unknown network error'
          });
        }
      }

      set({
        queue: remainingQueue,
        isSyncing: false,
        lastSyncTime: new Date().toISOString(),
        syncError: failedCount > 0 ? `Failed to sync ${failedCount} orders` : null
      });
      savePersistedQueue(remainingQueue);

      if (syncedCount > 0) {
        toast.success(`Synced ${syncedCount} offline order${syncedCount > 1 ? 's' : ''} to cloud!`, {
          icon: '☁️',
          duration: 4000
        });
      }

      return { syncedCount, failedCount };
    },

    // ── Network listener setup (auto-runs in AppShell) ──
    initNetworkListeners: () => {
      if (typeof window === 'undefined' || isListenerAttached) return () => {};
      isListenerAttached = true;

      const handleOnline = () => {
        set({ isOnline: true });
        if (typeof toast?.success === 'function') {
          toast.success('Connection restored. Syncing offline buffer...', { icon: '🟢' });
        } else if (typeof toast === 'function') {
          toast('Connection restored. Syncing offline buffer...', { icon: '🟢' });
        }
        // Attempt draining queue after short stabilization timeout
        setTimeout(() => {
          get().processQueue();
        }, 1200);
      };

      const handleOffline = () => {
        set({ isOnline: false });
        if (typeof toast?.error === 'function') {
          toast.error('Network offline. Terminal operating in Zero-Downtime Buffer Mode.', {
            icon: '⚡',
            duration: 4500
          });
        } else if (typeof toast === 'function') {
          toast('Network offline. Terminal operating in Zero-Downtime Buffer Mode.', {
            icon: '⚡',
            duration: 4500
          });
        }
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // Periodic check: Ping light endpoint every 25 seconds to verify true internet reachability
      heartbeatTimer = setInterval(async () => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          if (get().isOnline) set({ isOnline: false });
          return;
        }

        // Quick image fetch or online state check
        try {
          const res = await fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store' }).catch(() => null);
          const reachable = res !== null;
          if (reachable !== get().isOnline) {
            set({ isOnline: reachable });
            if (reachable && get().queue.length > 0) {
              get().processQueue();
            }
          }
        } catch {
          if (get().isOnline) set({ isOnline: false });
        }
      }, 25000);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        isListenerAttached = false;
      };
    }
  };
});

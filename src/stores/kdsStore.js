import { create } from 'zustand';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from './authStore';
import { useOrderStore } from './orderStore';
import { useOfflineQueueStore } from './offlineQueueStore';

export const useKdsStore = create(() => ({
  updateKDSItemStatus: async (restaurantId, order, itemIndex, newStatus) => {
    const toDate = (ts) => {
      if (!ts) return new Date();
      if (typeof ts.toDate === 'function') return ts.toDate();
      return new Date(ts);
    };

    const updatedItems = (order?.items || []).map((item, idx) => {
      if (idx === itemIndex) {
        return { ...item, status: newStatus };
      }
      return item;
    });

    const activeItems = updatedItems.filter(i => i.status !== 'cancelled' && i.status !== 'void');
    const hasPreparing = activeItems.some(i => i.status === 'preparing' || i.status === 'ready');
    const allReady = activeItems.length > 0 && activeItems.every(i => i.status === 'ready');

    let overallStatus = order.status;
    const updates = { items: updatedItems };

    if (newStatus === 'preparing' && (order.status === 'pending' || order.status === 'ready')) {
      overallStatus = 'preparing';
      updates.status = 'preparing';
      updates.prepStartedAt = order.prepStartedAt || new Date().toISOString();
    }

    const isOrderPaid = order.paid === true || (order.paymentMethod && order.paymentMethod !== 'unpaid');

    if (allReady) {
      const finalStatus = isOrderPaid ? 'billed' : 'ready';
      overallStatus = finalStatus;
      updates.status = finalStatus;
      updates.prepCompletedAt = new Date().toISOString();
      if (isOrderPaid) {
        updates.completedAt = new Date().toISOString();
      }
      
      const startTime = order.prepStartedAt ? toDate(order.prepStartedAt) : (order.createdAt ? toDate(order.createdAt) : new Date());
      const durationSeconds = Math.floor((new Date() - startTime) / 1000);
      updates.prepDuration = !isNaN(durationSeconds) && durationSeconds >= 0 ? durationSeconds : 0;
    } else if (hasPreparing && (overallStatus === 'pending' || overallStatus === 'ready')) {
      overallStatus = 'preparing';
      updates.status = 'preparing';
      updates.prepStartedAt = order.prepStartedAt || new Date().toISOString();
    }

    // 1. Optimistic local update in active orders & offline queue
    useOrderStore.getState().patchActiveOrder(order.id, {
      ...updates,
      status: overallStatus
    });
    useOfflineQueueStore.getState().updateQueuedOrder(order.id, {
      ...updates,
      status: overallStatus
    });

    // 2. Cloud sync if permitted, online, and not an offline order
    try {
      const isOfflineOrder = typeof order.id === 'string' && order.id.startsWith('offline_');
      const isLocalOnly = Boolean(useAuthStore.getState().restaurant?.localStorageOnly);
      if (!isOfflineOrder && !isLocalOnly && typeof navigator !== 'undefined' && navigator.onLine) {
        await useAuthStore.getState().ensureAnonymousAuth();
        const firestoreUpdates = { ...updates, status: overallStatus };
        if (updates.prepStartedAt && !order.prepStartedAt) firestoreUpdates.prepStartedAt = serverTimestamp();
        if (updates.prepCompletedAt) firestoreUpdates.prepCompletedAt = serverTimestamp();
        await updateDoc(doc(db, 'restaurants', restaurantId, 'orders', order.id), firestoreUpdates);
      }
    } catch (e) {
      console.warn('[useKdsStore] updateKDSItemStatus cloud sync deferred:', e?.message);
    }
  },

  updateKDSStationStatus: async (restaurantId, order, stationName, newStatus) => {
    const toDate = (ts) => {
      if (!ts) return new Date();
      if (typeof ts.toDate === 'function') return ts.toDate();
      return new Date(ts);
    };

    const updatedItems = (order?.items || []).map(item => {
      if (stationName === 'All' || item.station === stationName) {
        return { ...item, status: newStatus };
      }
      return item;
    });

    const activeItems = updatedItems.filter(i => i.status !== 'cancelled' && i.status !== 'void');
    const hasPreparing = activeItems.some(i => i.status === 'preparing' || i.status === 'ready');
    const allReady = activeItems.length > 0 && activeItems.every(i => i.status === 'ready');

    let overallStatus = order.status;
    const updates = { items: updatedItems };

    if (newStatus === 'preparing' && (order.status === 'pending' || order.status === 'ready')) {
      overallStatus = 'preparing';
      updates.status = 'preparing';
      updates.prepStartedAt = order.prepStartedAt || new Date().toISOString();
    }

    const isOrderPaid = order.paid === true || (order.paymentMethod && order.paymentMethod !== 'unpaid');

    if (allReady) {
      const finalStatus = isOrderPaid ? 'billed' : 'ready';
      overallStatus = finalStatus;
      updates.status = finalStatus;
      updates.prepCompletedAt = new Date().toISOString();
      if (isOrderPaid) {
        updates.completedAt = new Date().toISOString();
      }
      
      const startTime = order.prepStartedAt ? toDate(order.prepStartedAt) : (order.createdAt ? toDate(order.createdAt) : new Date());
      const durationSeconds = Math.floor((new Date() - startTime) / 1000);
      updates.prepDuration = !isNaN(durationSeconds) && durationSeconds >= 0 ? durationSeconds : 0;
    } else if (hasPreparing && (overallStatus === 'pending' || overallStatus === 'ready')) {
      overallStatus = 'preparing';
      updates.status = 'preparing';
      updates.prepStartedAt = order.prepStartedAt || new Date().toISOString();
    }

    // 1. Optimistic local update in active orders & offline queue
    useOrderStore.getState().patchActiveOrder(order.id, {
      ...updates,
      status: overallStatus
    });
    useOfflineQueueStore.getState().updateQueuedOrder(order.id, {
      ...updates,
      status: overallStatus
    });

    // 2. Cloud sync if permitted, online, and not an offline order
    try {
      const isOfflineOrder = typeof order.id === 'string' && order.id.startsWith('offline_');
      const isLocalOnly = Boolean(useAuthStore.getState().restaurant?.localStorageOnly);
      if (!isOfflineOrder && !isLocalOnly && typeof navigator !== 'undefined' && navigator.onLine) {
        await useAuthStore.getState().ensureAnonymousAuth();
        const firestoreUpdates = { ...updates, status: overallStatus };
        if (updates.prepStartedAt && !order.prepStartedAt) firestoreUpdates.prepStartedAt = serverTimestamp();
        if (updates.prepCompletedAt) firestoreUpdates.prepCompletedAt = serverTimestamp();
        await updateDoc(doc(db, 'restaurants', restaurantId, 'orders', order.id), firestoreUpdates);
      }
    } catch (e) {
      console.warn('[useKdsStore] updateKDSStationStatus cloud sync deferred:', e?.message);
    }
  },
}));

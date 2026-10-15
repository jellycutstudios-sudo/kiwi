import { create } from 'zustand';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from './authStore';
import { useOrderStore } from './orderStore';

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

    if (newStatus === 'preparing' && order.status === 'pending') {
      overallStatus = 'preparing';
      updates.status = 'preparing';
      updates.prepStartedAt = new Date().toISOString();
    }

    if (allReady) {
      updates.status = 'ready';
      updates.prepCompletedAt = new Date().toISOString();
      
      const startTime = order.prepStartedAt ? toDate(order.prepStartedAt) : (order.createdAt ? toDate(order.createdAt) : new Date());
      const durationSeconds = Math.floor((new Date() - startTime) / 1000);
      updates.prepDuration = Math.max(0, durationSeconds);
    } else if (hasPreparing && overallStatus === 'pending') {
      updates.status = 'preparing';
      updates.prepStartedAt = new Date().toISOString();
    }

    // 1. Optimistic local update in active orders
    useOrderStore.getState().patchActiveOrder(order.id, {
      ...updates,
      status: overallStatus
    });

    // 2. Cloud sync if permitted and online
    try {
      const rest = useAuthStore.getState().restaurant;
      if (!rest?.localStorageOnly && typeof navigator !== 'undefined' && navigator.onLine) {
        await useAuthStore.getState().ensureAnonymousAuth();
        const firestoreUpdates = { ...updates };
        if (updates.prepStartedAt) firestoreUpdates.prepStartedAt = serverTimestamp();
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

    if (newStatus === 'preparing' && order.status === 'pending') {
      overallStatus = 'preparing';
      updates.status = 'preparing';
      updates.prepStartedAt = new Date().toISOString();
    }

    if (allReady) {
      updates.status = 'ready';
      updates.prepCompletedAt = new Date().toISOString();
      
      const startTime = order.prepStartedAt ? toDate(order.prepStartedAt) : (order.createdAt ? toDate(order.createdAt) : new Date());
      const durationSeconds = Math.floor((new Date() - startTime) / 1000);
      updates.prepDuration = Math.max(0, durationSeconds);
    } else if (hasPreparing && overallStatus === 'pending') {
      updates.status = 'preparing';
      updates.prepStartedAt = new Date().toISOString();
    }

    // 1. Optimistic local update in active orders
    useOrderStore.getState().patchActiveOrder(order.id, {
      ...updates,
      status: overallStatus
    });

    // 2. Cloud sync if permitted and online
    try {
      const rest = useAuthStore.getState().restaurant;
      if (!rest?.localStorageOnly && typeof navigator !== 'undefined' && navigator.onLine) {
        await useAuthStore.getState().ensureAnonymousAuth();
        const firestoreUpdates = { ...updates };
        if (updates.prepStartedAt) firestoreUpdates.prepStartedAt = serverTimestamp();
        if (updates.prepCompletedAt) firestoreUpdates.prepCompletedAt = serverTimestamp();
        await updateDoc(doc(db, 'restaurants', restaurantId, 'orders', order.id), firestoreUpdates);
      }
    } catch (e) {
      console.warn('[useKdsStore] updateKDSStationStatus cloud sync deferred:', e?.message);
    }
  },
}));

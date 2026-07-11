import { create } from 'zustand';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from './authStore';

export const useKdsStore = create(() => ({
  updateKDSItemStatus: async (restaurantId, order, itemIndex, newStatus) => {
    await useAuthStore.getState().ensureAnonymousAuth();
    const toDate = (ts) => {
      if (!ts) return new Date();
      if (typeof ts.toDate === 'function') return ts.toDate();
      return new Date(ts);
    };

    const updatedItems = order.items.map((item, idx) => {
      if (idx === itemIndex) {
        return { ...item, status: newStatus };
      }
      return item;
    });

    const hasPreparing = updatedItems.some(i => i.status === 'preparing' || i.status === 'ready');
    const allReady = updatedItems.every(i => i.status === 'ready');

    let overallStatus = order.status;
    const updates = { items: updatedItems };

    if (newStatus === 'preparing' && order.status === 'pending') {
      overallStatus = 'preparing';
      updates.status = 'preparing';
      updates.prepStartedAt = new Date();
    }

    if (allReady) {
      updates.status = 'ready';
      updates.prepCompletedAt = new Date();
      
      const startTime = order.prepStartedAt ? toDate(order.prepStartedAt) : (order.createdAt ? toDate(order.createdAt) : new Date());
      const durationSeconds = Math.floor((new Date() - startTime) / 1000);
      updates.prepDuration = Math.max(0, durationSeconds);
    } else if (hasPreparing && overallStatus === 'pending') {
      updates.status = 'preparing';
      updates.prepStartedAt = new Date();
    }

    await updateDoc(doc(db, 'restaurants', restaurantId, 'orders', order.id), updates);
  },

  updateKDSStationStatus: async (restaurantId, order, stationName, newStatus) => {
    await useAuthStore.getState().ensureAnonymousAuth();
    const toDate = (ts) => {
      if (!ts) return new Date();
      if (typeof ts.toDate === 'function') return ts.toDate();
      return new Date(ts);
    };

    const updatedItems = order.items.map(item => {
      if (stationName === 'All' || item.station === stationName) {
        return { ...item, status: newStatus };
      }
      return item;
    });

    const hasPreparing = updatedItems.some(i => i.status === 'preparing' || i.status === 'ready');
    const allReady = updatedItems.every(i => i.status === 'ready');

    let overallStatus = order.status;
    const updates = { items: updatedItems };

    if (newStatus === 'preparing' && order.status === 'pending') {
      overallStatus = 'preparing';
      updates.status = 'preparing';
      updates.prepStartedAt = new Date();
    }

    if (allReady) {
      updates.status = 'ready';
      updates.prepCompletedAt = new Date();
      
      const startTime = order.prepStartedAt ? toDate(order.prepStartedAt) : (order.createdAt ? toDate(order.createdAt) : new Date());
      const durationSeconds = Math.floor((new Date() - startTime) / 1000);
      updates.prepDuration = Math.max(0, durationSeconds);
    } else if (hasPreparing && overallStatus === 'pending') {
      updates.status = 'preparing';
      updates.prepStartedAt = new Date();
    }

    await updateDoc(doc(db, 'restaurants', restaurantId, 'orders', order.id), updates);
  },
}));

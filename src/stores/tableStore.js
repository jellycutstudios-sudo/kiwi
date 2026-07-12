// Table Store — floor plan, table status management
import { create } from 'zustand';
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from './authStore';

export const useTableStore = create((set, get) => ({
  tables: [],
  selectedTable: null,

  subscribe: (restaurantId) => {
    if (!restaurantId) return () => {};

    // --- DEMO ACCOUNT MOCK ---
    if (restaurantId === 'demo_rest') {
      set({ tables: [
        { id: 't1', name: 'T1', status: 'free', floor: 'Ground Floor', capacity: 4, shape: 'rect', x: 50, y: 50, w: 80, h: 80 },
        { id: 't2', name: 'T2', status: 'free', floor: 'Ground Floor', capacity: 2, shape: 'round', x: 200, y: 50, w: 80, h: 80 },
        { id: 't3', name: 'T3', status: 'free', floor: 'Ground Floor', capacity: 6, shape: 'rect', x: 50, y: 200, w: 120, h: 80 }
      ] });
      return () => {};
    }
    // -------------------------

    // Check if already subscribed to this restaurant
    if (get()._subscribedRestId === restaurantId && get()._activeUnsub) {
      return () => {}; // Return no-op because subscription is managed globally
    }

    // Clean up previous subscription if any
    if (get()._activeUnsub) {
      get()._activeUnsub();
    }

    const unsub = onSnapshot(
      collection(db, 'restaurants', restaurantId, 'tables'),
      (snap) => {
        set({ tables: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
      }
    );

    const cleanup = () => {
      unsub();
      set({ tables: [], _activeUnsub: null, _subscribedRestId: null });
    };

    set({ _activeUnsub: cleanup, _subscribedRestId: restaurantId });
    return cleanup;
  },
  _activeUnsub: null,
  _subscribedRestId: null,

  selectTable: (table) => set({ selectedTable: table }),
  clearSelection: () => set({ selectedTable: null }),

  addTable: async (restaurantId, tableData) => {
    await useAuthStore.getState().ensureAnonymousAuth();
    await addDoc(collection(db, 'restaurants', restaurantId, 'tables'), {
      name: tableData.name,
      capacity: tableData.capacity ?? 4,
      shape: tableData.shape ?? 'rect',
      status: 'free',
      x: tableData.x ?? 100,
      y: tableData.y ?? 100,
      w: tableData.w ?? 80,
      h: tableData.h ?? 80,
      currentOrderId: null,
      floor: tableData.floor ?? 'Ground Floor',
    });
  },

  updateTable: async (restaurantId, tableId, data) => {
    await useAuthStore.getState().ensureAnonymousAuth();
    await updateDoc(doc(db, 'restaurants', restaurantId, 'tables', tableId), data);
  },

  deleteTable: async (restaurantId, tableId) => {
    await useAuthStore.getState().ensureAnonymousAuth();
    await deleteDoc(doc(db, 'restaurants', restaurantId, 'tables', tableId));
  },

  setTableStatus: async (restaurantId, tableId, status, orderId = null) => {
    // --- DEMO ACCOUNT MOCK ---
    if (restaurantId === 'demo_rest') {
      set({
        tables: get().tables.map(t => t.id === tableId ? { ...t, status, currentOrderId: orderId } : t)
      });
      return;
    }
    // -------------------------

    await useAuthStore.getState().ensureAnonymousAuth();
    await updateDoc(doc(db, 'restaurants', restaurantId, 'tables', tableId), {
      status,
      currentOrderId: orderId,
    });
  },

  freeTable: async (restaurantId, tableId) => {
    // --- DEMO ACCOUNT MOCK ---
    if (restaurantId === 'demo_rest') {
      await get().setTableStatus(restaurantId, tableId, 'free', null);
      return;
    }
    // -------------------------

    await useAuthStore.getState().ensureAnonymousAuth();
    await get().setTableStatus(restaurantId, tableId, 'free', null);
  },
}));

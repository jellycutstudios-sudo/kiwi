// Table Store — floor plan, table status management
import { create } from 'zustand';
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from './authStore';

export const useTableStore = create((set, get) => {
  let activeUnsub = null;
  let subscribedRestId = null;
  let subCount = 0;

  return {
    tables: [],
    selectedTable: null,

    subscribe: (restaurantId) => {
      if (!restaurantId) return () => {};

      // Check if already subscribed to this restaurant
      if (subscribedRestId === restaurantId && activeUnsub) {
        subCount++;
        return () => {
          subCount--;
          if (subCount <= 0 && activeUnsub) {
            activeUnsub();
            activeUnsub = null;
            subscribedRestId = null;
            subCount = 0;
          }
        };
      }

      // Clean up previous subscription if any
      if (activeUnsub) {
        activeUnsub();
        activeUnsub = null;
        subCount = 0;
      }

      subscribedRestId = restaurantId;
      subCount = 1;

      const unsub = onSnapshot(
        collection(db, 'restaurants', restaurantId, 'tables'),
        (snap) => {
          set({ tables: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
        }
      );

      activeUnsub = () => {
        unsub();
        set({ tables: [] });
      };

      return () => {
        subCount--;
        if (subCount <= 0 && activeUnsub) {
          activeUnsub();
          activeUnsub = null;
          subscribedRestId = null;
          subCount = 0;
        }
      };
    },

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
    await useAuthStore.getState().ensureAnonymousAuth();
    await updateDoc(doc(db, 'restaurants', restaurantId, 'tables', tableId), {
      status,
      currentOrderId: orderId,
    });
  },

  freeTable: async (restaurantId, tableId) => {
    await useAuthStore.getState().ensureAnonymousAuth();
    await get().setTableStatus(restaurantId, tableId, 'free', null);
  },
  };
});

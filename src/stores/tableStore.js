// Table Store — floor plan, table status management
import { create } from 'zustand';
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from './authStore';

const getInitialTables = () => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem('dineos_cached_tables');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const useTableStore = create((set, get) => {
  let activeUnsub = null;
  let subscribedRestId = null;
  let subCount = 0;

  return {
    tables: getInitialTables(),
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
          const tbls = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('dineos_cached_tables', JSON.stringify(tbls));
            }
          } catch (e) {
            console.debug('[useTableStore] LocalStorage cache write skipped:', e);
          }
          set({ tables: tbls });
        }
      );

      activeUnsub = () => {
        unsub();
        // Retain tables in memory so offline view never goes blank
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
    const newTable = {
      id: `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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
    };
    set(s => {
      const updated = [...s.tables, newTable];
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('dineos_cached_tables', JSON.stringify(updated));
        }
      } catch {}
      return { tables: updated };
    });

    try {
      const rest = useAuthStore.getState().restaurant;
      if (!rest?.localStorageOnly && typeof navigator !== 'undefined' && navigator.onLine) {
        await useAuthStore.getState().ensureAnonymousAuth();
        const docRef = await addDoc(collection(db, 'restaurants', restaurantId, 'tables'), {
          ...newTable,
          id: undefined // let Firestore assign doc id
        });
        // Swap local id with real docRef id
        set(s => {
          const updated = s.tables.map(t => t.id === newTable.id ? { ...t, id: docRef.id } : t);
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('dineos_cached_tables', JSON.stringify(updated));
            }
          } catch {}
          return { tables: updated };
        });
      }
    } catch (e) {
      console.warn('[useTableStore] addTable cloud sync deferred:', e?.message);
    }
  },

  updateTable: async (restaurantId, tableId, data) => {
    set(s => {
      const updated = s.tables.map(t => t.id === tableId ? { ...t, ...data } : t);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('dineos_cached_tables', JSON.stringify(updated));
        }
      } catch {}
      return { tables: updated };
    });

    try {
      const rest = useAuthStore.getState().restaurant;
      if (!rest?.localStorageOnly && typeof navigator !== 'undefined' && navigator.onLine) {
        await useAuthStore.getState().ensureAnonymousAuth();
        await updateDoc(doc(db, 'restaurants', restaurantId, 'tables', tableId), data);
      }
    } catch (e) {
      console.warn('[useTableStore] updateTable cloud sync deferred:', e?.message);
    }
  },

  deleteTable: async (restaurantId, tableId) => {
    set(s => {
      const updated = s.tables.filter(t => t.id !== tableId);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('dineos_cached_tables', JSON.stringify(updated));
        }
      } catch {}
      return { tables: updated };
    });

    try {
      const rest = useAuthStore.getState().restaurant;
      if (!rest?.localStorageOnly && typeof navigator !== 'undefined' && navigator.onLine) {
        await useAuthStore.getState().ensureAnonymousAuth();
        await deleteDoc(doc(db, 'restaurants', restaurantId, 'tables', tableId));
      }
    } catch (e) {
      console.warn('[useTableStore] deleteTable cloud sync deferred:', e?.message);
    }
  },

  setTableStatus: async (restaurantId, tableId, status, orderId = null) => {
    set(s => {
      const updated = s.tables.map(t => t.id === tableId ? { ...t, status, currentOrderId: orderId } : t);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('dineos_cached_tables', JSON.stringify(updated));
        }
      } catch {}
      return { tables: updated };
    });

    try {
      const rest = useAuthStore.getState().restaurant;
      if (!rest?.localStorageOnly && typeof navigator !== 'undefined' && navigator.onLine) {
        await useAuthStore.getState().ensureAnonymousAuth();
        await updateDoc(doc(db, 'restaurants', restaurantId, 'tables', tableId), {
          status,
          currentOrderId: orderId,
        });
      }
    } catch (e) {
      console.warn('[useTableStore] setTableStatus cloud sync deferred:', e?.message);
    }
  },

  freeTable: async (restaurantId, tableId) => {
    await get().setTableStatus(restaurantId, tableId, 'free', null);
  },
  };
});

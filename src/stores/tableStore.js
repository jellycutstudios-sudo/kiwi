// Table Store — floor plan, table status management
import { create } from 'zustand';
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from './authStore';

const getInitialTables = (restaurantId = null) => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const key = restaurantId ? `dineos_cached_tables_${restaurantId}` : 'dineos_cached_tables';
    const raw = localStorage.getItem(key);
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

      // Load cached tables for this specific restaurant immediately
      const cached = getInitialTables(restaurantId);
      if (cached.length > 0 && subscribedRestId !== restaurantId) {
        set({ tables: cached });
      }

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
          const cloudTables = snap.docs.map(d => ({ id: d.id, ...d.data() }));

          set(state => {
            // Keep any locally created table that hasn't synced to cloud yet
            const cloudTableIds = new Set(cloudTables.map(t => t.id));
            const pendingLocal = state.tables.filter(t => !cloudTableIds.has(t.id) && t._isLocalPending);
            const merged = [...cloudTables, ...pendingLocal];

            try {
              if (typeof localStorage !== 'undefined' && restaurantId) {
                localStorage.setItem(`dineos_cached_tables_${restaurantId}`, JSON.stringify(merged));
              }
            } catch (e) {
              console.debug('[useTableStore] LocalStorage cache write skipped:', e);
            }

            return { tables: merged };
          });
        },
        (error) => {
          console.warn('[useTableStore] onSnapshot subscription notice:', error?.message);
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
      // Generate authoritative Firestore doc ID upfront to eliminate race conditions & duplicate keys
      let tableId = tableData.id;
      if (!tableId && restaurantId) {
        try {
          const colRef = collection(db, 'restaurants', restaurantId, 'tables');
          tableId = doc(colRef).id;
        } catch {
          tableId = `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        }
      } else if (!tableId) {
        tableId = `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      }

      const newTable = {
        id: tableId,
        name: tableData.name,
        capacity: Number(tableData.capacity) || 4,
        shape: tableData.shape ?? 'rect',
        status: tableData.status ?? 'free',
        x: tableData.x ?? 100,
        y: tableData.y ?? 100,
        w: tableData.w ?? (tableData.shape === 'rect' && (Number(tableData.capacity) || 4) > 4 ? 120 : 90),
        h: tableData.h ?? (tableData.shape === 'rect' && (Number(tableData.capacity) || 4) > 4 ? 80 : 90),
        currentOrderId: null,
        activeOrderId: null,
        floor: tableData.floor ?? 'Ground Floor',
        section: tableData.section || tableData.floor || 'Ground Floor',
        _isLocalPending: true,
      };

      set(s => {
        const filtered = s.tables.filter(t => t.id !== newTable.id);
        const updated = [...filtered, newTable];
        try {
          if (typeof localStorage !== 'undefined' && restaurantId) {
            localStorage.setItem(`dineos_cached_tables_${restaurantId}`, JSON.stringify(updated));
          }
        } catch {}
        return { tables: updated };
      });

      // Always commit to Firestore (Firestore persistent cache handles offline & online sync)
      if (restaurantId && db) {
        (async () => {
          try {
            await useAuthStore.getState().ensureAnonymousAuth?.().catch?.(() => {});
            const docRef = doc(db, 'restaurants', restaurantId, 'tables', newTable.id);
            const { _isLocalPending: _, ...firestorePayload } = newTable;
            await setDoc(docRef, firestorePayload);
          } catch (e) {
            console.warn('[useTableStore] addTable cloud sync queued in local cache:', e?.message);
          }
        })();
      }

      return newTable;
    },

    updateTable: async (restaurantId, tableId, data) => {
      set(s => {
        const updated = s.tables.map(t => t.id === tableId ? { ...t, ...data } : t);
        try {
          if (typeof localStorage !== 'undefined' && restaurantId) {
            localStorage.setItem(`dineos_cached_tables_${restaurantId}`, JSON.stringify(updated));
          }
        } catch {}
        return { tables: updated };
      });

      if (restaurantId && db) {
        (async () => {
          try {
            await useAuthStore.getState().ensureAnonymousAuth?.().catch?.(() => {});
            await updateDoc(doc(db, 'restaurants', restaurantId, 'tables', tableId), data);
          } catch (e) {
            console.warn('[useTableStore] updateTable cloud sync deferred:', e?.message);
          }
        })();
      }
    },

    deleteTable: async (restaurantId, tableId) => {
      set(s => {
        const updated = s.tables.filter(t => t.id !== tableId);
        try {
          if (typeof localStorage !== 'undefined' && restaurantId) {
            localStorage.setItem(`dineos_cached_tables_${restaurantId}`, JSON.stringify(updated));
          }
        } catch {}
        return { tables: updated };
      });

      if (restaurantId && db) {
        (async () => {
          try {
            await useAuthStore.getState().ensureAnonymousAuth?.().catch?.(() => {});
            await deleteDoc(doc(db, 'restaurants', restaurantId, 'tables', tableId));
          } catch (e) {
            console.warn('[useTableStore] deleteTable cloud sync deferred:', e?.message);
          }
        })();
      }
    },

    setTableStatus: async (restaurantId, tableId, status, orderId = null) => {
      const payload = {
        status,
        currentOrderId: orderId,
        activeOrderId: orderId,
      };

      set(s => {
        const updated = s.tables.map(t => t.id === tableId ? { ...t, ...payload } : t);
        try {
          if (typeof localStorage !== 'undefined' && restaurantId) {
            localStorage.setItem(`dineos_cached_tables_${restaurantId}`, JSON.stringify(updated));
          }
        } catch {}
        return { tables: updated };
      });

      if (restaurantId && db) {
        (async () => {
          try {
            await useAuthStore.getState().ensureAnonymousAuth?.().catch?.(() => {});
            await updateDoc(doc(db, 'restaurants', restaurantId, 'tables', tableId), payload);
          } catch (e) {
            console.warn('[useTableStore] setTableStatus cloud sync deferred:', e?.message);
          }
        })();
      }
    },

    freeTable: async (restaurantId, tableId) => {
      await get().setTableStatus(restaurantId, tableId, 'free', null);
    },

    updateTableStatus: async (restaurantId, tableId, status, orderId = null) => {
      await get().setTableStatus(restaurantId, tableId, status, orderId);
    },
  };
});

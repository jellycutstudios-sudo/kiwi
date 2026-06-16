import { create } from 'zustand';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const useMenuStore = create((set) => {
  let activeUnsub = null;
  let subscribedRestId = null;

  return {
    categories: [],
    loading: true,
    error: null,
    search: '',
    setSearch: (search) => set({ search }),

    subscribeMenu: (restaurantId) => {
      if (!restaurantId) return () => {};

      // If already subscribed to this restaurant, return the current unsub
      if (subscribedRestId === restaurantId && activeUnsub) {
        return activeUnsub;
      }

      // Clean up previous subscription if any
      if (activeUnsub) {
        activeUnsub();
        activeUnsub = null;
      }

      set({ loading: true, error: null });
      subscribedRestId = restaurantId;

      const q = collection(db, 'restaurants', restaurantId, 'menu');
      const unsub = onSnapshot(
        q,
        (snap) => {
          const cats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          set({ categories: cats, loading: false });
        },
        (err) => {
          console.error('[useMenuStore] Subscription error:', err);
          set({ error: err.message, loading: false });
        }
      );

      activeUnsub = () => {
        unsub();
        activeUnsub = null;
        subscribedRestId = null;
        set({ categories: [], loading: true });
      };

      return activeUnsub;
    },

    unsubscribeMenu: () => {
      if (activeUnsub) {
        activeUnsub();
      }
    },
  };
});

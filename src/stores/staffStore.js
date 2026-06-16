import { create } from 'zustand';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const useStaffStore = create((set, get) => {
  let activeUnsub = null;
  let subscribedRestId = null;

  return {
    staff: [],
    loading: true,
    error: null,

    subscribeStaff: (restaurantId) => {
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

      const q = collection(db, 'restaurants', restaurantId, 'staff');
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          set({ staff: list, loading: false });
        },
        (err) => {
          console.error('[useStaffStore] Subscription error:', err);
          set({ error: err.message, loading: false });
        }
      );

      activeUnsub = () => {
        unsub();
        activeUnsub = null;
        subscribedRestId = null;
        set({ staff: [], loading: true });
      };

      return activeUnsub;
    },

    unsubscribeStaff: () => {
      if (activeUnsub) {
        activeUnsub();
      }
    },
  };
});

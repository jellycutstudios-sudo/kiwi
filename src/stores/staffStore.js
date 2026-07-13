import { create } from 'zustand';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const useStaffStore = create((set) => {
  let activeUnsub = null;
  let subscribedRestId = null;
  let subCount = 0;

  return {
    staff: [],
    loading: true,
    error: null,

    subscribeStaff: (restaurantId) => {
      if (!restaurantId) return () => {};

      // If already subscribed to this restaurant, just increment the reference count
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

      // Clean up previous subscription if switching restaurants
      if (activeUnsub) {
        activeUnsub();
        activeUnsub = null;
        subCount = 0;
      }

      set({ loading: true, error: null });
      subscribedRestId = restaurantId;
      subCount = 1;

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
        set({ staff: [], loading: true });
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

    unsubscribeStaff: () => {
      if (activeUnsub) {
        activeUnsub();
        activeUnsub = null;
        subscribedRestId = null;
        subCount = 0;
      }
    },
  };
});

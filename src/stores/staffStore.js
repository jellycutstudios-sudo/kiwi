import { create } from 'zustand';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const getInitialStaff = () => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem('dineos_cached_staff');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const useStaffStore = create((set) => {
  let activeUnsub = null;
  let subscribedRestId = null;
  let subCount = 0;
  const initialStaff = getInitialStaff();

  return {
    staff: initialStaff,
    loading: initialStaff.length === 0,
    error: null,

    setStaffList: (list) => {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('dineos_cached_staff', JSON.stringify(list));
        }
      } catch {}
      set({ staff: list });
    },

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

      const cached = getInitialStaff();
      set({ staff: cached, loading: cached.length === 0, error: null });
      subscribedRestId = restaurantId;
      subCount = 1;

      const q = collection(db, 'restaurants', restaurantId, 'staff');
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('dineos_cached_staff', JSON.stringify(list));
            }
          } catch {}
          set({ staff: list, loading: false });
        },
        (err) => {
          console.error('[useStaffStore] Subscription error:', err);
          set({ error: err.message, loading: false });
        }
      );

      activeUnsub = () => {
        unsub();
        // Retain staff in memory so offline views and PIN logins are never lost
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

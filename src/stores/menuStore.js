import { create } from 'zustand';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const getInitialCategories = () => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem('dineos_cached_menu');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const useMenuStore = create((set) => {
  let activeUnsub = null;
  let subscribedRestId = null;
  let subCount = 0;
  const initialCats = getInitialCategories();

  return {
    categories: initialCats,
    loading: initialCats.length === 0,
    error: null,
    search: '',
    setSearch: (search) => set({ search }),

    menuDensity: typeof localStorage !== 'undefined' ? localStorage.getItem('kiwi_pos_density') || 'visual' : 'visual',
    setMenuDensity: (menuDensity) => {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('kiwi_pos_density', menuDensity);
      } catch {}
      set({ menuDensity });
    },

    isFocusMode: typeof localStorage !== 'undefined' ? localStorage.getItem('kiwi_pos_focus') === 'true' : false,
    setIsFocusMode: (action) => {
      set((state) => {
        const nextVal = typeof action === 'function' ? action(state.isFocusMode) : action;
        try {
          if (typeof localStorage !== 'undefined') localStorage.setItem('kiwi_pos_focus', String(nextVal));
        } catch {}
        if (typeof document !== 'undefined') {
          if (nextVal) {
            document.body.classList.add('pos-focus-mode');
          } else {
            document.body.classList.remove('pos-focus-mode');
          }
        }
        return { isFocusMode: nextVal };
      });
    },

    subscribeMenu: (restaurantId) => {
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

      // If we have cached categories, keep them visible so there is zero flicker
      const cached = getInitialCategories();
      set({ loading: cached.length === 0, error: null });
      subscribedRestId = restaurantId;
      subCount = 1;

      const q = collection(db, 'restaurants', restaurantId, 'menu');
      const unsub = onSnapshot(
        q,
        (snap) => {
          const cats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('dineos_cached_menu', JSON.stringify(cats));
            }
          } catch (e) {
            console.debug('[useMenuStore] LocalStorage cache write skipped:', e);
          }
          set({ categories: cats, loading: false });
        },
        (err) => {
          console.error('[useMenuStore] Subscription error:', err);
          set({ error: err.message, loading: false });
        }
      );

      activeUnsub = () => {
        unsub();
        // Do not clear categories on unsub so offline/tab switching retains the menu instantly
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

    unsubscribeMenu: () => {
      if (activeUnsub) {
        activeUnsub();
        activeUnsub = null;
        subscribedRestId = null;
        subCount = 0;
      }
    },
  };
});

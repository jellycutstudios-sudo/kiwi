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

export function checkHasMenuImages(categories) {
  if (!Array.isArray(categories) || categories.length === 0) return false;
  return categories.some((cat) =>
    Array.isArray(cat?.items) &&
    cat.items.some((item) => {
      const img = item?.imageUrl || item?.image;
      return typeof img === 'string' && img.trim().length > 0;
    })
  );
}

const getInitialDensity = (cats) => {
  if (typeof localStorage === 'undefined') return 'visual';
  const saved = localStorage.getItem('kiwi_pos_density');
  const isManual = localStorage.getItem('kiwi_pos_density_manual') === 'true';

  // If user explicitly chose a manual setting, honor it
  if (isManual && (saved === 'dense' || saved === 'visual')) {
    return saved;
  }

  // Automatic decide: 0 images -> Fast Keys ('dense'); >= 1 image -> Cards ('visual')
  if (Array.isArray(cats) && cats.length > 0) {
    return checkHasMenuImages(cats) ? 'visual' : 'dense';
  }

  return saved || 'visual';
};

export const useMenuStore = create((set, get) => {
  let activeUnsub = null;
  let subscribedRestId = null;
  let subCount = 0;
  const initialCats = getInitialCategories();
  const initialDensity = getInitialDensity(initialCats);

  return {
    categories: initialCats,
    loading: initialCats.length === 0,
    error: null,
    search: '',
    setSearch: (search) => set({ search }),

    menuDensity: initialDensity,
    hasImages: checkHasMenuImages(initialCats),

    setMenuDensity: (menuDensity, isManual = false) => {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('kiwi_pos_density', menuDensity);
          if (isManual) {
            localStorage.setItem('kiwi_pos_density_manual', 'true');
          }
        }
      } catch {}
      set({ menuDensity });
    },

    setCategories: (cats) => {
      const hasImages = checkHasMenuImages(cats);
      const isManual = typeof localStorage !== 'undefined' && localStorage.getItem('kiwi_pos_density_manual') === 'true';
      const prevHadImages = get().hasImages ?? checkHasMenuImages(get().categories);
      const imagePresenceChanged = get().hasImages !== undefined && prevHadImages !== hasImages;

      let nextDensity = get().menuDensity;

      // Auto-switch rule:
      // 1. If not manually locked, auto-select based on images
      // 2. OR if image presence transitioned (e.g. uploaded first image or removed all images), auto-switch immediately!
      if (!isManual || imagePresenceChanged) {
        if (hasImages) {
          nextDensity = 'visual'; // Switch to Cards view
        } else if (cats.length > 0) {
          nextDensity = 'dense';  // Switch to Fast Keys view
        }

        if (imagePresenceChanged) {
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('kiwi_pos_density', nextDensity);
              localStorage.removeItem('kiwi_pos_density_manual');
            }
          } catch {}
        }
      }

      set({
        categories: cats,
        loading: false,
        hasImages,
        menuDensity: nextDensity,
      });
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
          get().setCategories(cats);
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

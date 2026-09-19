// Token Store — manages token issuance and TV display
import { create } from 'zustand';
import {
  doc, onSnapshot, runTransaction, serverTimestamp, setDoc, increment
} from 'firebase/firestore';
import { db } from '../firebase';
import { getTodayKey } from '../utils/timezoneUtils';
import { useAuthStore } from './authStore';

const todayKey = () => {
  const restaurant = useAuthStore.getState().restaurant;
  return getTodayKey(restaurant);
};

export const useTokenStore = create((set, get) => ({
  currentServing: null,
  latestIssued:   null,
  queue:          [],
  loading:        false,

  // Issue the next token (returns token number, 100% resilient online and offline)
  issueToken: async (restaurantId) => {
    const tKey = todayKey();
    const tokenRef = doc(db, 'restaurants', restaurantId, 'tokens', tKey);
    const localKey = `dineos_token_seq_${restaurantId}_${tKey}`;

    // Fast-path for offline mode: generate sequence immediately without waiting on network
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const stored = parseInt(localStorage.getItem(localKey) || '0', 10);
        const inMem = get().latestIssued || 0;
        const next = Math.max(stored, inMem) + 1;
        localStorage.setItem(localKey, next.toString());
        set({ latestIssued: next });
        // Queue Firestore mutation into IndexedDB persistence
        setDoc(tokenRef, { latest: increment(1) }, { merge: true }).catch(() => {});
        return next;
      } catch (err) {
        console.warn('Offline token fallback error:', err);
      }
    }

    try {
      const newToken = await runTransaction(db, async (tx) => {
        const snap = await tx.get(tokenRef);
        const latest = snap.exists() ? (snap.data().latest ?? 0) : 0;
        const next = latest + 1;
        tx.set(tokenRef, {
          latest: next,
          current: snap.exists() ? (snap.data().current ?? 0) : 0,
        }, { merge: true });
        return next;
      });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(localKey, newToken.toString());
      }
      set({ latestIssued: newToken });
      return newToken;
    } catch (e) {
      console.warn('Token transaction failed (falling back to offline sequence):', e);
      try {
        const stored = parseInt(localStorage.getItem(localKey) || '0', 10);
        const inMem = get().latestIssued || 0;
        const next = Math.max(stored, inMem) + 1;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(localKey, next.toString());
        }
        set({ latestIssued: next });
        setDoc(tokenRef, { latest: increment(1) }, { merge: true }).catch(() => {});
        return next;
      } catch (fallbackErr) {
        console.error('Fatal token fallback error:', fallbackErr);
        return 1;
      }
    }
  },


  // Call a specific token number directly (cashier/KDS action)
  callSpecificToken: async (restaurantId, tokenNumber) => {
    const tokenRef = doc(db, 'restaurants', restaurantId, 'tokens', todayKey());
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(tokenRef);
      tx.set(tokenRef, {
        current: Number(tokenNumber),
        latest: snap.exists() ? (snap.data().latest ?? Number(tokenNumber)) : Number(tokenNumber),
        lastCalledAt: serverTimestamp()
      }, { merge: true });
    });
  },

  // Subscribe to real-time token state (for TV display and cashier)
  subscribe: (restaurantId) => {
    let currentUnsub = null;
    let timeoutId = null;

    const setupSubscription = () => {
      if (currentUnsub) currentUnsub();
      
      const tokenRef = doc(db, 'restaurants', restaurantId, 'tokens', todayKey());
      currentUnsub = onSnapshot(tokenRef, (snap) => {
        if (snap.exists()) {
          const { current = 0, latest = 0, lastCalledAt = null } = snap.data();
          const callTime = lastCalledAt?.toDate ? lastCalledAt.toDate().getTime() : Date.now();
          const queue = Array.from(
            { length: Math.max(0, latest - current) },
            (_, i) => current + i + 1
          ).slice(0, 10);
          set({ currentServing: current, latestIssued: latest, queue, lastCalledAt: callTime });
        } else {
          set({ currentServing: 0, latestIssued: 0, queue: [], lastCalledAt: null });
        }
      });

      // Calculate time until midnight to reset subscription
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const msUntilMidnight = tomorrow - now;
      
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setupSubscription(); // Re-subscribe when the day changes
      }, msUntilMidnight + 1000); // Add 1 second buffer
    };

    setupSubscription();

    return () => {
      if (currentUnsub) currentUnsub();
      if (timeoutId) clearTimeout(timeoutId);
    };
  },
}));
